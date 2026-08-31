/**
 * The macOS adapter.
 *
 * Everything Windows can do is available here except fullscreen detection —
 * see `./fullscreen.ts` for why that is an honest `false` rather than a
 * guess. The macOS-specific work is concentrated in two places: the Keychain
 * read in `./secrets.ts`, which is the only way to get Claude Code's OAuth
 * tokens on this platform, and the always-on-top handling below, which needs
 * an extra call Windows does not.
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

export function createDarwinAdapter(): PlatformAdapter {
  return {
    id: 'darwin',

    get capabilities(): PlatformCapabilities {
      return buildCapabilities({
        // `setIgnoreMouseEvents` is supported on macOS.
        clickThrough: true,
        // `setFocusable(false)`; see ./noActivate.ts for its one caveat.
        noActivate: true,
        // Honest false — no pure-Electron way to see a foreign window's frame.
        fullscreenDetection: false,
        autostart: true,
        // Reachable, but only via setVisibleOnAllWorkspaces below.
        alwaysOnTopOverFullscreen: true
      })
    },

    applyNoActivate,

    applyAlwaysOnTop(win: BrowserWindow, enabled: boolean): void {
      withWindow(win, 'applyAlwaysOnTop', (w) => {
        // The window level matters on macOS, unlike Windows. 'screen-saver'
        // sits above the Dock and above a full-screen app's own window level,
        // which is what an edge panel needs.
        w.setAlwaysOnTop(enabled, 'screen-saver')

        // Being topmost is not enough on macOS: a native full-screen app owns
        // its own Space, and a window that is not marked visible-on-all-Spaces
        // simply is not in that Space to be drawn above. This second call is
        // the actual mechanism behind `alwaysOnTopOverFullscreen` here.
        w.setVisibleOnAllWorkspaces(enabled, { visibleOnFullScreen: enabled })
      })
    },

    applyHiddenFromSwitcher(win: BrowserWindow): void {
      withWindow(win, 'applyHiddenFromSwitcher', (w) => {
        // `setSkipTaskbar` is a no-op on macOS — there is no taskbar. Ledge
        // stays out of the Dock and the app switcher via `LSUIElement: true`
        // in the `mac.extendInfo` block of package.json, which is a build-time
        // property of the bundle and cannot be set from here. The call is kept
        // so the three adapters behave identically for a caller, and so a
        // future non-LSUIElement build still gets the right treatment on the
        // platforms where it means something.
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
