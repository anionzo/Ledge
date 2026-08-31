/**
 * Build/installation detection.
 *
 * One question lives here today: is this process running as a Microsoft
 * Store (MSIX/APPX) package? The answer gates the auto-updater in
 * `electron/main/updater.ts` — a Store install must never reach out to
 * GitHub for updates, because the Store owns that job and policy forbids a
 * packaged app from shipping its own update channel alongside it.
 *
 * Getting this wrong in either direction is bad, but a false positive is the
 * one that actually hurts someone: it would silently and permanently disable
 * GitHub updates for a person who installed the plain NSIS build, and nothing
 * in the product would ever explain why they stopped receiving them. So this
 * only trusts strong, documented signals — never something soft like the
 * product name or window title, which a Store install has no special claim
 * to and a spoofed value could fake.
 */

/**
 * True when this process is a Store/MSIX build.
 *
 * Two independent Windows-specific signals, either of which alone is already
 * strong evidence:
 *
 * 1. `process.windowsStore` — a boolean Node/Electron itself sets when the
 *    running binary was launched from an app registered with the Windows
 *    Store. This comes from the runtime's own OS-level registration check,
 *    not from anything Ledge infers, which makes it the primary signal.
 * 2. The executable path sits under a `WindowsApps` directory. Every MSIX
 *    package Windows installs is deployed under
 *    `...\WindowsApps\<PackageFamilyName>\...`, a location the Store owns
 *    and keeps read-only (see the `writableCwd` comment in
 *    `electron/platform/win32/system.ts`, which hits the same directory from
 *    the other direction). A plain NSIS install is never placed there.
 *
 * Checked with `||` rather than `&&`: both signals are independently reliable
 * indicators of an actual Store install (neither has a plausible false-positive
 * path on a normal NSIS build), so requiring both would only create false
 * negatives — e.g. on some future Electron/Node build where
 * `process.windowsStore` stops being populated — which is the failure this
 * function must avoid least, since a Store build that keeps polling GitHub
 * violates the platform's update policy rather than merely annoying a user.
 */
export function isStoreBuild(): boolean {
  if (process.windowsStore === true) return true

  const exePath = process.execPath.replace(/\//g, '\\').toLowerCase()
  if (exePath.includes('\\windowsapps\\')) return true

  return false
}
