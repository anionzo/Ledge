/**
 * Linux secret store reads, via `secret-tool` (libsecret).
 *
 * `secret-tool` talks the Secret Service D-Bus API, which is what
 * gnome-keyring and kwallet's KSecretService bridge both implement. It is the
 * closest thing Linux has to the Keychain, and it is the same store Electron's
 * own `safeStorage` uses on this platform.
 *
 * It is also frequently just not there. `secret-tool` ships in `libsecret-
 * tools`, a package a minimal desktop or a server image will not have, and
 * even when the binary exists there may be no keyring daemon on the bus. Both
 * of those are `{ ok: false, reason: 'unsupported' }` — the caller should
 * treat them as "this machine has no credential store", which is different
 * from "the credential is missing" and different again from "you were not
 * allowed to read it".
 *
 * Attribute names: `service`/`account` is the pair keytar wrote and the pair
 * most Electron apps' stored credentials use, so it is the pair the quota
 * providers will be looking for. libsecret schemas are free-form, so a CLI
 * using different attribute names simply will not match — which surfaces as
 * `not-found`, correctly.
 */
import type { SecretLookup, SecretResult } from '../types'
import { execFileCapture } from '../shared/exec'
import { which } from './shell'

/**
 * Short. Unlike the macOS Keychain, a Secret Service lookup either answers
 * from an unlocked collection immediately or needs a prompt that will not
 * arrive in a polling context.
 */
const TIMEOUT_MS = 8_000

/**
 * Phrases that mean "the store said no" rather than "the store had nothing".
 * A locked keyring with no session to unlock it lands here.
 */
const DENIED_PATTERNS = [
  'prompt was dismissed',
  'prompt dismissed',
  'cancelled',
  'canceled',
  'denied',
  'not authorized',
  'is locked',
  'no such interface'
]

/** Phrases that mean no keyring daemon answered on the bus at all. */
const UNSUPPORTED_PATTERNS = [
  'cannot autolaunch d-bus',
  'failed to connect to the bus',
  'no such secret collection',
  'org.freedesktop.secrets',
  'was not provided by any .service files'
]

function isValidField(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 1024) return false
  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u001F\u007F]/.test(trimmed)
}

function matchesAny(haystack: string, patterns: readonly string[]): boolean {
  const lower = haystack.toLowerCase()
  return patterns.some((p) => lower.includes(p))
}

/**
 * Read a secret from the Secret Service.
 *
 * Never throws. Degrades to `unsupported` when `secret-tool` is absent or no
 * keyring daemon is reachable.
 */
export async function readSecret(lookup: SecretLookup): Promise<SecretResult> {
  const service = lookup?.service
  if (!isValidField(service)) {
    return { ok: false, reason: 'error', message: 'invalid secret service name' }
  }

  // Resolve first so a missing package is reported as `unsupported` rather
  // than surfacing as a spawn ENOENT that reads like a bug.
  const bin = await which('secret-tool')
  if (!bin) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'secret-tool is not installed (libsecret-tools)'
    }
  }

  // `lookup` takes attribute/value pairs and prints the matching secret.
  // Values are argv entries and the spawn uses no shell, so nothing here can
  // be interpreted as syntax.
  const args = ['lookup', 'service', service.trim()]
  const account = lookup?.account
  if (typeof account === 'string' && account.trim()) {
    if (!isValidField(account)) {
      return { ok: false, reason: 'error', message: 'invalid secret account name' }
    }
    args.push('account', account.trim())
  }

  const result = await execFileCapture(bin, args, { timeoutMs: TIMEOUT_MS })
  const stderr = result.stderr.trim()

  if (result.ok) {
    // secret-tool writes the secret raw. Older builds exit 0 with empty output
    // for a miss where newer ones exit 1, so the empty case is checked here
    // too rather than relying on the exit code alone.
    const value = result.stdout.replace(/\r?\n$/, '')
    if (!value) return { ok: false, reason: 'not-found' }
    return { ok: true, value }
  }

  if (matchesAny(stderr, UNSUPPORTED_PATTERNS)) {
    return { ok: false, reason: 'unsupported', message: stderr }
  }
  if (matchesAny(stderr, DENIED_PATTERNS)) {
    return { ok: false, reason: 'permission-denied', message: stderr }
  }

  // Spawn or timeout. The binary resolved a moment ago, so this is a keyring
  // that never answered — an unattended unlock prompt, most likely.
  if (result.code === null) {
    return {
      ok: false,
      reason: 'permission-denied',
      message: stderr || 'the keyring did not respond; it may be locked'
    }
  }

  // A plain non-zero exit with nothing on stderr is how current secret-tool
  // reports a miss.
  if (!stderr) return { ok: false, reason: 'not-found' }

  return { ok: false, reason: 'error', message: stderr }
}
