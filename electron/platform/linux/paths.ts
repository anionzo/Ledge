/**
 * Where the agent CLIs keep their state on Linux.
 *
 * XDG-aware for the two things that actually follow the spec:
 *
 *  - Ledge's own data directory and Cursor's, both of which live under
 *    `$XDG_CONFIG_HOME` (default `~/.config`). Cursor is VS Code, and VS Code
 *    is the reason `~/.config/Cursor/User/globalStorage` is the right answer
 *    rather than `~/.local/share` — Code stores `state.vscdb` under its
 *    *config* directory on Linux, not its data directory.
 *  - OpenCode, which uses `$XDG_DATA_HOME` (default `~/.local/share`); that
 *    one is shared with the other platforms in `../shared/userPaths.ts`.
 *
 * Claude, Codex and Grok are *not* XDG-aware — they use plain home dotfolders
 * on every OS — so honouring `$XDG_CONFIG_HOME` for them would point the
 * readers somewhere the CLIs never write. Their own env overrides
 * (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `GROK_HOME`) are the supported way to
 * relocate them and are honoured instead.
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

/** `$XDG_CONFIG_HOME`, or `~/.config` per the XDG base directory spec. */
export function xdgConfigHome(): string {
  return envDir('XDG_CONFIG_HOME') ?? join(home(), '.config')
}

/** `$XDG_DATA_HOME`, or `~/.local/share`. */
export function xdgDataHome(): string {
  return envDir('XDG_DATA_HOME') ?? join(home(), '.local', 'share')
}

export const paths: PlatformPaths = {
  appData: () => appDataDir(join(xdgConfigHome(), 'Ledge')),
  claudeHome,
  codexHome,
  cursorGlobalStorage: () => join(xdgConfigHome(), 'Cursor', 'User', 'globalStorage'),
  openCodeAuth,
  grokHome
}
