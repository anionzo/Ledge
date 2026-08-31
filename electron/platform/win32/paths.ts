/**
 * Where the agent CLIs keep their state on Windows.
 *
 * Note what is *not* under `%APPDATA%` here. Claude Code, Codex, Grok and
 * OpenCode are cross-platform programs that call `os.homedir()` and use a
 * dotfolder on every OS, so on Windows their state lives at
 * `C:\Users\<user>\.claude`, `\.codex`, `\.grok` and
 * `\.local\share\opencode` — not in Roaming. Cursor is the exception: it is
 * VS Code, so it follows the platform convention and lands in
 * `%APPDATA%\Cursor`. Pointing the quota readers at `%APPDATA%\.claude`
 * because it looks more Windows-native would simply find nothing.
 *
 * Ledge's own data directory falls back to `%APPDATA%\Ledge` — Roaming, not
 * Local — because that is what Electron's `userData` resolves to on Windows,
 * and the fallback only exists for the case where Electron cannot be asked.
 * `localAppData()` is exported for callers that need the Local branch (large
 * caches that should not roam).
 */
import { join } from 'node:path'
import type { PlatformPaths } from '../types'
import {
  appDataDir,
  claudeHome,
  codexHome,
  envDir,
  grokHome,
  home,
  openCodeAuth
} from '../shared/userPaths'

/** `%APPDATA%`, or the standard location under the user's home. */
function roamingAppData(): string {
  return envDir('APPDATA') ?? join(home(), 'AppData', 'Roaming')
}

/** `%LOCALAPPDATA%`, or the standard location under the user's home. */
function localAppData(): string {
  return envDir('LOCALAPPDATA') ?? join(home(), 'AppData', 'Local')
}

export const paths: PlatformPaths = {
  appData: () => appDataDir(join(roamingAppData(), 'Ledge')),
  claudeHome,
  codexHome,
  /** `%APPDATA%\Cursor\User\globalStorage`, which holds `state.vscdb`. */
  cursorGlobalStorage: () => join(roamingAppData(), 'Cursor', 'User', 'globalStorage'),
  openCodeAuth,
  grokHome
}

export { localAppData, roamingAppData }
