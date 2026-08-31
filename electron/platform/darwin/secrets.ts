/**
 * macOS Keychain reads. This is the load-bearing file of the darwin adapter.
 *
 * **Why it exists.** On Windows and Linux, Claude Code writes its OAuth
 * tokens to `~/.claude/.credentials.json` and the quota provider just reads
 * the file. On macOS it does not: the tokens go into the login Keychain as a
 * generic password, and `.credentials.json` is either absent or a stub. A
 * provider that only knows how to read the file therefore reports
 * "logged out" on macOS for a user who is very much logged in. That bug is
 * the reason `PlatformAdapter.readSecret` is part of the seam at all.
 *
 * **Why `security(1)` and not `safeStorage`.** Electron's `safeStorage` can
 * only decrypt what Electron encrypted; it has no way to open an item another
 * process created. `/usr/bin/security` is the in-box tool for that, it is
 * present on every macOS, and it needs no native module.
 *
 * **Injection.** The lookup values are passed as argv entries to
 * `execFileCapture`, which spawns with `shell: false`. There is no shell in
 * the path, so no quoting or escaping question arises — a service name
 * containing `;` or `$(...)` is just a service name that will not be found.
 *
 * **The permission case, which the UI depends on.** The first time Ledge
 * reads another app's Keychain item, macOS shows an "allow access" panel. The
 * user can Deny, or dismiss it, or the item's ACL may forbid non-interactive
 * access outright. All of those must come back as `permission-denied` and NOT
 * as `not-found`: `not-found` renders as an empty provider slot, whereas
 * `permission-denied` maps to the `permission-required` quota state, which
 * renders a retry affordance. Getting this mapping wrong makes a recoverable
 * situation look like a broken one.
 */
import type { SecretLookup, SecretResult } from '../types'
import { execFileCapture } from '../shared/exec'

/** In-box, addressed absolutely so PATH cannot shadow it. */
const SECURITY_BIN = '/usr/bin/security'

/**
 * Generous, because this call can block on a user-facing dialog.
 *
 * If the user walks away from the "allow access" panel the spawn is killed at
 * the timeout and reported as `permission-denied` — from the UI's point of
 * view an unanswered prompt and a dismissed one are the same thing, and both
 * want the retry affordance.
 */
const TIMEOUT_MS = 20_000

/**
 * `security` exits with the OSStatus truncated to a byte, so the negative
 * Security-framework constants show up as `256 - (|status| mod 256)`:
 *
 *   errSecItemNotFound          -25300  ->  44
 *   errSecInteractionRequired   -25315  ->  29
 *   errSecInteractionNotAllowed -25308  ->  36
 *   errSecAuthFailed            -25293  ->  51
 *   errSecUserCanceled            -128  -> 128
 *
 * That derivation is not documented by Apple, so the numeric check is backed
 * up by a message check below rather than trusted on its own.
 */
const EXIT_ITEM_NOT_FOUND = 44
const EXIT_DENIED = new Set([29, 36, 51, 128])

/**
 * Phrases `security` and the Security framework use when access was refused
 * rather than absent. Matched case-insensitively against stderr.
 *
 * These are English strings from a localised tool, which is why they are only
 * a fallback for the exit code: on a non-English system the code still
 * classifies correctly and this adds nothing.
 */
const DENIED_PATTERNS = [
  'user interaction is not allowed',
  'user canceled',
  'user cancelled',
  'interaction required',
  'authorization', // "authorization was denied", "user authorization failed"
  'denied',
  'not permitted',
  'errsecauthfailed'
]

/** Phrases meaning the item genuinely is not in the keychain. */
const NOT_FOUND_PATTERNS = [
  'could not be found',
  'the specified item could not be found',
  'errsecitemnotfound'
]

/**
 * A keychain service or account is opaque to us but must still be a sane
 * single-line string. Rejecting control characters keeps a stray NUL from
 * truncating the argument as the OS sees it.
 */
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
 * Read a generic password from the login Keychain.
 *
 * Never throws. Returns `permission-denied` for a refused or unanswered
 * prompt, `not-found` when the item is genuinely absent, and `unsupported`
 * only when `/usr/bin/security` itself could not be run.
 */
export async function readSecret(lookup: SecretLookup): Promise<SecretResult> {
  const service = lookup?.service
  if (!isValidField(service)) {
    return { ok: false, reason: 'error', message: 'invalid keychain service' }
  }

  // -s <service>  match by service (the "Where" column in Keychain Access)
  // -a <account>  optionally narrow by account ("Account" column)
  // -w            print only the password to stdout, nothing else
  const args = ['find-generic-password', '-s', service.trim()]
  const account = lookup?.account
  if (typeof account === 'string' && account.trim()) {
    if (!isValidField(account)) {
      return { ok: false, reason: 'error', message: 'invalid keychain account' }
    }
    args.push('-a', account.trim())
  }
  args.push('-w')

  const result = await execFileCapture(SECURITY_BIN, args, { timeoutMs: TIMEOUT_MS })

  if (result.ok) {
    // `-w` emits the secret followed by a newline. Only the trailing newline
    // is stripped — the secret itself is returned byte-for-byte, since a
    // token's surrounding whitespace could in principle be significant.
    const value = result.stdout.replace(/\r?\n$/, '')
    if (!value) return { ok: false, reason: 'not-found' }
    return { ok: true, value }
  }

  const stderr = result.stderr.trim()

  // Spawn failed or we timed out. A timeout here is overwhelmingly likely to
  // be an unanswered access prompt, so it is reported as permission-denied to
  // get the user a retry button rather than a dead slot.
  if (result.code === null) {
    if (/timed out/i.test(stderr)) {
      return {
        ok: false,
        reason: 'permission-denied',
        message: 'Keychain access prompt was not answered'
      }
    }
    return { ok: false, reason: 'unsupported', message: stderr || 'security(1) unavailable' }
  }

  // Message first: it is the more specific signal when both are present, and
  // it guards against the exit-code derivation above being wrong on some
  // future macOS.
  if (matchesAny(stderr, DENIED_PATTERNS)) {
    return { ok: false, reason: 'permission-denied', message: stderr }
  }
  if (matchesAny(stderr, NOT_FOUND_PATTERNS)) {
    return { ok: false, reason: 'not-found' }
  }

  if (EXIT_DENIED.has(result.code)) {
    return { ok: false, reason: 'permission-denied', message: stderr }
  }
  if (result.code === EXIT_ITEM_NOT_FOUND) {
    return { ok: false, reason: 'not-found' }
  }

  return { ok: false, reason: 'error', message: stderr || `security exited ${result.code}` }
}
