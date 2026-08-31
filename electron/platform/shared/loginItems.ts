/**
 * `app.setLoginItemSettings` plumbing shared by the Windows and macOS
 * adapters. Linux has no Electron support for this at all and writes an XDG
 * autostart file instead — see `../linux/autostart.ts`.
 *
 * Everything here is written to never throw. Launch-at-login is a preference,
 * not a critical path: if the registry write or the Launch Services call
 * fails, the honest outcome is "the toggle did not take", not a crashed main
 * process.
 */
import type { app as ElectronApp } from 'electron'
import { getElectron } from './nativeRequire'

type LoginItemSettingsOptions = Parameters<typeof ElectronApp.getLoginItemSettings>[0]
type LoginItemSettings = Parameters<typeof ElectronApp.setLoginItemSettings>[0]

/**
 * Read launch-at-login as the OS currently has it.
 *
 * The OS is the source of truth on purpose: the user can turn Ledge off in
 * Task Manager's Startup tab or System Settings > Login Items without telling
 * the app, and a settings toggle that disagrees with reality is worse than no
 * toggle. Returns `false` — not the stored preference — when the read fails,
 * because "we could not confirm it is on" should not render as on.
 */
export function readLoginItem(options?: LoginItemSettingsOptions): boolean {
  try {
    const app = getElectron()?.app
    if (!app) return false

    const settings = app.getLoginItemSettings(options)
    if (settings.executableWillLaunchAtLogin) return true
    // `launchItems` is Windows-only and lists every Run-key entry pointing at
    // this executable, including ones written by an older version of the app.
    const items = settings.launchItems ?? []
    if (items.some((item) => item.enabled)) return true
    return settings.openAtLogin === true
  } catch (err) {
    console.error('[platform] getLoginItemSettings failed:', err)
    return false
  }
}

/** Write launch-at-login. Swallows failures; verify with `readLoginItem`. */
export function writeLoginItem(settings: LoginItemSettings): void {
  try {
    getElectron()?.app?.setLoginItemSettings(settings)
  } catch (err) {
    console.error('[platform] setLoginItemSettings failed:', err)
  }
}

/**
 * The binary the OS should launch.
 *
 * In development this is the Electron helper binary rather than Ledge, so an
 * autostart entry written from `npm run dev` would point at a throwaway path.
 * Callers check `app.isPackaged` and skip the OS write in that case.
 */
export function executablePath(): string | null {
  try {
    return getElectron()?.app?.getPath('exe') ?? null
  } catch {
    return null
  }
}

/** True when running from a packaged build; false in dev or outside Electron. */
export function isPackagedBuild(): boolean {
  try {
    return getElectron()?.app?.isPackaged === true
  } catch {
    return false
  }
}
