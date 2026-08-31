/**
 * Command execution on Windows.
 *
 * `runCommand` goes through `cmd.exe /d /s /c`:
 *   /d  skip AutoRun registry commands, so a per-user `HKCU\...\Command
 *       Processor\AutoRun` value cannot inject itself into every command
 *       Ledge runs.
 *   /s  use the documented "strip the outer quotes and take the rest
 *       verbatim" rule, which is the only predictable way to pass a command
 *       line containing quoted paths.
 *   /c  run and exit.
 *
 * The program at the front of the line is validated and resolved by
 * `runShellCommand` before `cmd.exe` ever sees the string — see
 * `../shared/exec.ts` and `../shared/pathValidation.ts`.
 */
import type { CommandResult, RunCommandOptions } from '../types'
import { createWhich, runShellCommand, type ShellSpec } from '../shared/exec'
import { cmdPath, wherePath } from './system'

/** `where.exe` prints every match, one per line; the first one wins. */
export const which = createWhich(wherePath())

function spec(): ShellSpec {
  return { shell: cmdPath(), args: ['/d', '/s', '/c'] }
}

export function runCommand(
  command: string,
  options: RunCommandOptions = {}
): Promise<CommandResult> {
  return runShellCommand(command, spec(), which, options)
}
