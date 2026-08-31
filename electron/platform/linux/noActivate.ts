/**
 * Focus suppression on Linux — a deliberate no-op.
 *
 * There is no cross-desktop equivalent of `WS_EX_NOACTIVATE`. Whether a
 * window takes focus when clicked is decided entirely by the window manager,
 * and the app can only *hint*:
 *
 *  - Under X11 the hint is `WM_HINTS.input = False` plus the
 *    `_NET_WM_TAKE_FOCUS` protocol, or the `_NET_WM_WINDOW_TYPE_DOCK` window
 *    type. Mutter, KWin, i3, and the various wlroots compositors each honour
 *    a different subset, and some ignore the hint for override-redirect
 *    windows entirely.
 *  - Under Wayland the client cannot express it at all. Focus is compositor
 *    policy and there is no protocol for "do not focus me on click"; a client
 *    does not even get to know which window is focused.
 *
 * Electron exposes `setFocusable()` on Linux, but it maps to those same
 * unreliable X11 hints, is documented as having no effect on many WMs, and on
 * several it does the *worse* thing of making the window unclickable. Calling
 * it would produce behaviour that varies per desktop with no way for the app
 * to find out which it got.
 *
 * So the adapter reports `capabilities.noActivate: false` and does nothing.
 * The Settings window then hides the toggle rather than offering a switch
 * whose effect depends on the user's compositor. Per the degradation contract
 * in `../types.ts`, the panel still works — clicking it may pull focus, which
 * is a papercut, not a failure.
 */
import type { BrowserWindow } from 'electron'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function applyNoActivate(_win: BrowserWindow | null, _enabled: boolean): void {
  // Intentionally empty. See the module comment.
}
