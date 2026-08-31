/**
 * Command execution on macOS.
 *
 * `/bin/sh -c` rather than the user's login shell. A user-configured quota
 * command is a one-liner, and running it under zsh with the user's `.zshrc`
 * loaded would make the result depend on their prompt framework, their nvm
 * shims, and how long their rc file takes — none of which belongs in a
 * polling loop. `/bin/sh` is guaranteed present and starts in a few
 * milliseconds.
 *
 * The trade-off, worth stating because it will come up: a command relying on
 * a PATH entry that only `.zshrc` adds will not be found. That surfaces as a
 * clean `not found on PATH` in `CommandResult.stderr` rather than a silent
 * empty reading, and the fix is for the user to give an absolute path.
 *
 * `which` is the BSD `/usr/bin/which` shipped with macOS, addressed
 * absolutely so a PATH entry cannot shadow it.
 */
import type { CommandResult, RunCommandOptions } from '../types'
import { createWhich, runShellCommand, type ShellSpec } from '../shared/exec'

const SHELL: ShellSpec = { shell: '/bin/sh', args: ['-c'] }

export const which = createWhich('/usr/bin/which')

export function runCommand(
  command: string,
  options: RunCommandOptions = {}
): Promise<CommandResult> {
  return runShellCommand(command, SHELL, which, options)
}
