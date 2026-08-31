/**
 * Absolute paths to the Windows system binaries this adapter spawns.
 *
 * Ported from Edge-Drop's `electron/main/powershell.ts`.
 *
 * These are built from `%SystemRoot%` rather than looked up on `PATH` on
 * purpose. `PATH` is per-user and writable, so resolving `powershell` or
 * `where` through it is a classic hijack: drop a `where.exe` earlier on the
 * path and every PATH probe Ledge makes runs attacker code. `%SystemRoot%` is
 * machine state, and the fallback to `C:\Windows` covers the case where the
 * variable has been cleared.
 */
import { join } from 'node:path'

/** `%SystemRoot%`, defaulting to `C:\Windows`. */
export function systemRoot(): string {
  const root = process.env.SystemRoot ?? process.env.SYSTEMROOT ?? process.env.windir
  const trimmed = typeof root === 'string' ? root.trim() : ''
  return trimmed || 'C:\\Windows'
}

/** `%SystemRoot%\System32\<name>`. */
export function system32(name: string): string {
  return join(systemRoot(), 'System32', name)
}

/** The shell `runCommand` uses. `%ComSpec%` is ignored for the reason above. */
export function cmdPath(): string {
  return system32('cmd.exe')
}

/** `where.exe`, the Windows PATH lookup tool. */
export function wherePath(): string {
  return system32('where.exe')
}

/**
 * Windows PowerShell 5.1, which ships in-box on every supported Windows.
 *
 * Deliberately not `pwsh`: PowerShell 7 is an optional install, so depending
 * on it would make credential reads work on some machines and not others.
 */
export function powerShellPath(): string {
  return join(systemRoot(), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

/**
 * A working directory the child process can actually write to.
 *
 * A packaged Store build launches from under `WindowsApps`, which is
 * read-only; PowerShell inherits that as its cwd and some cmdlets fail
 * outright. Handing it `%TEMP%` avoids the whole class of problem.
 */
export function writableCwd(): string {
  for (const candidate of [process.env.TEMP, process.env.TMP, process.env.USERPROFILE]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return join(systemRoot(), 'Temp')
}
