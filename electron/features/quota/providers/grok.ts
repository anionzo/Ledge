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
    session: session ? makeWindow('Product usage', session.percent, session.resetsAt) : null,
    weekly: weekly ? makeWindow('Billing period', weekly.percent, weekly.resetsAt) : null,
    now: ctx.now,
    alertThreshold: ctx.alertThreshold
  })
}

interface GrokSession {
  token: string
  userId: string
  version: string
}

/**
 * Find the first usable session profile in `auth.json`.
 * Returns null when the file is absent, malformed, or holds only API-key
 * profiles — all of which mean "no quota to read", never "zero used".
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

  for (const value of Object.values(profiles)) {
    const entry = asRecord(value)
    if (!entry) continue
    // These modes have no session quota window; skip rather than 401.
    if (entry.auth_mode === 'api_key' || entry.auth_mode === 'web_login') continue
    const raw = entry.key ?? entry.access_token
    if (typeof raw !== 'string' || !raw.trim()) continue
    return {
      token: raw,
      userId: typeof entry.user_id === 'string' ? entry.user_id : '',
      version: readVersion(grokDir)
    }
  }
  return null
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

    if (res.status === 401 || res.status === 403) {
      return reading(ctx, 'logged-out', 'OAuth token rejected — sign in with: grok login')
    }

    const config = recordAt(res.json, 'config')
    if (res.status !== 200 || !config) {
      return reading(ctx, 'error', `Billing endpoint unavailable (HTTP ${res.status})`)
    }

    const weeklyReset =
      toIsoInstant(recordAt(config, 'currentPeriod')?.end) ?? toIsoInstant(config.billingPeriodEnd)

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
        null,
        { percent: sessionPercent, resetsAt: null },
        { percent: weeklyPercent, resetsAt: weeklyReset }
      )
    }

    // No percentage, but real prepaid credits → a balance reading (like DeepSeek).
    if (prepaid != null && prepaid > 0) {
      return makeReading({
        providerId: ID,
        displayName: DISPLAY_NAME,
        modelName: DISPLAY_NAME,
        state: 'ok',
        message: null,
        session: null,
        weekly: null,
        balance: {
          currency: 'USD',
          totalBalance: prepaid.toFixed(2),
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
      config.isUnifiedBillingUser ? 'Subscription — weekly period' : 'No usage limit reported',
      undefined,
      { percent: null, resetsAt: weeklyReset }
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
