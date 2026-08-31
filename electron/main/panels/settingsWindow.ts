/**
 * The Settings window — the one ordinary window in the app.
 *
 * It is not a PanelHost: it has a frame, it takes focus, it is resizable, and
 * it does not dock to anything. Keeping it out of PanelHost is deliberate, so
 * "panel" keeps meaning "edge-docked, collapsible" everywhere else.
 *
 * Singleton: opening Settings twice must raise the existing window rather than
 * spawn a second one that can save conflicting values over the first.
 */
import { BrowserWindow, screen, shell } from 'electron'

let win: BrowserWindow | null = null

export interface SettingsWindowDeps {
  preloadPath: string
  /** Dev-server URL or absolute path to the built settings/index.html. */
  htmlEntry: string
}

export function getSettingsWindow(): BrowserWindow | null {
  return win && !win.isDestroyed() ? win : null
}

export function openSettingsWindow(deps: SettingsWindowDeps): BrowserWindow {
  const existing = getSettingsWindow()
  if (existing) {
    if (existing.isMinimized()) existing.restore()
    existing.focus()
    return existing
  }

  // Size against the work area rather than a fixed 900×700: on a 1366×768
  // laptop a "reasonable" default window is taller than the screen and its
  // save button ends up under the taskbar.
  const { workArea } = screen.getPrimaryDisplay()
  const width = Math.min(920, Math.round(workArea.width * 0.7))
  const height = Math.min(680, Math.round(workArea.height * 0.8))

  const created = new BrowserWindow({
    width,
    height,
    minWidth: 560,
    minHeight: 420,
    show: false,
    // Opaque: this is a normal window, and a transparent one would lose its
    // native resize borders and shadow on Windows.
    transparent: false,
    autoHideMenuBar: true,
    title: 'Ledge',
    webPreferences: {
      preload: deps.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win = created

  created.once('ready-to-show', () => {
    if (!created.isDestroyed()) created.show()
  })

  created.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  created.on('closed', () => {
    win = null
  })

  const load = /^https?:\/\//.test(deps.htmlEntry)
    ? created.loadURL(deps.htmlEntry)
    : created.loadFile(deps.htmlEntry)

  void load.catch((err: unknown) => {
    console.error('[settings-window] failed to load', deps.htmlEntry, err)
  })

  return created
}

export function closeSettingsWindow(): void {
  const existing = getSettingsWindow()
  if (existing) existing.destroy()
  win = null
}
