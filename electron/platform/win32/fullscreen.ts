/**
 * Fullscreen app / game detection via `SHQueryUserNotificationState`.
 *
 * Ported from Edge-Drop's `electron/main/fullscreen.ts`.
 *
 * This is the same signal Windows itself uses to decide whether to suppress
 * toast notifications, which makes it exactly the right question for an edge
 * panel: "would popping up right now be rude?". It is one shell32 call, so it
 * is cheap enough to poll — Edge-Drop's earlier implementation spawned
 * `powershell.exe` once a second, which cost 60-100 ms of CPU and disk per
 * tick for the CLR and DLL load; going through koffi keeps shell32 resident
 * in-process and each call is sub-microsecond.
 *
 * Graceful degradation, preserved from the original: `queryNotificationState`
 * returns `-1` — a value outside the `QUERY_USER_NOTIFICATION_STATE` enum —
 * when koffi is unavailable or the call fails, and every caller treats a
 * negative state as "no information" and reports `false`. It never guesses.
 */
import { loadWin32Natives } from './koffi'

/**
 * `QUERY_USER_NOTIFICATION_STATE`:
 *   1 QUNS_NOT_PRESENT              screen saver or locked session
 *   2 QUNS_BUSY                     fullscreen app, or the shell has focus
 *   3 QUNS_RUNNING_D3D_FULL_SCREEN  D3D exclusive fullscreen game
 *   4 QUNS_PRESENTATION_MODE        presentation mode
 *   5 QUNS_ACCEPTS_NOTIFICATIONS    ordinary desktop
 *   6 QUNS_QUIET_TIME               first-logon quiet period
 *   7 QUNS_APP                      a Windows Store app is in the foreground
 */
const FULLSCREEN_STATES = new Set([2, 3, 4])
const QUNS_BUSY = 2

/**
 * Window classes belonging to the desktop and the shell itself.
 *
 * Windows reports `QUNS_BUSY` when the desktop or the taskbar owns the
 * foreground, i.e. when *no* app window is focused. Without this check the
 * panel would suppress itself whenever the user clicked their wallpaper, which
 * is the opposite of what it should do.
 */
const DESKTOP_SHELL_CLASSES = new Set([
  'Progman',
  'WorkerW',
  'Shell_TrayWnd',
  'Shell_SecondaryTrayWnd',
  'ImmersiveLauncher',
  'MultitaskingViewFrame'
])

/** The raw enum value, or `-1` when detection is unavailable or failed. */
function queryNotificationState(): number {
  const { shQueryUserNotificationState } = loadWin32Natives()
  if (!shQueryUserNotificationState) return -1
  try {
    const out: [number] = [0]
    const hr = shQueryUserNotificationState(out)
    // S_OK is 0. Any HRESULT failure means the out-param is meaningless.
    return hr === 0 ? out[0] : -1
  } catch {
    return -1
  }
}

/** True when the desktop or a shell surface currently owns the foreground. */
function isDesktopForeground(): boolean {
  const { getForegroundWindow, getClassNameA } = loadWin32Natives()
  if (!getForegroundWindow || !getClassNameA) return false
  try {
    const hwnd = getForegroundWindow()
    if (!hwnd) return false
    const buf = Buffer.alloc(256)
    const len = getClassNameA(hwnd, buf, 256)
    if (len <= 0) return false
    return DESKTOP_SHELL_CLASSES.has(buf.toString('latin1', 0, len).trim())
  } catch {
    return false
  }
}

/**
 * True when a fullscreen app, game or presentation owns the foreground.
 *
 * Synchronous and cheap by design — `PlatformAdapter.isFullscreenAppActive`
 * is called from the panel's show/hide decision, so it cannot be async and
 * cannot afford a cache that lags a user alt-tabbing out of a game.
 */
export function isFullscreenAppActive(): boolean {
  const state = queryNotificationState()
  if (state < 0) return false // koffi absent or the call failed: no information.

  if (!FULLSCREEN_STATES.has(state)) return false
  if (state === QUNS_BUSY && isDesktopForeground()) return false
  return true
}

/** True when the shell32 binding is live, i.e. detection can actually work. */
export function isFullscreenDetectionAvailable(): boolean {
  return loadWin32Natives().shQueryUserNotificationState !== null
}
