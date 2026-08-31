/**
 * App lifecycle.
 *
 * Ledge is a tray-resident app with no primary window: closing every panel is
 * not a reason to quit, and quitting happens only from the tray or
 * `app:quit`. This file owns the order things come up in and, more importantly,
 * the order they come down in — global shortcuts, the cursor poll and the tray
 * all hold OS-level resources that outlive a window.
 *
 * Note on hardware acceleration: Edge-Drop called
 * `app.disableHardwareAcceleration()` to stop a transparent always-on-top
 * window from flickering on some Windows GPUs. We deliberately do NOT do that
 * here. The Gauge animates SVG rings continuously, and software compositing
 * turns that into a visible frame-rate drop on exactly the low-end machines the
 * setting was meant to help. If the flicker resurfaces, fix it per-GPU with a
 * targeted switch rather than disabling acceleration for everyone.
 */
import { app, BrowserWindow, protocol } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PanelId } from '../../shared/ipc'
import type { CollapseStrategy, Settings } from '../../shared/types/settings'
import { getPlatform } from '../platform'
import { configureQuota, refresh } from '../features/quota'
import {
  createClipboardEngine,
  registerLedgeProtocol,
  PRIVILEGED_SCHEME,
  LEDGE_PRIVILEGES,
  type ClipboardEngine
} from '../features/clipboard'
import { loadSettings, onSettingsChanged, saveSettings } from '../store/settings'
import { PanelHost, type EdgePanelId } from './panels/PanelHost'
import { closeSettingsWindow, getSettingsWindow, openSettingsWindow } from './panels/settingsWindow'
import { createCursorPoll, type CursorPoll, type EdgeTarget } from './edge/cursorPoll'
import { broadcast, registerClipboardIpc, registerCoreIpc, registerShelfPlaceholders } from './ipc'

// The ledge:// scheme must be declared privileged before the app is ready, so
// the renderer can load clipboard thumbnails through it. Registering the
// streaming handler itself happens after ready (in bootstrap).
protocol.registerSchemesAsPrivileged([{ scheme: PRIVILEGED_SCHEME, privileges: LEDGE_PRIVILEGES }])
import { applyHotkeys, unregisterHotkeys } from './hotkeys'
import { createTray, type TrayController } from './tray'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Open width of each panel, in DIP. */
const PANEL_WIDTH: Record<EdgePanelId, number> = { shelf: 360, gauge: 320 }
/** The sliver left at the edge when a panel is collapsed by resizing. */
const GRIP_PX = 6

let quitting = false
let tray: TrayController | null = null
let poll: CursorPoll | null = null
let quotaTimer: ReturnType<typeof setInterval> | null = null
let clipboard: ClipboardEngine | null = null

const panels = new Map<EdgePanelId, PanelHost>()

/**
 * In dev, electron-vite serves the renderers and exports the origin. In a
 * packaged app the same three entries are files next to the main bundle. The
 * directory name matches the Rollup input name in electron.vite.config.ts.
 */
function htmlEntry(name: string): string {
  const devServer = process.env['ELECTRON_RENDERER_URL']
  return devServer !== undefined && devServer !== ''
    ? `${devServer}/${name}/index.html`
    : join(HERE, '../renderer', name, 'index.html')
}

function preloadPath(): string {
  // `.cjs`, not `.js` — see the preload output config in electron.vite.config.ts.
  return join(HERE, '../preload/index.cjs')
}

/**
 * Which collapse strategy this machine can use. It is derived, not stored:
 * persisting it would let a settings file copied from a Windows machine to a
 * Linux one leave the panels permanently blocking the desktop.
 */
function collapseStrategyFor(clickThrough: boolean): CollapseStrategy {
  return clickThrough ? 'clickthrough' : 'resize'
}

function panelIdFor(webContentsId: number): PanelId {
  for (const [id, host] of panels) {
    if (host.window?.webContents.id === webContentsId) return id
  }
  // Anything that is not an edge panel is the Settings window; it is the only
  // other renderer this app creates.
  return 'settings'
}

function openSettings(): void {
  openSettingsWindow({ preloadPath: preloadPath(), htmlEntry: htmlEntry('settings') })
}

/**
 * One panel now, not two. The user asked for a single unified frame rather
 * than mirrored panels on both edges, so the Shelf and the Gauge are composed
 * together inside one right-docked `hub` renderer. The internal panel id stays
 * `shelf` so the cursor-poll routing, the toggle wiring and the push channels
 * keep working unchanged; only its renderer and content changed. `gauge:*`
 * pushes still reach it because `broadcast` sends to every live panel.
 */
function syncPanels(settings: Settings): void {
  const platform = getPlatform()
  const strategy = collapseStrategyFor(platform.capabilities.clickThrough)

  const id: EdgePanelId = 'shelf'
  const existing = panels.get(id)

  // The hub is only absent if BOTH features are switched off — an empty frame
  // helps no one.
  if (!settings.shelf.enabled && !settings.gauge.enabled) {
    existing?.destroy()
    panels.delete(id)
    return
  }

  const layout = {
    heightRatio: settings.shelf.heightRatio,
    triggerAlign: settings.shelf.triggerAlign
  }

  if (existing) {
    existing.update({ side: settings.shelf.side, collapseStrategy: strategy }, layout)
    return
  }

  const host = new PanelHost(
    {
      id,
      side: settings.shelf.side,
      width: PANEL_WIDTH[id],
      gripPx: GRIP_PX,
      collapseStrategy: strategy,
      htmlEntry: htmlEntry('hub')
    },
    layout,
    { platform, preloadPath: preloadPath() }
  )
  host.create()
  panels.set(id, host)
}

function edgeTargets(settings: Settings): EdgeTarget[] {
  const targets: EdgeTarget[] = []
  for (const [id, host] of panels) {
    targets.push({
      id,
      side: host.side,
      workArea: () => host.workArea(),
      triggerRect: () => host.triggerRect(),
      isOpen: () => host.isOpen(),
      // Only the Shelf exposes a proximity setting; the Gauge follows it so the
      // two edges feel the same rather than needing two calibrations.
      proximityPx: () => Math.max(settings.shelf.edgeProximityPx, host.gripPx)
    })
  }
  return targets
}

function scheduleQuota(settings: Settings): void {
  if (quotaTimer !== null) {
    clearInterval(quotaTimer)
    quotaTimer = null
  }
  if (!settings.gauge.enabled) return

  const run = (): void => {
    // Unforced: the quota engine owns the per-provider TTLs and back-off, so
    // this interval is only a clock asking "anything new?" — not a mandate to
    // shell out to six CLIs every minute.
    void refresh()
      .then((snapshot) => {
        broadcast('gauge:snapshot', snapshot)
      })
      .catch((err: unknown) => {
        console.error('[quota] refresh failed', err)
      })
  }

  quotaTimer = setInterval(run, settings.gauge.refreshIntervalMs)
  run()
}

function teardown(): void {
  if (quitting) return
  quitting = true

  poll?.stop()
  poll = null

  if (quotaTimer !== null) {
    clearInterval(quotaTimer)
    quotaTimer = null
  }

  // Persist history synchronously and flush staged temp files before the
  // process exits — an async persist here would race the quit.
  clipboard?.stop()
  clipboard = null

  // Global shortcuts are held by the OS, not the process — releasing them
  // before exit is what stops a crashed-and-restarted Ledge from finding its
  // own hotkeys "in use by another application".
  unregisterHotkeys()

  tray?.destroy()
  tray = null

  for (const host of panels.values()) host.destroy()
  panels.clear()
  closeSettingsWindow()
}

/**
 * A second launch must not create a second set of always-on-top panels. The
 * lock is taken before anything else so the duplicate exits before it has
 * spent time building windows.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // Someone ran Ledge again — usually by double-clicking the shortcut while
    // it was already in the tray. Show them it is running.
    const settings = loadSettings()
    if (settings.shelf.enabled) panels.get('shelf')?.open()
    getSettingsWindow()?.focus()
  })

  app.whenReady().then(bootstrap).catch((err: unknown) => {
    console.error('[main] failed to start', err)
    app.exit(1)
  })
}

function bootstrap(): void {
  // Windows groups taskbar entries and routes notifications by this id; it has
  // to match the electron-builder appId or toasts arrive unattributed.
  app.setAppUserModelId('com.ledge.app')
  // No Dock icon on macOS: Ledge lives in the menu bar. Undefined elsewhere,
  // so no platform test is needed.
  app.dock?.hide()

  const platform = getPlatform()
  const settings = loadSettings()

  // `getSettings` is a live read, not a snapshot: the engine picks up a changed
  // provider list or threshold on its next cycle without being reconfigured.
  configureQuota({ platform, getSettings: () => loadSettings().gauge })

  // Boot the clipboard engine and serve its images before wiring IPC, so the
  // first `shelf:list` the renderer sends already hits the real store.
  registerLedgeProtocol()
  clipboard = createClipboardEngine({
    platform,
    getSettings: loadSettings,
    onItems: (items) => broadcast('shelf:items', items)
  })
  clipboard.start()
  clipboard.pause(settings.shelf.incognito)

  registerShelfPlaceholders()
  registerClipboardIpc(clipboard)
  registerCoreIpc({
    platform,
    getPanel: (id) => panels.get(id),
    panelIdFor,
    openSettings,
    quit: () => {
      app.quit()
    }
  })

  syncPanels(settings)

  tray = createTray({
    platform,
    getSettings: loadSettings,
    getPanel: (id) => panels.get(id),
    openSettings,
    refreshQuota: () => {
      // Forced: a person who clicked "refresh now" is telling us the cached
      // reading is wrong, so honouring a TTL here would be perverse.
      void refresh({ force: true })
        .then((snapshot) => {
          broadcast('gauge:snapshot', snapshot)
        })
        .catch((err: unknown) => {
          console.error('[quota] manual refresh failed', err)
        })
    },
    setAutostart: (enabled) => {
      void platform.setAutostart(enabled).catch((err: unknown) => {
        console.error('[autostart] could not be written', err)
      })
      saveSettings({ launchAtLogin: enabled })
    },
    quit: () => {
      app.quit()
    }
  })

  applyHotkeysFromSettings(settings)

  poll = createCursorPoll({
    targets: () => edgeTargets(loadSettings()),
    emit: (id, event) => {
      // The main process reports the cursor; the renderer owns the dwell timing
      // and the animation, and calls back through `panel:set-interactive` when
      // it decides to open. Keeping the policy in the renderer is what lets the
      // open feel tuneable without a main-process rebuild.
      panels.get(id)?.push('panel:cursor-edge', event)
    },
    suppress: () => {
      if (quitting) return true
      const current = loadSettings()
      return current.suppressOnFullscreen && platform.isFullscreenAppActive()
    }
  })
  poll.start()

  scheduleQuota(settings)

  // Dev-only: LEDGE_CAPTURE=<dir> opens the hub, seeds a few demo clipboard
  // items so the shelf is not empty, captures the panel to a PNG and quits.
  // Gated behind the env var so it is inert in normal use.
  if (process.env['LEDGE_CAPTURE']) {
    void captureHub(process.env['LEDGE_CAPTURE'])
  }

  // The store is the single trigger: `settings:update` writes, the write
  // notifies, and everything re-derives. Nothing re-applies settings by calling
  // these functions directly.
  onSettingsChanged(applySettings)

  app.on('activate', () => {
    // macOS: clicking the app in Launchpad with no windows open should give the
    // user something, and Settings is the only window worth raising.
    if (BrowserWindow.getAllWindows().length === 0) openSettings()
  })
}

/**
 * Screenshot harness. Opens the hub, seeds representative clipboard items so the
 * shelf shows real cards rather than the empty state, waits for the quota
 * readers and a paint, then writes a PNG of the panel window and quits.
 */
async function captureHub(dir: string): Promise<void> {
  const { writeFileSync, mkdirSync } = await import('node:fs')
  const { execFile } = await import('node:child_process')
  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
  // Put real text on the OS clipboard and let the watcher capture it — this
  // exercises the actual capture path, not a seeded store. Set-Clipboard is a
  // PowerShell cmdlet, so it is spawned directly rather than through the
  // platform shell (cmd.exe on Windows). Capture-harness-only code.
  const psExe = join(
    process.env['SystemRoot'] ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  )
  const copy = (text: string): Promise<void> =>
    new Promise((resolve) => {
      execFile(
        psExe,
        ['-NoProfile', '-NonInteractive', '-Command', 'Set-Clipboard -Value $env:LEDGE_CLIP'],
        { env: { ...process.env, LEDGE_CLIP: text } },
        () => resolve()
      )
    })
  try {
    mkdirSync(dir, { recursive: true })
    const host = panels.get('shelf')

    // Freeze edge detection: otherwise a cursor sitting far from the edge makes
    // the poll push a close event and the panel slides shut before we shoot.
    poll?.stop()

    // Let the renderer finish loading and subscribe to its pushes first.
    await wait(1600)
    host?.open()

    // Real copies, spaced past the watcher's poll interval so each lands as its
    // own history item rather than being coalesced.
    for (const text of [
      'https://github.com/Deepender25/Edge-Drop',
      'git commit -m "fix: keychain retry on macOS"',
      'Cost Meter — tính tiền theo token đã dùng'
    ]) {
      await copy(text)
      await wait(850)
    }

    await wait(1200)
    host?.open() // re-assert open in case anything toggled it during the copies

    // Push a synthetic quota snapshot (a DeepSeek prepaid balance + two window
    // providers) and expand the strip, so the shot proves the balance meter —
    // the real DeepSeek reader needs an API key this machine doesn't have.
    const nowIso = new Date().toISOString()
    const snapshot = {
      lastUpdated: nowIso,
      readings: [
        {
          providerId: 'claude', displayName: 'Claude Code', modelName: 'claude-opus',
          state: 'ok', message: null,
          session: { label: '5h session', usedPercent: 32, resetsAt: null },
          weekly: { label: 'Weekly', usedPercent: 18, resetsAt: null },
          ringPercent: 32, severity: 'ok', observedAt: nowIso, stale: false
        },
        {
          providerId: 'cursor', displayName: 'Cursor', modelName: null,
          state: 'ok', message: null,
          session: { label: 'Monthly', usedPercent: 76, resetsAt: null }, weekly: null,
          ringPercent: 76, severity: 'warn', observedAt: nowIso, stale: false
        },
        {
          providerId: 'deepseek', displayName: 'DeepSeek', modelName: 'deepseek-chat',
          state: 'ok', message: null, session: null, weekly: null,
          ringPercent: null, severity: 'ok', observedAt: nowIso, stale: false,
          balance: { currency: 'CNY', totalBalance: '110.00', grantedBalance: '10.00', toppedUpBalance: '100.00', isAvailable: true },
          cost: { currency: 'CNY', sessionAmount: null, todayAmount: 12.5, monthAmount: 47.3, meteredByToken: true }
        }
      ]
    }
    broadcast('gauge:snapshot', snapshot as never)
    await wait(400)
    const win = host?.window
    if (win && !win.webContents.isDestroyed()) {
      // Expand the strip, then open the DeepSeek detail sheet so the shot shows
      // the Cost Meter's spend line.
      await win.webContents
        .executeJavaScript("document.querySelector('.bz-quota-strip')?.click(); true")
        .catch(() => undefined)
      await wait(500)
      await win.webContents
        .executeJavaScript("document.querySelector('[aria-label=\"DeepSeek\"]')?.click(); true")
        .catch(() => undefined)
      await wait(500)
      const image = await win.webContents.capturePage()
      writeFileSync(join(dir, 'hub.png'), image.toPNG())
      console.log('[capture] wrote hub.png')
    }
  } catch (err) {
    console.error('[capture] failed', err)
  } finally {
    app.quit()
  }
}

function applyHotkeysFromSettings(settings: Settings): void {
  const failures = applyHotkeys(settings, {
    toggleShelf: () => {
      panels.get('shelf')?.toggle()
      tray?.refresh()
    },
    toggleGauge: () => {
      // Both hotkeys act on the single hub now. The gauge shortcut opens the
      // hub and asks the renderer to reveal the quota detail; the renderer
      // reads `openQuota` off the toggle push.
      panels.get('shelf')?.toggle()
      tray?.refresh()
    }
  })

  for (const failure of failures) {
    console.warn(`[hotkeys] ${failure.accelerator || '(empty)'} — ${failure.reason}`)
    broadcast('ui:toast', {
      id: `hotkey-${failure.setting}`,
      message: `Shortcut ${failure.accelerator || '(empty)'} could not be registered: ${failure.reason}`,
      tone: 'error'
    })
  }
}

/**
 * Settings can change from the Settings window or from the tray; either way the
 * whole app re-derives from the persisted object rather than trying to apply a
 * diff. There are few enough moving parts that idempotent re-application is
 * simpler and less bug-prone than change detection.
 */
function applySettings(settings: Settings): void {
  syncPanels(settings)
  applyHotkeysFromSettings(settings)
  scheduleQuota(settings)
  // Incognito pauses new-item capture without touching existing history.
  clipboard?.pause(settings.shelf.incognito)
  tray?.refresh()
}

// Tray-resident: no windows is a normal state, not a reason to exit. Merely
// having a listener here overrides Electron's default quit-on-last-window.
app.on('window-all-closed', () => {})

app.on('before-quit', teardown)
