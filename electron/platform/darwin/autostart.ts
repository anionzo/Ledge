/**
 * Launch-at-login on macOS.
 *
 * `app.setLoginItemSettings` here registers a Service Management login item
 * (Ventura and later surface it in System Settings > General > Login Items).
 * Two differences from the Windows adapter, both deliberate:
 *
 *  - **No `path` or `name`.** Those options are Windows-only; on macOS Launch
 *    Services registers the running `.app` bundle itself. Passing a path is
 *    ignored at best.
 *
 *  - **No `openAsHidden`.** That option is deprecated in current Electron and
 *    dropped from the `LoginItemSettings` type. It is also moot here: Ledge is
 *    an `LSUIElement` agent app (see the `mac.extendInfo` block in
 *    `package.json`), so it has no Dock tile or menu bar to hide on launch.
 *    `args: ['--hidden']` is *not* passed either, because macOS login items do
 *    not reliably forward arguments the way a Windows Run key does.
 *
 * The user can revoke the login item from System Settings at any time, which
 * is why `getAutostart` asks the OS rather than trusting a stored preference.
 */
import { isPackagedBuild, readLoginItem, writeLoginItem } from '../shared/loginItems'

export async function getAutostart(): Promise<boolean> {
  return readLoginItem()
}

export async function setAutostart(enabled: boolean): Promise<void> {
  // In dev the bundle is Electron's own; registering it would leave a login
  // item for a throwaway binary behind after the dev session ends.
  if (!isPackagedBuild()) return

  writeLoginItem({
    openAtLogin: enabled
  })
}
