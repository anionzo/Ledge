/**
 * Where the agent CLIs keep their state on macOS.
 *
 * Only Cursor differs from the other platforms. It is VS Code, so it uses the
 * macOS application-support convention:
 * `~/Library/Application Support/Cursor/User/globalStorage`, which is where
 * `state.vscdb` lives. Everything else is a home dotfolder on macOS exactly as
 * it is on Windows and Linux — see `../shared/userPaths.ts`.
 *
 * `CLAUDE_CONFIG_DIR` matters more here than elsewhere: a macOS user who has
 * relocated their Claude config still keeps the *tokens* in the Keychain (see
 * `./secrets.ts`), so the config directory and the credential source are two
 * separate lookups on this platform.
 */
import { join } from 'node:path'
import type { PlatformPaths } from '../types'
import {
  appDataDir,
  claudeHome,
  codexHome,
  grokHome,
  home,
  openCodeAuth
} from '../shared/userPaths'

/** `~/Library/Application Support`. */
function applicationSupport(): string {
  return join(home(), 'Library', 'Application Support')
}

export const paths: PlatformPaths = {
  appData: () => appDataDir(join(applicationSupport(), 'Ledge')),
  claudeHome,
  codexHome,
  cursorGlobalStorage: () => join(applicationSupport(), 'Cursor', 'User', 'globalStorage'),
  openCodeAuth,
  grokHome
}

export { applicationSupport }
