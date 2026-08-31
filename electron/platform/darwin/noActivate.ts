/**
 * Focus suppression on macOS.
 *
 * `win.setFocusable(false)` is the macOS equivalent of Windows'
 * `WS_EX_NOACTIVATE`: AppKit stops making the window key when it is clicked,
 * so the user's caret stays in the app they were typing in while they pick an
 * item off the shelf.
 *
 * IMPORTANT DIFFERENCE FROM WINDOWS — the next reader needs to know this is
 * deliberate: on macOS `setFocusable(false)` only prevents the window from
 * *becoming* key. It does not remove focus from a window that is already
 * focused. If the panel currently has focus when this is called, it keeps it
 * until something else takes it. `WS_EX_NOACTIVATE` on Windows has the same
 * property, but the practical consequence is more visible on macOS because
 * Electron will happily hand a new `BrowserWindow` focus on `show()`. The
 * caller's ordering therefore matters: apply this *before* showing the panel,
 * and construct the window with `focusable: false` where the panel never
 * needs keyboard input at all.
 *
 * Also note `setFocusable(false)` blocks keyboard input to the window
 * entirely. That is correct for the gauge and the collapsed shelf, and it is
 * why the Settings window must never be passed here.
 */
import type { BrowserWindow } from 'electron'
import { withWindow } from '../shared/window'

export function applyNoActivate(win: BrowserWindow | null, enabled: boolean): void {
  withWindow(win, 'applyNoActivate', (w) => {
    w.setFocusable(!enabled)
  })
}
