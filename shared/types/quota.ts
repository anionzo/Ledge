/**
 * Quota model for the Gauge panel.
 *
 * Ported from agent-notch's flat `scrapers.js`. The shape is deliberately
 * conservative: a provider that cannot prove a number reports `unknown` rather
 * than guessing, and the UI renders an em dash. Never invent a percentage.
 */

/** Provider ids that ship built in. Custom ones are `custom_<slug>`. */
export type BuiltinProviderId =
  | 'claude'
  | 'codex'
  | 'gemini'
  | 'cursor'
  | 'grok'
  | 'opencode'
  // Balance-shaped, not window-shaped: DeepSeek reports money left, not a
  // used-percentage. See QuotaBalance and the note on QuotaReading.balance.
  | 'deepseek'

export type ProviderId = BuiltinProviderId | (string & {})

/**
 * Why a provider has no number.
 *
 * - `ok` — a real reading.
 * - `not-installed` — the CLI is not on this machine.
 * - `logged-out` — installed, but no usable credential.
 * - `permission-required` — the OS blocked the credential read. On macOS this
 *   is the Keychain prompt being dismissed; the UI must offer a retry rather
 *   than showing an empty slot.
 * - `unsupported-platform` — this provider has no reader for the current OS.
 * - `error` — the read was attempted and failed.
 */
export type QuotaState =
  | 'ok'
  | 'not-installed'
  | 'logged-out'
  | 'permission-required'
  | 'unsupported-platform'
  | 'error'

/** Severity band driving the ring colour. Separate from the accent hue. */
export type QuotaSeverity = 'ok' | 'warn' | 'critical'

/** One rate-limit window (a 5-hour session, a rolling week, a billing month). */
export interface QuotaWindow {
  label: string
  /** 0–100, or null when genuinely unknown. */
  usedPercent: number | null
  /** ISO 8601 instant the window resets, or null when unknown. */
  resetsAt: string | null
}

export interface QuotaReading {
  providerId: ProviderId
  displayName: string
  /** Model the CLI is currently configured to use, when discoverable. */
  modelName: string | null
  state: QuotaState
  /** Short, user-facing explanation when `state` is not `ok`. */
  message: string | null
  session: QuotaWindow | null
  weekly: QuotaWindow | null
  /** The window the ring visualises — whichever is closest to exhaustion. */
  ringPercent: number | null
  severity: QuotaSeverity
  /** ISO 8601. When this reading was actually taken. */
  observedAt: string
  /**
   * True when this is a retained previous reading being shown because the
   * latest refresh failed. Retained for at most STALE_TTL_MS.
   */
  stale: boolean
  /**
   * Prepaid balance, for providers that report money left rather than a
   * used-percentage (DeepSeek, and gateway relays). When present the renderer
   * draws a balance bar instead of a ring, and `ringPercent` is null. This is
   * also the seam the Cost Meter backlog item builds on.
   */
  balance?: QuotaBalance | null
  /**
   * Cost of the current window, once the Cost Meter backlog item lands.
   * Present in the type from the start so adding it later is additive only.
   */
  cost?: QuotaCost | null
}

/**
 * A prepaid balance. Amounts are exact decimal strings, never parsed into a
 * binary float — money must not lose a cent to IEEE-754.
 */
export interface QuotaBalance {
  currency: 'USD' | 'CNY'
  totalBalance: string
  grantedBalance: string | null
  toppedUpBalance: string | null
  /** The provider's own "is there enough to make a call" flag, when given. */
  isAvailable: boolean
}

export interface QuotaCost {
  currency: 'USD' | 'CNY'
  /** Spend since the current session/window began. */
  sessionAmount: number | null
  /** Spend since local midnight. */
  todayAmount: number | null
  /** Spend since the first of the local month. */
  monthAmount: number | null
  /**
   * True when the amounts come from real spend (a prepaid balance falling over
   * time). False for a flat subscription, where per-use cost is meaningless —
   * the UI then says "subscription" rather than a number.
   */
  meteredByToken: boolean
}

/** Per-model list price, USD per million tokens. */
export interface ModelPrice {
  model: string
  inputPerMtok: number
  outputPerMtok: number
  cacheReadPerMtok: number
  cacheWritePerMtok: number
}

export interface QuotaSnapshot {
  readings: QuotaReading[]
  /** ISO 8601 of the last completed refresh cycle. */
  lastUpdated: string
}

/** How long a failed refresh may keep showing the previous reading. */
export const STALE_TTL_MS = 5 * 60 * 1000

/** Map a used-percentage onto a severity band. */
export function severityFor(
  usedPercent: number | null,
  alertThreshold: number
): QuotaSeverity {
  if (usedPercent === null) return 'ok'
  if (usedPercent >= alertThreshold) return 'critical'
  if (usedPercent >= 50) return 'warn'
  return 'ok'
}
