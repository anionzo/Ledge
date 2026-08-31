/**
 * Fullscreen detection on macOS — honestly unavailable.
 *
 * This returns `false` always, and `capabilities.fullscreenDetection` is
 * `false` to match. That is a deliberate decision, not an unfinished one, so
 * here is the whole reasoning.
 *
 * **What the question needs.** "Is a fullscreen app or game in the
 * foreground?" is a question about *another application's* window. Electron's
 * `BrowserWindow` API only ever describes windows this app owns —
 * `BrowserWindow.getAllWindows()`, `getBounds()`, `isFullScreen()` and
 * `isFocused()` are all scoped to Ledge. There is no pure-Electron call that
 * returns the frontmost foreign window's frame, so the frame-versus-display
 * comparison this file was meant to do has no frame to read.
 *
 * **The heuristic that was considered and rejected.** `screen.getDisplay*()`
 * exposes both `bounds` and `workArea`. Normally `workArea` is inset at the
 * top by the menu bar, and when a native-fullscreen app owns a Space the menu
 * bar auto-hides and `workArea` becomes equal to `bounds`. Tempting, but it
 * produces a *false positive* for every user who has "Automatically hide and
 * show the menu bar" or an auto-hiding Dock switched on — those users would
 * see the panels permanently suppressed with no way to tell why. A
 * baseline-capture variant (record the inset at launch, treat its later
 * disappearance as fullscreen) removes most of that, but silently disables
 * itself for anyone who launches Ledge while already in fullscreen, and
 * misfires when the setting is toggled at runtime.
 *
 * The brief for this seam is explicit that a wrong `true` is not acceptable
 * and an honest `false` is. Suppressing a user's panels forever because they
 * hide their menu bar is exactly the wrong failure, so the heuristic is not
 * shipped.
 *
 * **What a real implementation would need.** `CGWindowListCopyWindowInfo`
 * with `kCGWindowListOptionOnScreenOnly`, or `NSWorkspace`'s frontmost
 * application plus the Accessibility API, both reached through koffi against
 * CoreGraphics/AppKit. That is the macOS analogue of what
 * `../win32/fullscreen.ts` does with `SHQueryUserNotificationState`, and it is
 * the right follow-up — but the Accessibility route also requires a TCC
 * permission prompt, which is a product decision rather than a plumbing one.
 *
 * **Consequence for the app.** With `fullscreenDetection: false` the panels
 * simply never auto-hide for fullscreen apps on macOS. Per the degradation
 * contract in `../types.ts` that is a smaller loss than it sounds: the panels
 * still open, and macOS full-screen Spaces already hide anything that is not
 * marked `visibleOnFullScreen`.
 */

/** Always `false` on macOS. See the module comment for why. */
export function isFullscreenAppActive(): boolean {
  return false
}
