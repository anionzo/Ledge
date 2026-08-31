/**
 * IPC registration.
 *
 * `shared/ipc.ts` declares the channels; this file is where the main-process
 * half is bound to them. The three helpers below are thin, but they are the
 * only way handlers get their arguments typed — `ipcMain.handle` hands you
 * `...args: any[]`, and a hand-written cast in twenty handlers is twenty places
 * for the contract to drift.
 *
 * Ownership note: only the channels this scaffold owns are registered here
 * (app, settings, panel, gauge). `shelf:*` belongs to
 * `electron/features/clipboard`; until that lands, `registerShelfPlaceholders`
 * keeps the Shelf renderer from rejecting on first paint. Delete that call the
 * moment the real handlers exist.
 */
import { BrowserWindow, app, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import type {
  InvokeArgs,
  InvokeChannel,
  InvokeResult,
  PanelId,
  PushArgs,
  PushChannel,
  SendArgs,
  SendChannel
} from '../../../shared/ipc'
import type { PlatformAdapter } from '../../platform/types'
import { listDisplayOptions } from '../panels/displays'
import type { UpdaterController } from '../updater'
import { loadSettings, saveSettings } from '../../store/settings'
import { getHistory } from '../../store/usageHistory'
import { getSnapshot, probeCommand, refresh } from '../../features/quota'
import type { ClipboardEngine } from '../../features/clipboard'
import type { EdgePanelId, PanelHost } from '../panels/PanelHost'

export function handle<C extends InvokeChannel>(
  channel: C,
  handler: (event: IpcMainInvokeEvent, ...args: InvokeArgs<C>) => InvokeResult<C> | Promise<InvokeResult<C>>
): void {
  // removeHandler first so registration is idempotent: a feature module can
  // take over a channel a placeholder claimed without ipcMain throwing
  // "second handler for ...".
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, (event, ...args) => handler(event, ...(args as InvokeArgs<C>)))
}

export function receive<C extends SendChannel>(
  channel: C,
  handler: (event: IpcMainEvent, ...args: SendArgs<C>) => void
): void {
  ipcMain.removeAllListeners(channel)
  ipcMain.on(channel, (event, ...args) => {
    handler(event, ...(args as SendArgs<C>))
  })
}

/** Push to every live Ledge window. */
export function broadcast<C extends PushChannel>(channel: C, ...args: PushArgs<C>): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue
    win.webContents.send(channel, ...args)
  }
}

export interface IpcDeps {
  platform: PlatformAdapter
  /** Live registry — panels are created and destroyed as settings change. */
  getPanel: (id: EdgePanelId) => PanelHost | undefined
  /** Which renderer is asking. Resolved from the sender's webContents id. */
  panelIdFor: (webContentsId: number) => PanelId
  openSettings: () => void
  quit: () => void
}

export function registerCoreIpc(deps: IpcDeps): void {
  const { platform } = deps

  handle('app:bootstrap', (event) => ({
    // The renderer does not get to claim which panel it is — the main process
    // knows, because it created the window.
    panelId: deps.panelIdFor(event.sender.id),
    settings: loadSettings(),
    capabilities: platform.capabilities,
    version: app.getVersion()
  }))

  handle('settings:get', () => loadSettings())

  handle('settings:update', (_event, patch) => {
    const next = saveSettings(patch)
    // Everyone, not just the sender: the Shelf has to react when the Settings
    // window changes its side, and vice versa.
    broadcast('settings:changed', next)
    return next
  })

  // ── Gauge ────────────────────────────────────────────────────────────────
  handle('gauge:snapshot', () => getSnapshot())
  // `force` — this channel exists precisely to bypass the per-provider TTL;
  // the scheduled refresh in main/index.ts is the one that respects it.
  handle('gauge:refresh', () => refresh({ force: true }))

  handle('gauge:history', (_event, providerId) => {
    // The id comes from the renderer, so it is bounded before it can index
    // the store — the same posture as `probeCommand` validating a command
    // name. 80 chars matches the cap Settings puts on a custom provider id,
    // and the character class covers every builtin and `custom_<slug>` id.
    const id = String(providerId ?? '').trim()
    if (!id || id.length > 80 || !/^[A-Za-z0-9_-]+$/.test(id)) return []
    return getHistory(id)
  })

  handle('gauge:probe-command', async (_event, command) => {
    // Two questions, two answers. The Settings window uses this to tell the
    // user *why* their custom provider shows an em dash, so "not installed"
    // and "installed but its output is not JSON" must not collapse into one
    // generic failure. `probeCommand` also validates the name before it can
    // reach a shell, which is why it runs first.
    const found = await probeCommand(command)
    if (!found.found) {
      return { ok: false, message: 'Command not found on PATH.' }
    }

    const result = await platform.runCommand(command, { timeoutMs: 10_000 })
    if (!result.ok) {
      return {
        ok: false,
        message: result.stderr.trim() || `Command exited with code ${String(result.code)}.`
      }
    }
    try {
      JSON.parse(result.stdout)
      return { ok: true, message: `Ran ${found.path ?? command} and parsed its JSON output.` }
    } catch {
      return { ok: false, message: 'Command ran, but its output is not JSON.' }
    }
  })

  // ── Windows ──────────────────────────────────────────────────────────────
  handle('panel:set-interactive', (event, interactive) => {
    const id = deps.panelIdFor(event.sender.id)
    if (id === 'settings') return
    deps.getPanel(id)?.setInteractive(interactive)
  })

  handle('panel:open', (_event, panel) => {
    if (panel === 'settings') {
      deps.openSettings()
      return
    }
    deps.getPanel(panel)?.open()
  })

  handle('panel:close', (_event, panel) => {
    if (panel === 'settings') return
    deps.getPanel(panel)?.close()
  })

  // Read live rather than cached: the Settings picker is exactly the place a
  // user goes right after plugging a monitor in, and a stale list would offer
  // them the desk they no longer have.
  handle('displays:list', () => listDisplayOptions())

  handle('app:quit', () => {
    deps.quit()
  })
}

/**
 * Temporary. `electron/features/clipboard` owns every `shelf:*` channel; these
 * stubs exist only so the Shelf renderer can boot before the real engine is
 * wired — `registerClipboardIpc` replaces them. `handle`/`receive` call
 * `removeHandler` first, so registering the real handlers over these is safe.
 */
export function registerShelfPlaceholders(): void {
  handle('shelf:list', () => [])
  handle('shelf:pin', () => [])
  handle('shelf:delete', () => [])
  handle('shelf:clear', () => [])
  handle('shelf:clear-query', () => [])
  handle('shelf:full-text', () => '')
  handle('shelf:copy', () => false)
  handle('shelf:paste', () => false)
  handle('shelf:add', () => [])
  handle('shelf:merge', () => ({ ok: false, stackId: null, reason: 'not-found' as const }))
  handle('shelf:split', () => false)
  handle('shelf:reveal', () => false)

  receive('shelf:start-drag', () => {})
  receive('shelf:prestage-drag', () => {})
}

/**
 * Wire the real clipboard engine to every `shelf:*` channel, replacing the
 * placeholders. The two send channels need the caller's `webContents` — a
 * native drag must be started on the exact renderer that fired `dragstart`,
 * which `event.sender` gives us.
 */
export function registerClipboardIpc(engine: ClipboardEngine): void {
  handle('shelf:list', () => engine.list())
  handle('shelf:pin', (_e, id, pinned) => engine.setPinned(id, pinned))
  handle('shelf:delete', (_e, ids) => engine.remove(ids))
  handle('shelf:clear', (_e, keepPinned) => engine.clear(keepPinned))
  handle('shelf:clear-query', (_e, query) => engine.clearQuery(query))
  handle('shelf:full-text', (_e, id) => engine.fullText(id))
  handle('shelf:copy', (_e, req) => engine.copy(req))
  handle('shelf:paste', (_e, req) => engine.paste(req))
  handle('shelf:add', (_e, data) => engine.addData(data))
  handle('shelf:merge', (_e, sourceId, targetId) => engine.merge(sourceId, targetId))
  handle('shelf:split', (_e, req) => engine.split(req))
  handle('shelf:reveal', (_e, path) => engine.reveal(path))

  receive('shelf:start-drag', (event, req) => engine.startDrag(event.sender, req))
  receive('shelf:prestage-drag', (_e, req) => engine.prestageDrag(req))
}

/**
 * Wire the updater to its four channels.
 *
 * Registered unconditionally, even on a Store build where the controller
 * refuses to do anything: the Settings window asks for `updater:status` on
 * every mount, and a missing handler would surface as a rejected promise and
 * an error banner rather than the honest "the store manages this" the status
 * object already carries.
 */
export function registerUpdaterIpc(updater: UpdaterController): void {
  handle('updater:status', () => updater.status())
  handle('updater:check', () => updater.check())
  handle('updater:download', () => updater.download())
  handle('updater:quit-and-install', () => {
    updater.quitAndInstall()
  })
}
