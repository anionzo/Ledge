/**
 * The Linux adapter — and the fallback for any platform id the app does not
 * recognise (see `../index.ts`). Assuming the most conservative capability set
 * for an unknown OS is the safe default.
 *
 * The headline finding for this platform is `clickThrough: false`. Electron
 * documents `BrowserWindow.setIgnoreMouseEvents` as **macOS and Windows
 * only**, and on Linux it is a no-op: the window keeps swallowing every
 * pointer event over its rectangle. Since the panels are full-height,
 * always-on-top overlays pinned to a screen edge, an ignored
 * `setIgnoreMouseEvents(true)` does not degrade gracefully — it makes a strip
 * of the user's desktop permanently unclickable, including whatever
 * application is underneath.
 *
 * So the flag is `false`, and `electron/main` is expected to branch on it:
 * where Windows and macOS keep a full-size click-through window and toggle
 * interactivity, Linux must physically resize the window down to its trigger
 * strip when collapsed and back up when expanded. That costs a little
 * animation smoothness and is the only correct option here.
 *
 * The other three falses — `noActivate`, `fullscreenDetection`,
 * `alwaysOnTopOverFullscreen` — are each explained in the module they come
 * from: `./noActivate.ts`, `./fullscreen.ts`, and the comment on
 * `applyAlwaysOnTop` below.
 */
import type { BrowserWindow } from 'electron'
import type { PlatformAdapter, PlatformCapabilities } from '../types'
import { buildCapabilities } from '../capabilities'
import { withWindow } from '../shared/window'
import { applyNoActivate } from './noActivate'
import { isFullscreenAppActive } from './fullscreen'
import { getAutostart, setAutostart } from './autostart'
import { readSecret } from './secrets'
import { runCommand, which } from './shell'
import { paths } from './paths'

export function createLinuxAdapter(): PlatformAdapter {
  return {
    id: 'linux',

    get capabilities(): PlatformCapabilities {
      return buildCapabilities({
        // THE key difference on this platform. See the module comment.
        clickThrough: false,
        // Window-manager dependent and unknowable from here.
        noActivate: false,
        // No pure-Electron answer, and none at all under Wayland.
        fullscreenDetection: false,
        // XDG autostart entry; the one capability that is fully supported.
        autostart: true,
        alwaysOnTopOverFullscreen: false
      })
    },

    applyNoActivate,

    applyAlwaysOnTop(win: BrowserWindow, enabled: boolean): void {
      withWindow(win, 'applyAlwaysOnTop', (w) => {
        // Sets `_NET_WM_STATE_ABOVE`, which most X11 window managers honour
        // for ordinary windows. It does NOT reliably win against a window in
        // `_NET_WM_STATE_FULLSCREEN` — many WMs deliberately give an
        // unredirected fullscreen client the top of the stack so games are not
        // interrupted — and under Wayland the request is compositor policy
        // that a client cannot rely on. Hence
        // `alwaysOnTopOverFullscreen: false`: the call is still made because
        // it helps in the ordinary case, but the app must not assume it wins.
        w.setAlwaysOnTop(enabled)
      })
    },

    applyHiddenFromSwitcher(win: BrowserWindow): void {
      withWindow(win, 'applyHiddenFromSwitcher', (w) => {
        // Sets `_NET_WM_STATE_SKIP_TASKBAR`, honoured by the common panels
        // (GNOME Shell, Plasma, xfce4-panel). Tiling WMs generally have no
        // taskbar for it to mean anything to, which is harmless.
        w.setSkipTaskbar(true)
      })
    },

    isFullscreenAppActive,

    getAutostart,
    setAutostart,

    readSecret,
    runCommand,
    which,

    paths
  }
}
