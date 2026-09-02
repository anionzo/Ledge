/**
 * Launch smoke test.
 *
 * The gate that exists because typecheck, build and 298 unit tests all passed
 * on a main process that died before `whenReady`: `electron-updater` is
 * CommonJS, the named import compiled fine, and Node refused it at load. Every
 * check we had was green and the app did not start. Nothing short of starting
 * it could have caught that.
 *
 * So this starts it. It runs the built app under the `LEDGE_CAPTURE` harness
 * already in `electron/main/index.ts`, which opens the hub, walks all five
 * Settings tabs, writes a PNG of each and quits. A missing PNG means a window
 * never rendered; a non-zero exit means the process died; a fatal line on
 * stderr means it threw on the way up.
 *
 * Deliberately NOT "stderr must be empty". Chromium is chatty on every
 * platform — GPU state warnings on Windows, dbus and sandbox noise on a Linux
 * runner — and a gate that cries wolf gets deleted. Only the signatures of an
 * actual startup failure fail the build.
 *
 * Usage: `npm run smoke`. On Linux it needs an X server; CI wraps it in
 * `xvfb-run`.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

/** Long enough for the harness's own waits (~12s) plus a cold first paint. */
const TIMEOUT_MS = 120_000

/** Every window the harness is expected to have rendered. */
const EXPECTED = [
  'hub.png',
  'preview.png',
  'settings-behaviour.png',
  'settings-panels.png',
  'settings-agents.png',
  'settings-appearance.png',
  'settings-about.png'
]

/**
 * Lines that mean the app failed to start, as opposed to the ambient noise
 * every Electron process writes. Kept narrow and specific: the first entry is
 * the exact banner Electron prints when the main bundle throws during module
 * load, which is what the updater regression produced.
 */
const FATAL = [
  /App threw an error during load/i,
  /A JavaScript error occurred in the main process/i,
  /Cannot find module/i,
  /^\s*(SyntaxError|ReferenceError):/im
]

function electronBinary() {
  // `electron`'s main export is the path to its binary, which is how it is
  // meant to be resolved — hardcoding node_modules/.bin breaks on Windows,
  // where that entry is a shell shim rather than the executable.
  const require = createRequire(import.meta.url)
  const resolved = require('electron')
  if (typeof resolved !== 'string') {
    throw new Error('could not resolve the electron binary path')
  }
  return resolved
}

function run() {
  const dir = mkdtempSync(join(tmpdir(), 'ledge-smoke-'))
  // A throwaway profile, which buys two things at once. Electron's
  // single-instance lock is scoped to the user-data directory, so this runs
  // even while a real Ledge sits in the tray — otherwise the second copy quits
  // instantly and the gate reports a mysteriously empty success. And it stops
  // the harness seeding its demo clips into the user's actual history, which
  // it had been doing every time anyone ran it.
  const profile = mkdtempSync(join(tmpdir(), 'ledge-smoke-profile-'))
  const child = spawn(electronBinary(), ['.', `--user-data-dir=${profile}`], {
    env: { ...process.env, LEDGE_CAPTURE: dir },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (c) => {
    stdout += String(c)
  })
  child.stderr.on('data', (c) => {
    stderr += String(c)
  })

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      // A hang is a failure with its own signature: the harness always quits,
      // so still being alive means something is blocking the main process.
      child.kill('SIGKILL')
      resolve({ dir, profile, code: null, stdout, stderr, timedOut: true })
    }, TIMEOUT_MS)

    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ dir, code: null, stdout, stderr: `${stderr}\n${String(err)}`, timedOut: false })
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ dir, profile, code, stdout, stderr, timedOut: false })
    })
  })
}

/** Both temp trees, always — a failed run leaves as much behind as a good one. */
function cleanup({ dir, profile }) {
  rmSync(dir, { recursive: true, force: true })
  rmSync(profile, { recursive: true, force: true })
}

const result = await run()
const failures = []
const present = existsSync(result.dir) ? readdirSync(result.dir) : []

if (result.timedOut) failures.push(`the app never exited within ${TIMEOUT_MS / 1000}s`)
if (!result.timedOut && result.code !== 0) failures.push(`exited with code ${String(result.code)}`)
for (const name of EXPECTED) {
  if (!present.includes(name)) failures.push(`never rendered: ${name}`)
}

for (const pattern of FATAL) {
  const hit = pattern.exec(result.stderr)
  if (hit) failures.push(`fatal on stderr: ${hit[0].trim()}`)
}

if (failures.length === 0) {
  console.log(`[smoke] ok — ${present.length} window captures, exit 0`)
  cleanup(result)
  process.exit(0)
}

console.error('[smoke] FAILED')
for (const failure of failures) console.error(`  - ${failure}`)
// The output is the evidence; print it rather than making someone re-run
// locally to find out what the runner saw.
if (result.stdout.trim()) console.error(`\n--- stdout ---\n${result.stdout.trim()}`)
if (result.stderr.trim()) console.error(`\n--- stderr ---\n${result.stderr.trim()}`)
console.error(`\ncaptures written: ${present.length === 0 ? '(none)' : present.join(', ')}`)
rmSync(result.dir, { recursive: true, force: true })
process.exit(1)
