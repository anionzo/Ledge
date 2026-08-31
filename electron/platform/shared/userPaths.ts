/**
 * Location helpers shared by all three `paths.ts` implementations.
 *
 * Most agent CLIs are cross-platform Node/Go/Bun programs that put their state
 * in a dotfolder under the user's home on *every* OS, including Windows — they
 * call `os.homedir()`, not `SHGetKnownFolderPath`. So `~/.claude`,
 * `~/.codex`, `~/.grok` and `~/.local/share/opencode` are literally the same
 * expressions everywhere, and only the IDE (Cursor, which is VS Code and does
 * follow each OS's convention) actually differs. Keeping the identical parts
 * here means a change to, say, the `CLAUDE_CONFIG_DIR` rule happens once
 * instead of drifting between three files.
 *
 * Every override is read at call time rather than cached at module load: the
 * quota providers re-read these between polls, and a user who exports
 * `CLAUDE_CONFIG_DIR` and restarts the CLI should not have to restart Ledge.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getElectron } from './nativeRequire'

/** Trimmed env var, or `null` when unset or blank. */
export function envDir(name: string): string | null {
  const raw = process.env[name]
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** First non-empty of several env vars. */
export function firstEnvDir(...names: string[]): string | null {
  for (const name of names) {
    const value = envDir(name)
    if (value) return value
  }
  return null
}

/**
 * The user's home directory.
 *
 * `os.homedir()` already reads `USERPROFILE` on Windows and `HOME` elsewhere,
 * so there is nothing to branch on. The empty-string fallback is defensive:
 * `homedir()` can throw on a machine with no passwd entry (some containers),
 * and a `paths.*()` call must never throw.
 */
export function home(): string {
  try {
    return homedir() || ''
  } catch {
    return ''
  }
}

/**
 * Where Ledge keeps its own data.
 *
 * Electron's `userData` is the right answer on all three platforms and already
 * encodes each OS's convention (`%APPDATA%\Ledge`,
 * `~/Library/Application Support/Ledge`, `~/.config/Ledge`). `fallback` is
 * only used when Electron is unavailable — a unit test, or a tooling process
 * importing the adapter outside the app.
 */
export function appDataDir(fallback: string): string {
  try {
    const path = getElectron()?.app?.getPath('userData')
    if (path) return path
  } catch {
    // `getPath` throws if the app has no name yet. Fall through.
  }
  return fallback
}

/** `~/.claude`, honouring `CLAUDE_CONFIG_DIR` — Claude Code reads it first. */
export function claudeHome(): string {
  return envDir('CLAUDE_CONFIG_DIR') ?? join(home(), '.claude')
}

/** `~/.codex`, honouring `CODEX_HOME`. */
export function codexHome(): string {
  return envDir('CODEX_HOME') ?? join(home(), '.codex')
}

/** `~/.grok`. `XAI_HOME` is the older name and is still honoured. */
export function grokHome(): string {
  return firstEnvDir('GROK_HOME', 'XAI_HOME') ?? join(home(), '.grok')
}

/**
 * OpenCode's `auth.json`.
 *
 * OpenCode follows the XDG data spec on every platform, Windows included — it
 * does not fall back to `%APPDATA%` there — so this is `$XDG_DATA_HOME` when
 * set and `~/.local/share` otherwise, which on Windows lands at
 * `C:\Users\<user>\.local\share\opencode\auth.json`.
 */
export function openCodeAuth(): string {
  const dataHome = envDir('XDG_DATA_HOME') ?? join(home(), '.local', 'share')
  return join(dataHome, 'opencode', 'auth.json')
}
