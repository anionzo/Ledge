/**
 * Shared helpers for the quota providers.
 *
 * The governing rule, inherited from agent-notch and preserved exactly: never
 * invent a number. Every one of these helpers returns `null` rather than a
 * plausible-looking fallback, and `makeReading` refuses to compute a ring
 * percentage unless the reading's state is `ok`.
 */
import type {
  QuotaBalance,
  QuotaReading,
  QuotaState,
  QuotaWindow,
  ProviderId
} from '../../../shared/types/quota'
import { severityFor } from '../../../shared/types/quota'

/**
 * Coerce an untrusted value to an integer percentage in 0–100, or null.
 *
 * Deliberate fix over the original `coercePercent`: an empty or whitespace
 * string used to slip through as 0 because `Number('')` is 0, which reported
 * "0% used" for a provider that had told us nothing. Empty input is now null.
 *
 * A value ABOVE 100 is not automatically unknown, and the cutoff is not a
 * single hard wall at 100:
 *
 *   - `(100, 200]` is CLAMPED to 100. A usage-based account (a Cursor plan
 *     billing overage) or an imprecise provider figure (Claude's own reported
 *     `100.4`) can genuinely be over its stated cap — that is a fact worth
 *     showing, and 100% is still true of someone at 112%. Blanking it to a
 *     dash would also silently suppress the critical-severity alert, which is
 *     exactly the moment it matters most.
 *   - Above 200 stays null. A number that far past 100% is far more likely to
 *     be a unit bug in the reader (a fraction misread as a percent, a wrong
 *     scale) than a real account spending 3x its quota, and clamping it to
 *     100 would disguise that bug as an ordinary maxed-out quota instead of
 *     surfacing it as "unknown".
 */
export function coercePercent(value: unknown): number | null {
  if (value == null || typeof value === 'boolean') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(n) || n < 0) return null
  if (n > 200) return null
  if (n > 100) return 100
  return Math.round(n)
}

/** A remaining-fraction (0..1) as reported by Google, expressed as used %. */
export function remainingToUsed(fraction: unknown): number | null {
  if (typeof fraction !== 'number' || !Number.isFinite(fraction)) return null
  return coercePercent((1 - fraction) * 100)
}

/**
 * Normalise a reset marker to an ISO 8601 instant.
 *
 * The original formatted this straight to display text ("Resets in 3h 12m").
 * `QuotaWindow.resetsAt` is an instant instead, so the renderer can localise
 * and re-render the countdown without another main-process round trip.
 * Accepts ISO strings, epoch seconds and epoch milliseconds, because the six
 * upstream APIs between them use all three.
 */
export function toIsoInstant(value: unknown): string | null {
  if (value == null || value === '') return null
  let date: Date | null = null
  if (typeof value === 'number' && Number.isFinite(value)) {
    date = new Date(value > 1e12 ? value : value * 1000)
  } else if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return null
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed)
      date = new Date(num > 1e12 ? num : num * 1000)
    } else {
      date = new Date(trimmed)
    }
  }
  if (!date || Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export function makeWindow(
  label: string,
  usedPercent: number | null,
  resetsAt: string | null,
  lengthMs?: number
): QuotaWindow {
  // `lengthMs` is omitted rather than set to a falsy number when the provider
  // did not prove one: `pace.ts` treats the field's absence as "decline to
  // answer", and a 0 or a NaN sitting there would read as a stated length and
  // be divided by.
  const usable = typeof lengthMs === 'number' && Number.isFinite(lengthMs) && lengthMs > 0
  return usable ? { label, usedPercent, resetsAt, lengthMs } : { label, usedPercent, resetsAt }
}

export interface ReadingInit {
  providerId: ProviderId
  displayName: string
  modelName?: string | null
  state: QuotaState
  message?: string | null
  session?: QuotaWindow | null
  weekly?: QuotaWindow | null
  /** For balance-shaped providers; when set the UI draws a balance bar. */
  balance?: QuotaBalance | null
  now: number
  alertThreshold: number
}

/**
 * Build a `QuotaReading`, deriving `ringPercent` and `severity`.
 *
 * Ported from `attachRing`: the ring shows whichever window is closest to
 * exhaustion, and it is only ever populated for an `ok` reading. A provider
 * that is logged out or erroring has no ring, so the UI draws an em dash
 * rather than an empty circle that reads as "0% used".
 */
export function makeReading(init: ReadingInit): QuotaReading {
  const session = init.session ?? null
  const weekly = init.weekly ?? null
  let ring: number | null = null
  if (init.state === 'ok') {
    const s = session?.usedPercent ?? null
    const w = weekly?.usedPercent ?? null
    if (s != null && w != null) ring = Math.max(s, w)
    else if (s != null) ring = s
    else if (w != null) ring = w
  }
  return {
    providerId: init.providerId,
    displayName: init.displayName,
    modelName: init.modelName ?? null,
    state: init.state,
    message: init.message ?? null,
    session,
    weekly,
    balance: init.balance ?? null,
    ringPercent: ring,
    severity: severityFor(ring, init.alertThreshold),
    observedAt: new Date(init.now).toISOString(),
    stale: false
  }
}

/**
 * Strip anything that could be a credential out of a string bound for a log,
 * an error message or the UI.
 *
 * These providers hold live OAuth access tokens, refresh tokens and API keys.
 * Nothing derived from a credential file or an Authorization header may reach
 * a message, so error text is passed through here before it is surfaced.
 */
export function redact(input: unknown): string {
  let text = typeof input === 'string' ? input : String(input ?? '')
  text = text
    // Bearer / Authorization values.
    .replace(/\b(bearer|basic)\s+[\w.\-+/=]+/gi, '$1 [redacted]')
    // JWTs.
    .replace(/\beyJ[\w-]*\.[\w-]*\.?[\w-]*/g, '[redacted]')
    // Google API keys: `AIza` then 35 characters, with NO separator after the
    // prefix and 39 characters in total. They used to fall straight through —
    // the vendor rule below demands a `-` or `_` right after the prefix, and
    // the catch-all after it needs 40 characters, one more than a real key has.
    // Matched loosely on length rather than pinned at 35: over-redacting a
    // harmless string costs nothing, letting a live key reach a log costs
    // everything.
    .replace(/\bAIza[A-Za-z0-9\-_]{10,}/g, '[redacted]')
    // Common API-key prefixes (OpenAI, Anthropic, xAI, GitHub).
    .replace(/\b(sk|pk|xai|sk-ant|gh[pousr])[-_][A-Za-z0-9\-_]{8,}/g, '[redacted]')
    // Any other long opaque run that looks like a token.
    .replace(/\b[A-Za-z0-9\-_]{40,}\b/g, '[redacted]')
  return text.length > 200 ? `${text.slice(0, 200)}…` : text
}

/**
 * A short, safe description of a thrown value.
 *
 * Only the error's own message is used, never a response body or file
 * content, and it is redacted before it leaves this function.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return redact(err.message)
  if (typeof err === 'string' && err) return redact(err)
  return fallback
}

/**
 * True when an OAuth expiry has passed, allowing for clock skew.
 * Accepts epoch seconds or milliseconds; a non-numeric expiry is treated as
 * "not known to be expired" so we still attempt the call and let the server
 * decide, exactly as the original did.
 */
export function accessExpired(expiresAt: unknown, now: number, skewMs = 60_000): boolean {
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return false
  const ms = expiresAt > 1e12 ? expiresAt : expiresAt * 1000
  return ms <= now + skewMs
}

/** Parse JSON without throwing. Returns null on any malformed input. */
export function parseJsonSafe(raw: string | null | undefined): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

/** Narrow an unknown to an indexable object, for walking untrusted payloads. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Read `obj[key]` as a record, or null. */
export function recordAt(value: unknown, key: string): Record<string, unknown> | null {
  const obj = asRecord(value)
  return obj ? asRecord(obj[key]) : null
}

/** Read `obj[key]` as an array, or an empty array. */
export function arrayAt(value: unknown, key: string): unknown[] {
  const obj = asRecord(value)
  const arr = obj ? obj[key] : null
  return Array.isArray(arr) ? arr : []
}

/** Read `obj[key]` as a non-empty trimmed string, or null. */
export function stringAt(value: unknown, key: string): string | null {
  const obj = asRecord(value)
  const v = obj ? obj[key] : null
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Coerce an untrusted value to an EXACT decimal money string, or null.
 *
 * Money must survive end to end as text — never parsed into a binary float,
 * because IEEE-754 cannot represent most decimal cents exactly and a rounded
 * balance is worse than no balance. A string amount is passed through verbatim
 * (only trimmed); a JSON number is stringified without arithmetic; anything
 * else is null. This is the one gate every `QuotaBalance` amount goes through.
 */
export function moneyString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }
  // A number in the payload is stringified as-is. We do not add, divide or
  // round it — String() is the only operation money is allowed to see.
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

/**
 * Walk a dot-path (`data.quota`, `usage.remaining`) into an untrusted payload.
 *
 * Used by the http custom mode to pull one value out of an arbitrary gateway
 * response without a bespoke reader per relay. Returns `undefined` when any
 * segment is missing or the path tries to descend through a non-object, so a
 * mis-typed path degrades to "no value" rather than throwing. Own properties
 * only, so a payload cannot hand back `__proto__` or a prototype method.
 */
export function valueAtPath(root: unknown, dotPath: string): unknown {
  const parts = dotPath
    .split('.')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (parts.length === 0) return undefined
  let current: unknown = root
  for (const key of parts) {
    const record = asRecord(current)
    if (!record || !Object.prototype.hasOwnProperty.call(record, key)) return undefined
    current = record[key]
  }
  return current
}
