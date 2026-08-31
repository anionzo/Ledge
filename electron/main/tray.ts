/**
 * One tray icon for the whole app.
 *
 * Edge-Drop and agent-notch each had their own tray entry; two icons for one
 * product is clutter, and it makes "quit" ambiguous. Ledge has a single icon
 * whose menu covers both panels.
 *
 * The menu is rebuilt rather than mutated. Electron's Menu items are immutable
 * once built on Windows, so a checkbox that reflects live state (is the Shelf
 * open? is launch-at-login on?) has to be re-created — `refresh()` is called by
 * main whenever any of that changes.
 */
import {
  Menu,
  Tray,
  app,
  nativeImage,
  type MenuItemConstructorOptions,
  type NativeImage
} from 'electron'
import { join } from 'node:path'
import type { PlatformAdapter } from '../platform/types'
import type { UpdaterStatus } from '../../shared/ipc'
import type { Settings } from '../../shared/types/settings'
import type { EdgePanelId, PanelHost } from './panels/PanelHost'

/**
 * What the tray needs from the updater.
 *
 * Ledge lives in the tray, so this is where someone looks to ask "is there a
 * new version?" — expecting them to open Settings and find the right tab to
 * press a button is expecting them to already know the answer. The Settings
 * banner still exists for the case where they are in there anyway.
 */
export interface TrayUpdateHooks {
  status(): UpdaterStatus
  check(): void
  download(): void
  restartToInstall(): void
}

export interface TrayDeps {
  platform: PlatformAdapter
  getSettings: () => Settings
  getPanel: (id: EdgePanelId) => PanelHost | undefined
  openSettings: () => void
  refreshQuota: () => void
  setAutostart: (enabled: boolean) => void
  quit: () => void
  /** Absent only if main chose not to wire an updater at all. */
  updates?: TrayUpdateHooks
}

export interface TrayController {
  /** Rebuild the menu against current state. */
  refresh: () => void
  destroy: () => void
}

/**
 * A 16×16 rendering of the product mark: two rails, one on each edge. Inlined
 * as base64 so the tray can never fail to appear because an icon file is
 * missing from a build — a tray-resident app with no tray icon has no way to be
 * quit or configured.
 */
const FALLBACK_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAJElEQVR42mNgGDTgPyqowIHhAK8BxFgyasCoAbQ3gKykPGAAAC+DSGx28GwKAAAAAElFTkSuQmCC'

function resolveIcon(platform: PlatformAdapter): NativeImage {
  // app.getAppPath() is the repo root in dev and the asar root when packaged;
  // `resources/**` is listed in the electron-builder `files` glob, so the same
  // relative path resolves in both.
  const fromDisk = nativeImage.createFromPath(join(app.getAppPath(), 'resources', 'icon.png'))
  const icon = fromDisk.isEmpty() ? nativeImage.createFromDataURL(FALLBACK_ICON) : fromDisk

  if (platform.id === 'darwin') {
    // Template images let macOS invert the icon for light/dark menu bars. The
    // mark is monochrome by design, so this costs nothing.
    const sized = icon.resize({ width: 16, height: 16 })
    sized.setTemplateImage(true)
    return sized
  }

  return icon.resize({ width: 16, height: 16 })
}

function label(base: string, accelerator: string): string {
  const trimmed = accelerator.trim()
  return trimmed === '' ? base : `${base}\t${trimmed}`
}

/**
 * The one update row the tray shows, chosen from the updater's current state.
 *
 * One row, not a submenu: at any moment there is exactly one thing worth
 * doing, and the label says which — "Check for updates" until there is
 * something to fetch, then "Download", then "Restart". Returns an empty list
 * where the updater is inert (an unpackaged run, or a Store build that must
 * never check), for the same reason the Settings section is absent there:
 * a menu item wired to nothing is worse than no menu item.
 */
export function updateItems(hooks: TrayUpdateHooks | undefined): MenuItemConstructorOptions[] {
  if (!hooks) return []
  const status = hooks.status()
  if (!status.supported) return []

  if (status.downloadedVersion !== null) {
    return [
      { type: 'separator' },
      {
        label: `Restart to update (${status.downloadedVersion})`,
        click: () => {
          hooks.restartToInstall()
        }
      }
    ]
  }

  if (status.downloading) {
    return [{ type: 'separator' }, { label: 'Downloading update…', enabled: false }]
  }

  if (status.checking) {
    return [{ type: 'separator' }, { label: 'Checking for updates…', enabled: false }]
  }

  if (status.availableVersion !== null) {
    // Only reachable with auto-download switched off; otherwise the download
    // starts itself and this state passes by too fast to click.
    return [
      { type: 'separator' },
      {
        label: `Download update (${status.availableVersion})`,
        click: () => {
          hooks.download()
        }
      }
    ]
  }

  return [
    { type: 'separator' },
    {
      label: 'Check for updates',
      click: () => {
        hooks.check()
      }
    }
  ]
}

export function createTray(deps: TrayDeps): TrayController {
  const tray = new Tray(resolveIcon(deps.platform))
  tray.setToolTip('Ledge')

  /**
   * Read once and cached: `getAutostart` hits the registry / a plist / a
   * .desktop file, and the tray menu is rebuilt often enough that doing that
   * synchronously on every rebuild would be felt.
   */
  let autostart = false
  void deps.platform
    .getAutostart()
    .then((value) => {
      autostart = value
      build()
    })
    .catch(() => {
      // Unsupported or unreadable — the item just shows unchecked.
    })

  function build(): void {
    const settings = deps.getSettings()
    const shelf = deps.getPanel('shelf')
    const gauge = deps.getPanel('gauge')

    const menu = Menu.buildFromTemplate([
      {
        // Accelerators here are labels only: `globalShortcut` already owns the
        // real binding, and letting the menu register it too would make the
        // hotkey fire twice.
        label: label('Shelf', settings.hotkeyToggleShelf),
        type: 'checkbox',
        enabled: shelf !== undefined,
        checked: shelf?.isOpen() ?? false,
        click: () => {
          shelf?.toggle()
          build()
        }
      },
      {
        label: label('Gauge', settings.hotkeyToggleGauge),
        type: 'checkbox',
        enabled: gauge !== undefined,
        checked: gauge?.isOpen() ?? false,
        click: () => {
          gauge?.toggle()
          build()
        }
      },
      { type: 'separator' },
      {
        label: 'Refresh quota now',
        enabled: settings.gauge.enabled,
        click: () => {
          deps.refreshQuota()
        }
      },
      { type: 'separator' },
      {
        label: 'Settings…',
        click: () => {
          deps.openSettings()
        }
      },
      {
        label: 'Launch at login',
        type: 'checkbox',
        checked: autostart,
        // Hidden rather than disabled where the OS has no writable autostart:
        // a permanently greyed switch reads as a bug.
        visible: deps.platform.capabilities.autostart,
        click: (item) => {
          autostart = item.checked
          deps.setAutostart(item.checked)
        }
      },
      ...updateItems(deps.updates),
      { type: 'separator' },
      {
        label: 'Quit Ledge',
        click: () => {
          deps.quit()
        }
      }
    ])

    tray.setContextMenu(menu)

    // The tooltip is the only part of a tray app visible without opening
    // anything, so a waiting update says so there rather than hoping someone
    // right-clicks today.
    const ready = deps.updates?.status().downloadedVersion ?? null
    tray.setToolTip(ready === null ? 'Ledge' : `Ledge — ${ready} ready, restart to update`)
  }

  build()

  // Left click is the fast path to the panel people open most. On macOS a left
  // click opens the context menu by default, which is the platform convention,
  // so this only changes behaviour where the convention differs.
  tray.on('click', () => {
    if (deps.platform.id === 'darwin') return
    deps.getPanel('shelf')?.toggle()
    build()
  })

  return {
    refresh: build,
    destroy: () => {
      tray.destroy()
    }
  }
}
