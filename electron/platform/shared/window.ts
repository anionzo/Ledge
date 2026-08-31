/**
 * Window guards.
 *
 * Every `apply*` method on `PlatformAdapter` can be called from a timer, an
 * IPC handler, or a display-change listener, any of which can fire after the
 * panel has been destroyed during shutdown or a monitor hot-unplug. Touching a
 * destroyed `BrowserWindow` throws, and the adapter contract says these
 * methods never throw — so every one of them starts with `isLiveWindow`.
 */
import type { BrowserWindow } from 'electron'

/** True when `win` exists and its native window is still alive. */
export function isLiveWindow(win: BrowserWindow | null | undefined): win is BrowserWindow {
  if (!win) return false
  try {
    return !win.isDestroyed()
  } catch {
    return false
  }
}

/**
 * Run `fn` against a live window, swallowing anything it throws.
 *
 * The swallow is intentional and is the degradation contract in miniature: a
 * window style that could not be applied leaves the panel slightly less
 * polished, and that is strictly better than an unhandled exception taking
 * down the main process.
 */
export function withWindow(
  win: BrowserWindow | null | undefined,
  label: string,
  fn: (win: BrowserWindow) => void
): void {
  if (!isLiveWindow(win)) return
  try {
    fn(win)
  } catch (err) {
    console.error(`[platform] ${label} failed:`, err)
  }
}
