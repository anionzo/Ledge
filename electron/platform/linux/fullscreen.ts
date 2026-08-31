/**
 * Fullscreen detection on Linux — honestly unavailable.
 *
 * Returns `false` always, with `capabilities.fullscreenDetection: false` to
 * match. The reasoning, so this reads as a decision rather than a gap:
 *
 *  - **X11 could answer it, at a cost.** `_NET_ACTIVE_WINDOW` on the root
 *    window gives the focused window, and `_NET_WM_STATE` on that window
 *    carries `_NET_WM_STATE_FULLSCREEN`. Reading them without a native module
 *    means shelling out to `xprop` twice per poll — two process spawns on a
 *    loop that runs while the user is gaming, which is precisely when the
 *    machine can least afford it. And `xprop` is not installed by default on
 *    a good number of desktop images.
 *
 *  - **Wayland cannot answer it at all.** A Wayland client has no protocol
 *    for inspecting other clients' windows; that isolation is the point of
 *    the design. There is no equivalent of `_NET_WM_STATE` to read, and
 *    Wayland is now the default session on Fedora, Ubuntu and SteamOS. An
 *    implementation that only worked under X11 would silently do nothing for
 *    most Linux users while reporting the capability as available.
 *
 *  - **A wrong `true` is the bad failure.** It would leave the panels
 *    permanently suppressed with nothing in the UI to explain why. A wrong
 *    `false` only means the panels do not auto-hide over a fullscreen app,
 *    which the user can work around by not moving their cursor to the screen
 *    edge.
 *
 * If this is revisited, the shape to aim for is a one-off capability probe at
 * startup (is this an X11 session, and is `xprop` present?) feeding a cached
 * `fullscreenDetection` flag, with the poll itself reading the two properties
 * through a native X11 binding rather than a subprocess.
 */

/** Always `false` on Linux. See the module comment for why. */
export function isFullscreenAppActive(): boolean {
  return false
}
