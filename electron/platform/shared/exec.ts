/**
 * Process spawning for the platform layer.
 *
 * Two entry points, and the difference between them matters:
 *
 *  - `execFileCapture` takes an argv array and spawns **without a shell**.
 *    Everything the platform layer originates itself uses this — keychain
 *    reads, `where.exe`/`which`, PowerShell. An argv array cannot be
 *    injection-escaped out of, so no quoting rules are needed and no user
 *    value is ever concatenated into a command string.
 *
 *  - `runShellCommand` is the one place a shell is involved, because
 *    `PlatformAdapter.runCommand` exists so a user can configure a real
 *    command line (pipes, flags, `&&`) for a custom quota provider. Before
 *    that string reaches the shell, the program at the front of it is parsed
 *    out, validated by `pathValidation`, and resolved on disk or on PATH. A
 *    command whose program does not exist never spawns.
 *
 * Both enforce a timeout and an output cap. Nothing here throws: the whole
 * platform layer's contract is that an unsupported or failed operation
 * produces an empty/falsy result, so failures come back as
 * `{ ok: false, code: null }` with the reason in `stderr`.
 */
import { spawn } from 'node:child_process'
import type { CommandResult, RunCommandOptions } from '../types'
import {
  isExistingFile,
  isValidProgramName,
  looksLikePath,
  parseExecutableToken
} from './pathValidation'

/** Default ceiling for a single command. Long enough for a cold CLI start. */
export const DEFAULT_TIMEOUT_MS = 10_000
/** Hard ceiling, so a bad settings value cannot wedge a poll loop forever. */
export const MAX_TIMEOUT_MS = 60_000
/** Per-stream cap. A quota CLI emitting more than this is malfunctioning. */
const MAX_OUTPUT_BYTES = 1024 * 1024

export function clampTimeout(ms: number | undefined): number {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return DEFAULT_TIMEOUT_MS
  return Math.min(Math.trunc(ms), MAX_TIMEOUT_MS)
}

/** A failure shaped like a real result, so callers never need a try/catch. */
export function commandFailure(reason: string): CommandResult {
  return { ok: false, stdout: '', stderr: reason, code: null }
}

export interface SpawnCaptureOptions extends RunCommandOptions {
  /** Run through the platform shell. Only `runShellCommand` sets this. */
  shell?: boolean
}

/**
 * Spawn and collect stdout/stderr, resolving with a `CommandResult`.
 *
 * `ok` means "exited 0". A non-zero exit is a normal, non-throwing outcome —
 * `security find-generic-password` exiting 44 for "no such item" is a result,
 * not an error, and the callers depend on seeing the code.
 */
export function execFileCapture(
  file: string,
  args: readonly string[],
  options: SpawnCaptureOptions = {}
): Promise<CommandResult> {
  const timeoutMs = clampTimeout(options.timeoutMs)

  return new Promise<CommandResult>((resolve) => {
    let settled = false
    let stdout = ''
    let stderr = ''
    let timedOut = false

    const finish = (result: CommandResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    let child: ReturnType<typeof spawn>
    try {
      child = spawn(file, [...args], {
        // No shell unless the caller explicitly asked for one.
        shell: options.shell === true,
        // Never flash a console window on Windows; ignored elsewhere.
        windowsHide: true,
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : process.env,
        // stdin is closed: a CLI that decides to prompt gets EOF and exits
        // rather than hanging until the timeout.
        stdio: ['ignore', 'pipe', 'pipe']
      })
    } catch (err) {
      resolve(commandFailure(`spawn failed: ${errText(err)}`))
      return
    }

    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      timedOut = true
      try {
        child.kill()
      } catch {
        /* already gone */
      }
      finish(commandFailure(`timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    // Do not keep the Electron main process alive purely for a poll. Cast
    // because `setTimeout` is typed as returning a `number` under DOM lib.
    ;(timer as unknown as { unref?: () => void }).unref?.()

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      if (stdout.length < MAX_OUTPUT_BYTES) stdout += chunk
    })
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk
    })

    child.on('error', (err) => {
      finish(commandFailure(errText(err)))
    })

    child.on('close', (code) => {
      if (timedOut) return
      finish({
        ok: code === 0,
        stdout: stdout.slice(0, MAX_OUTPUT_BYTES),
        stderr: stderr.slice(0, MAX_OUTPUT_BYTES),
        code
      })
    })
  })
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export interface ShellSpec {
  /** Absolute path to the shell binary. */
  shell: string
  /** Args that precede the command string, e.g. `['-c']`. */
  args: readonly string[]
}

/**
 * Validate the program at the front of `command`, then run the whole line
 * through `spec.shell`.
 *
 * `resolveProgram` is the platform's PATH lookup (`where.exe` / `which`); it
 * is injected rather than imported so this file stays free of any
 * `process.platform` branch — `electron/platform/index.ts` is the only file
 * allowed one.
 */
export async function runShellCommand(
  command: string,
  spec: ShellSpec,
  resolveProgram: (name: string) => Promise<string | null>,
  options: RunCommandOptions = {}
): Promise<CommandResult> {
  const token = parseExecutableToken(command)
  if (!token) {
    return commandFailure('empty command, or an unterminated quote around the program')
  }

  if (looksLikePath(token)) {
    // An explicit path must exist right now. Resolving it here means the
    // shell is never asked to interpret a path we have not seen.
    if (!isExistingFile(token)) {
      return commandFailure(`not an executable file: ${token}`)
    }
  } else {
    if (!isValidProgramName(token)) {
      return commandFailure(`rejected program name: ${token}`)
    }
    const found = await resolveProgram(token)
    if (!found) return commandFailure(`not found on PATH: ${token}`)
  }

  if (!isExistingFile(spec.shell)) {
    return commandFailure(`shell unavailable: ${spec.shell}`)
  }

  return execFileCapture(spec.shell, [...spec.args, command], options)
}

/**
 * Build a `which(name)` for a platform, given its lookup tool.
 *
 * `where.exe` prints one match per line and `which` prints one line; both are
 * handled by taking the first non-empty line. The name is validated first, so
 * the lookup tool is never handed anything but `[A-Za-z0-9._+@-]+`.
 */
export function createWhich(lookupTool: string): (name: string) => Promise<string | null> {
  return async function which(name: string): Promise<string | null> {
    const raw = typeof name === 'string' ? name.trim() : ''
    if (!raw) return null

    if (looksLikePath(raw)) {
      // A caller passing a path wants "does this exist", not a PATH search.
      return isExistingFile(raw) ? raw : null
    }
    if (!isValidProgramName(raw)) return null

    const result = await execFileCapture(lookupTool, [raw], { timeoutMs: 3000 })
    if (!result.ok) return null

    const first = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0)

    // `where.exe` can exit 0 while printing an informational line rather than
    // a path, and some `which` builds print "name not found" to stdout with a
    // zero exit. Requiring a real file on disk avoids trusting either.
    return first && isExistingFile(first) ? first : null
  }
}
