/**
 * Grok (xAI) quota, ported from `getGrokUsage` in scrapers.js.
 *
 * UNDOCUMENTED ENDPOINT. `https://cli-chat-proxy.grok.com/v1/billing?format=credits`
 * is the private billing route the Grok CLI uses. It is guarded by a set of
 * bespoke headers (`X-XAI-Token-Auth`, `x-grok-client-version`,
 * `x-grok-client-mode`) which are entirely undocumented; if any of them stops
 * matching what the current CLI sends, this provider will start returning
 * `error` and the fix is to re-derive the headers from the CLI.
 *
 * The credential file — `$GROK_HOME/auth.json`, resolved by
 * `platform.paths.grokHome()` — is a map of profiles. Only OAuth/session
 * profiles carry a usable token; entries whose `auth_mode` is `api_key` or
 * `web_login` are skipped, because a raw API key has no quota window to read
 * and the billing endpoint rejects it.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { QuotaProvider, ReadContext } from '../provider'
import type { QuotaReading, QuotaState } from '../../../../shared/types/quota'
import { httpsRequest } from '../http'
import {
  arrayAt,
  asRecord,
  coercePercent,
  errorMessage,
  makeReading,
  makeWindow,
  moneyString,
  parseJsonSafe,
  recordAt,
  toIsoInstant
} from '../util'

const BILLING_URL = 'https://cli-chat-proxy.grok.com/v1/billing?format=credits'
const FALLBACK_VERSION = '1.0.13'

const ID = 'grok'
const DISPLAY_NAME = 'Grok'

/** The new billing payload wraps numbers as `{ val: number }`; read either. */
function numVal(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const rec = asRecord(raw)
  if (rec && typeof rec.val === 'number' && Number.isFinite(rec.val)) return rec.val
  return null
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)))
}

interface WindowValues {
  percent: number | null
  resetsAt: string | null
  /**
   * The window's real length in ms, when both of its endpoints were reported.
   * Passed straight to `makeWindow`, which drops it unless it is a real,
   * positive number — so `undefined` here (rather than a fallback) is what
   * tells `pace.ts` "no proven length" instead of "a zero-length window".
   */
  lengthMs?: number
}

function reading(
  ctx: ReadContext,
  state: QuotaState,
  message: string | null,
  session?: WindowValues,
  weekly?: WindowValues
): QuotaReading {
  return makeReading({
    providerId: ID,
    displayName: DISPLAY_NAME,
    modelName: DISPLAY_NAME,
    state,
    message,
    session: session
      ? makeWindow('Product usage', session.percent, session.resetsAt, session.lengthMs)
      : null,
    weekly: weekly
      ? makeWindow('Billing period', weekly.percent, weekly.resetsAt, weekly.lengthMs)
      : null,
    now: ctx.now,
    alertThreshold: ctx.alertThreshold
  })
}

interface GrokSession {
  token: string
  userId: string
  version: string
  /**
   * Set when more than one usable profile was found in `auth.json`. The file
   * is keyed by OAuth scope URL, not by account, and carries nothing that
   * marks which profile the CLI is actively using — confirmed by inspecting a
   * real multi-login file, whose entries carry `create_time`, `email` and the
   * rest but no `active`/`current` flag of any kind. Rather than silently
   * present one account's numbers as if the ambiguity did not exist, the
   * caller surfaces it in the reading's message.
   */
  ambiguous: boolean
  /** The chosen profile's email, for the ambiguity message, when it has one. */
  email: string | null
}

/**
 * Find the best usable session profile in `auth.json`.
 * Returns null when the file is absent, malformed, or holds only API-key
 * profiles — all of which mean "no quota to read", never "zero used".
 *
 * With no field to say which profile is active, `create_time` — the instant
 * that profile last completed `grok login` — is the only evidence in the file
 * that correlates with "currently in use", so the most recently created
 * profile is preferred over "whichever key `Object.values()` iterates first".
 * That is still a heuristic, not proof, which is why `ambiguous` is set
 * whenever more than one profile qualified.
 */
function readSession(grokDir: string): GrokSession | null {
  const authPath = path.join(grokDir, 'auth.json')
  if (!fs.existsSync(authPath)) return null

  let doc: unknown
  try {
    doc = parseJsonSafe(fs.readFileSync(authPath, 'utf8'))
  } catch {
    return null
  }
  const profiles = asRecord(doc)
  if (!profiles) return null

  let best: { entry: Record<string, unknown>; token: string; createdMs: number } | null = null
  let usableCount = 0

  for (const value of Object.values(profiles)) {
    const entry = asRecord(value)
    if (!entry) continue
    // These modes have no session quota window; skip rather than 401.
    if (entry.auth_mode === 'api_key' || entry.auth_mode === 'web_login') continue
    const raw = entry.key ?? entry.access_token
    if (typeof raw !== 'string' || !raw.trim()) continue

    usableCount += 1
    const createdMs = Date.parse(String(entry.create_time ?? '')) || 0
    if (!best || createdMs > best.createdMs) {
      best = { entry, token: raw, createdMs }
    }
  }
  if (!best) return null

  return {
    token: best.token,
    userId: typeof best.entry.user_id === 'string' ? best.entry.user_id : '',
    version: readVersion(grokDir),
    ambiguous: usableCount > 1,
    email: typeof best.entry.email === 'string' ? best.entry.email : null
  }
}

/** The CLI stamps its version here; the billing proxy echoes it back in headers. */
function readVersion(grokDir: string): string {
  try {
    const versionPath = path.join(grokDir, '.metadata_version')
    if (!fs.existsSync(versionPath)) return FALLBACK_VERSION
    return fs.readFileSync(versionPath, 'utf8').trim() || FALLBACK_VERSION
  } catch {
    return FALLBACK_VERSION
  }
}

/**
 * A window's length in ms, computed only from a real start and end the API
 * actually reported — never guessed from one end alone. `makeWindow` (see
 * `util.ts`) drops a non-positive or non-finite result, so returning it
 * unguarded here is fine, but `null` on either input still short-circuits: a
 * length built from half a pair is exactly the kind of guess this exists to
 * avoid.
 */
function windowLengthMs(start: string | null, end: string | null): number | undefined {
  if (!start || !end) return undefined
  const startMs = Date.parse(start)
  const endMs = Date.parse(end)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return undefined
  return endMs - startMs
}

/** Prefix an account-ambiguity note onto whatever message a branch would otherwise show. */
function withAccountNote(note: string | null, message: string | null): string | null {
  if (!note) return message
  return message ? `${note} — ${message}` : note
}

async function read(ctx: ReadContext): Promise<QuotaReading> {
  let grokDir = ''
  try {
    grokDir = ctx.platform.paths.grokHome()
  } catch (err) {
    return reading(ctx, 'error', errorMessage(err, 'Could not locate the Grok config directory'))
  }

  if (!grokDir || !fs.existsSync(grokDir)) {
    return reading(ctx, 'not-installed', 'Grok CLI is not installed on this machine')
  }

  const session = readSession(grokDir)
  if (!session) {
    return reading(ctx, 'logged-out', 'No OAuth session — sign in with: grok login')
  }
  const accountNote = session.ambiguous
    ? `Multiple Grok accounts signed in — showing ${session.email ?? 'the most recently added one'}`
    : null

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${session.token}`,
      Accept: 'application/json',
      'User-Agent': `grok-cli/${session.version}`,
      'X-XAI-Token-Auth': 'xai-grok-cli',
      'x-grok-client-version': session.version,
      'x-grok-client-mode': 'interactive'
    }
    if (session.userId) headers['x-userid'] = session.userId

    const res = await httpsRequest({ url: BILLING_URL, headers, timeoutMs: 10_000 })

    if (res.status === 401) {
      return reading(ctx, 'logged-out', 'OAuth token rejected — sign in with: grok login')
    }
    if (res.status === 403) {
      // 403 on this endpoint is xAI gating the account (an allowlist or
      // entitlement check), not a bad credential — the same token can be
      // perfectly valid and still get this. Re-authenticating cannot fix a
      // permission gate, so this must not tell the user to sign in again.
      return reading(ctx, 'error', 'Billing access denied for this account (HTTP 403) — not a sign-in problem')
    }

    const config = recordAt(res.json, 'config')
    if (res.status !== 200 || !config) {
      return reading(ctx, 'error', `Billing endpoint unavailable (HTTP ${res.status})`)
    }

    // Prefer `currentPeriod`'s own start/end pair over the flatter
    // `billingPeriodStart`/`billingPeriodEnd` fields, and never mix an end
    // from one pair with a start from the other — that could describe a
    // different cycle and produce a fabricated length.
    const currentPeriod = recordAt(config, 'currentPeriod')
    const currentPeriodEnd = toIsoInstant(currentPeriod?.end)
    const billingEnd = toIsoInstant(config.billingPeriodEnd)
    const weeklyReset = currentPeriodEnd ?? billingEnd
    const weeklyStart = currentPeriodEnd
      ? toIsoInstant(currentPeriod?.start)
      : toIsoInstant(config.billingPeriodStart)
    const weeklyLengthMs = windowLengthMs(weeklyStart, weeklyReset)

    // ── New billing shape (unified billing) ────────────────────────────────
    // xAI moved from a `creditUsagePercent` / `productUsage` percentage model to
    // a prepaid-balance + on-demand model: `prepaidBalance.val`,
    // `onDemandUsed.val` / `onDemandCap.val`, and `currentPeriod`. The old
    // fields are gone for these accounts, which is why the previous parser fell
    // through to "unrecognised shape".
    const onDemandUsed = numVal(config.onDemandUsed)
    const onDemandCap = numVal(config.onDemandCap)
    const prepaid = numVal(config.prepaidBalance)
    const onDemandPercent =
      onDemandCap != null && onDemandCap > 0 && onDemandUsed != null
        ? clampPercent((onDemandUsed / onDemandCap) * 100)
        : null

    // ── Old billing shape (still honoured if an account returns it) ─────────
    const legacyWeekly = coercePercent(config.creditUsagePercent)
    let legacySession: number | null = null
    for (const entry of arrayAt(config, 'productUsage')) {
      const product = asRecord(entry)
      if (!product) continue
      const pct = coercePercent(product.usagePercent ?? product.creditUsagePercent)
      if (pct != null) {
        legacySession = pct
        break
      }
    }

    const sessionPercent = onDemandPercent ?? legacySession
    const weeklyPercent = legacyWeekly

    // A usable percentage in either shape → a normal window reading.
    if (sessionPercent != null || weeklyPercent != null) {
      return reading(
        ctx,
        'ok',
        withAccountNote(accountNote, null),
        { percent: sessionPercent, resetsAt: null },
        { percent: weeklyPercent, resetsAt: weeklyReset, lengthMs: weeklyLengthMs }
      )
    }

    // Real prepaid credits → a balance reading (like DeepSeek). `prepaid` is
    // checked for `!= null` only, deliberately including exactly 0: an account
    // that has spent down to nothing is itself informative ("$0, out of
    // credit") and must not fall through to the generic "no limit reported"
    // message below, which would show a bare dash for a number the API did
    // give us.
    //
    // UNIT IS THE OPERATOR'S CALL, and the call was USD. `prepaidBalance`
    // itself is confirmed real — this repo diagnosed the endpoint against a
    // live account and recorded the `{currentPeriod, onDemandCap,
    // onDemandUsed, prepaidBalance, isUnifiedBillingUser,
    // billingPeriodStart/End}` shape in `.knowns/decisions/20260831-1417-…`.
    // What no public source documents is the *unit*: the request URL says
    // `?format=credits`, and the only other known implementation (CodexBar)
    // uses the sibling ratio fields only, stating that xAI credits "are never
    // converted into dollars". So this is a dollars-per-credit assumption, not
    // a proven one — kept because the operator has an account and says the
    // figure reads as dollars, which is better evidence than a third-party
    // client's README. Revisit if a funded account ever shows a figure that
    // does not match the billing page. `moneyString` (not `.toFixed`) carries
    // the value through as text, so a decimal amount is never rounded the way
    // `.toFixed(2)` on a float would.
    if (prepaid != null) {
      return makeReading({
        providerId: ID,
        displayName: DISPLAY_NAME,
        modelName: DISPLAY_NAME,
        state: 'ok',
        message: withAccountNote(accountNote, null),
        session: null,
        weekly: null,
        balance: {
          currency: 'USD',
          totalBalance: moneyString(prepaid) ?? String(prepaid),
          grantedBalance: null,
          toppedUpBalance: null,
          isAvailable: prepaid > 0
        },
        now: ctx.now,
        alertThreshold: ctx.alertThreshold
      })
    }

    // Unified-billing subscription with no exposed percentage and no prepaid
    // balance: this is the common case for a plan user. Report it honestly —
    // the weekly reset is the one useful fact — rather than an error.
    return reading(
      ctx,
      'ok',
      withAccountNote(
        accountNote,
        config.isUnifiedBillingUser ? 'Subscription — weekly period' : 'No usage limit reported'
      ),
      undefined,
      { percent: null, resetsAt: weeklyReset, lengthMs: weeklyLengthMs }
    )
  } catch (err) {
    return reading(ctx, 'error', errorMessage(err, 'Grok billing read failed'))
  }
}

export const grokProvider: QuotaProvider = {
  id: ID,
  displayName: DISPLAY_NAME,
  ttlMs: 60_000,
  read
}
