/**
 * Capability assembly.
 *
 * Each platform folder declares the five capabilities it knows statically —
 * those are properties of the OS and its APIs, not of this machine. The sixth,
 * `encryptedStorage`, is deliberately *not* declared: it has to be measured.
 *
 * On Windows and macOS `safeStorage` is backed by DPAPI and the Keychain and
 * is effectively always available. On Linux it is backed by libsecret talking
 * to gnome-keyring or kwallet over D-Bus, and on a headless box, a minimal
 * window manager, or a distro where neither daemon is installed there is no
 * store at all — `safeStorage.isEncryptionAvailable()` returns false and
 * `encryptString` throws. Hardcoding `true` there would mean the Settings
 * window offers "remember this token" and the write then fails at runtime,
 * which is the exact failure the capability flags exist to prevent.
 *
 * Timing note: on Linux `isEncryptionAvailable()` is only meaningful after
 * `app.whenReady()`, because Electron picks the backend during startup. So the
 * probe is re-run on every read until it first answers `true`, and only then
 * memoised. An adapter constructed before `ready` therefore cannot bake in a
 * wrong `false`.
 */
import type { PlatformCapabilities } from './types'
import { getElectron } from './shared/nativeRequire'

/** The five OS-determined flags. `encryptedStorage` is measured, not declared. */
export type StaticCapabilities = Omit<PlatformCapabilities, 'encryptedStorage'>

let knownAvailable = false

/**
 * True when Electron reports a real OS-backed secret store.
 *
 * Never throws: outside Electron, or on a Linux box with no keyring daemon,
 * the honest answer is `false`.
 */
export function hasEncryptedStorage(): boolean {
  if (knownAvailable) return true
  try {
    knownAvailable = getElectron()?.safeStorage?.isEncryptionAvailable() === true
  } catch {
    // Linux without libsecret can throw rather than return false.
    knownAvailable = false
  }
  return knownAvailable
}

/** Test seam: forget that the store was ever seen as available. */
export function resetEncryptedStorageCache(): void {
  knownAvailable = false
}

/**
 * Combine a platform's static flags with the measured `encryptedStorage`.
 *
 * Returns a plain frozen data object — no accessors — because this value is
 * sent to the renderer over IPC as part of `app:bootstrap` and has to survive
 * structured cloning. Adapters expose `capabilities` as a getter that calls
 * this, so each read re-measures rather than serving a snapshot taken before
 * the app was ready.
 */
export function buildCapabilities(statics: StaticCapabilities): PlatformCapabilities {
  return Object.freeze({
    clickThrough: statics.clickThrough,
    noActivate: statics.noActivate,
    fullscreenDetection: statics.fullscreenDetection,
    autostart: statics.autostart,
    alwaysOnTopOverFullscreen: statics.alwaysOnTopOverFullscreen,
    encryptedStorage: hasEncryptedStorage()
  })
}
