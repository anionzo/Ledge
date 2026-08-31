/**
 * Platform capabilities, declared in `shared` because the renderer needs them
 * too: the Settings window hides a control entirely rather than offering a
 * toggle that silently does nothing on this OS.
 *
 * `electron/platform/types.ts` re-exports these for the main process.
 */

export type PlatformId = 'win32' | 'darwin' | 'linux'

export interface PlatformCapabilities {
  /**
   * `setIgnoreMouseEvents` works. False on Linux, where the API is documented
   * as macOS/Windows only — panels there collapse by resizing instead.
   */
  clickThrough: boolean
  /** The window can be stopped from stealing focus when clicked. */
  noActivate: boolean
  /** A fullscreen app or game in the foreground can be detected. */
  fullscreenDetection: boolean
  /** Launch-at-login can be written. */
  autostart: boolean
  /** `safeStorage` reports a real OS-backed secret store. */
  encryptedStorage: boolean
  /** The window can be pinned above fullscreen windows. */
  alwaysOnTopOverFullscreen: boolean
}
