/**
 * Executable validation for `runCommand`.
 *
 * Ported from Edge-Drop's `electron/main/pathValidation.ts` and tightened for
 * this use. Edge-Drop validated *file* paths before handing them to
 * PowerShell; here the same rules guard the *executable* half of a
 * user-configured command line before anything reaches a shell.
 *
 * The threat model: `runCommand` exists so a user can point a custom quota
 * provider at their own CLI (`my-cli usage --json`). That string comes out of
 * the settings store, so it is user input in the "could contain a typo, a
 * stray NUL, or a paste of something unexpected" sense. We resolve and check
 * the program before spawning, so a command whose program does not exist
 * fails as a clean `CommandResult` instead of a shell error, and control
 * characters never reach the shell at all.
 */
import { existsSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'

/** Windows caps a path at 32767 wide chars; nothing legitimate approaches it. */
const MAX_PATH_LEN = 32767

/**
 * True when `p` is a plausible, non-hostile path or program name.
 *
 * Rejects non-strings, empty strings, NUL bytes and ASCII control characters
 * (0x00-0x1F, 0x7F), and the Windows-invalid characters `* ? < > | "`. The
 * control-character rule is the important one: a NUL truncates the string as
 * seen by the OS, so a value that validates as one path can execute as
 * another.
 */
export function isValidExecutablePath(p: unknown): p is string {
  if (typeof p !== 'string') return false
  const trimmed = p.trim()
  if (!trimmed || trimmed.length > MAX_PATH_LEN) return false
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return false
  if (/[*?<>|"]/.test(trimmed)) return false
  return true
}

/** `isValidExecutablePath` plus "and it is actually on disk". */
export function isExistingFile(p: unknown): p is string {
  if (!isValidExecutablePath(p)) return false
  try {
    return existsSync(p) && statSync(p).isFile()
  } catch {
    return false
  }
}

/**
 * Additional rules for a *bare* program name (no directory separators), the
 * form that gets looked up on PATH. Shell metacharacters are rejected outright
 * here: a name containing `;`, `&`, `$`, backtick or a newline is never a real
 * program and is the shape an injection attempt takes.
 */
export function isValidProgramName(name: unknown): name is string {
  if (!isValidExecutablePath(name)) return false
  const trimmed = (name as string).trim()
  if (trimmed.length > 255) return false
  return /^[A-Za-z0-9._+@-]+$/.test(trimmed)
}

/**
 * Split the program off the front of a command line.
 *
 * Handles a double-quoted program path (`"C:\Program Files\x\y.exe" --flag`)
 * because that is how a Windows path with a space has to be written. Returns
 * `null` when the line is empty or the quote is unterminated — an
 * unterminated quote means we cannot tell where the program ends, and
 * guessing is exactly the mistake this module exists to prevent.
 */
export function parseExecutableToken(command: unknown): string | null {
  if (typeof command !== 'string') return null
  const line = command.trim()
  if (!line) return null

  if (line.startsWith('"')) {
    const end = line.indexOf('"', 1)
    if (end <= 1) return null
    return line.slice(1, end)
  }
  if (line.startsWith("'")) {
    const end = line.indexOf("'", 1)
    if (end <= 1) return null
    return line.slice(1, end)
  }

  const match = /^\S+/.exec(line)
  return match ? match[0] : null
}

/** True when the token names a location rather than a PATH lookup. */
export function looksLikePath(token: string): boolean {
  return isAbsolute(token) || token.includes('/') || token.includes('\\')
}
