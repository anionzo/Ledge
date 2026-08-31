/**
 * The Windows adapter.
 *
 * Windows is the platform where every capability is genuinely available, so
 * this is the reference implementation the other two degrade away from. The
 * two that depend on FFI — `noActivate` and `fullscreenDetection` — are
 * reported honestly per machine: `loadWin32Natives()` runs once here, at
 * adapter construction, and the flags follow whether the DLL bindings
 * actually took. A machine whose koffi install is broken gets a Settings
 * window with those toggles hidden rather than toggles that do nothing.
 */
import type { BrowserWindow } from 'electron'
import type { PlatformAdapter, PlatformCapabilities } from '../types'
import { buildCapabilities } from '../capabilities'
import { withWindow } from '../shared/window'
import { loadWin32Natives } from './koffi'
import { applyNoActivate } from './noActivate'
import { isFullscreenAppActive, isFullscreenDetectionAvailable } from './fullscreen'
import { getAutostart, setAutostart } from './autostart'
import { readSecret } from './secrets'
import { runCommand, which } from './shell'
import { paths } from './paths'

export function createWin32Adapter(): PlatformAdapter {
  // Bind up front so the capability flags describe this machine, not the OS
  // in the abstract. Memoised inside, so the later hot paths pay nothing.
  const natives = loadWin32Natives()
  const canNoActivate = natives.getWindowLongPtr !== null && natives.setWindowLongPtr !== null
  const canDetectFullscreen = isFullscreenDetectionAvailable()

  return {
    id: 'win32',

    get capabilities(): PlatformCapabilities {
      return buildCapabilities({
        // `setIgnoreMouseEvents` is supported on Windows.
        clickThrough: true,
        noActivate: canNoActivate,
        fullscreenDetection: canDetectFullscreen,
        autostart: true,
        // A topmost window on Windows draws above borderless-fullscreen apps.
        alwaysOnTopOverFullscreen: true
      })
    },

    applyNoActivate,

    applyAlwaysOnTop(win: BrowserWindow, enabled: boolean): void {
      withWindow(win, 'applyAlwaysOnTop', (w) => {
        // The level argument is a macOS concept and is ignored here; passing
        // 'screen-saver' keeps the three adapters' call shape identical.
        w.setAlwaysOnTop(enabled, 'screen-saver')
      })
    },

    applyHiddenFromSwitcher(win: BrowserWindow): void {
      withWindow(win, 'applyHiddenFromSwitcher', (w) => {
        // Keeps the panels out of the taskbar and out of Alt+Tab.
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
