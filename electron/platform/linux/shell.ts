/**
 * Command execution on Linux.
 *
 * `/bin/sh -c`, not the user's login shell, for the same reason as macOS: a
 * quota poll should not be paying for someone's `.bashrc`, and `/bin/sh` is
 * the one shell guaranteed to exist. See `../darwin/shell.ts`.
 *
 * `which` is looked up on PATH rather than pinned to an absolute path, which
 * is the one place this adapter is deliberately looser than the other two.
 * There is no single correct location: it is `/usr/bin/which` on Debian and
 * Fedora, `/bin/which` on some older layouts, and on a growing number of
 * images it is a shell builtin with no binary at all. `createWhich` still
 * validates the program name before the lookup runs and still requires the
 * answer to be a real file on disk, so a hijacked `which` cannot smuggle a
 * non-existent path back.
 *
 * The AppImage case is worth flagging: an AppImage prepends its own mount
 * point to PATH for the app's children, so a `which` run from inside one can
 * resolve to a bundled binary rather than the user's. That is why an absolute
 * path in the user's configured command is always the reliable option.
 */
import type { CommandResult, RunCommandOptions } from '../types'
import { createWhich, runShellCommand, type ShellSpec } from '../shared/exec'

const SHELL: ShellSpec = { shell: '/bin/sh', args: ['-c'] }

export const which = createWhich('which')

export function runCommand(
  command: string,
  options: RunCommandOptions = {}
): Promise<CommandResult> {
  return runShellCommand(command, SHELL, which, options)
}
