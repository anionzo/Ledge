/**
 * Launch-at-login on Windows.
 *
 * `app.setLoginItemSettings` writes
 * `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`. Two things learned
 * from Edge-Drop's `loginItems.ts` are carried over:
 *
 *  1. **Never disable before enabling.** Writing `openAtLogin: false` stamps
 *     the entry as Off in `StartupApproved\Run`, which is the state the Task
 *     Manager Startup tab shows. Windows then treats a subsequent enable as
 *     something the user has already declined, and the in-app toggle appears
 *     to do nothing. So the enable path writes the entry directly.
 *
 *  2. **A stable, explicit `name`.** Electron defaults the Run value name to
 *     the app name, which changes if `productName` ever does, leaving an
 *     orphaned entry that still launches the app. Pinning it means an upgrade
 *     rewrites the same value instead of adding a second one.
 *
 * The `--hidden` argument tells `electron/main` to start without flashing the
 * panels open, which is the only sensible behaviour for a login item.
 */
import {
  executablePath,
  isPackagedBuild,
  readLoginItem,
  writeLoginItem
} from '../shared/loginItems'

/** The Run value name. Do not change it without also clearing the old one. */
const RUN_VALUE_NAME = 'Ledge'
const LAUNCH_ARGS = ['--hidden']

export async function getAutostart(): Promise<boolean> {
  const exe = executablePath()
  if (!exe) return false
  return readLoginItem({ path: exe, args: LAUNCH_ARGS })
}

export async function setAutostart(enabled: boolean): Promise<void> {
  const exe = executablePath()
  if (!exe) return

  // In dev the exe is Electron's own binary; writing a Run key for it would
  // launch a bare Electron at every login and survive the dev session.
  if (!isPackagedBuild()) return

  if (enabled) {
    writeLoginItem({
      openAtLogin: true,
      path: exe,
      args: LAUNCH_ARGS,
      name: RUN_VALUE_NAME,
      enabled: true
    })
    return
  }

  writeLoginItem({
    openAtLogin: false,
    path: exe,
    name: RUN_VALUE_NAME
  })
}
