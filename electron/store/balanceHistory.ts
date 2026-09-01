/**
 * Balance-history store — the "real spend" half of the Cost Meter.
 *
 * Ledge is a spectator: it reads a provider's prepaid balance, it never proxies
 * the API, so it cannot count tokens per request. The only honest measure of
 * spend it has is how far a prepaid balance FELL over a period. This store
 * keeps a small, append-only log of balance snapshots per provider and derives
 * spend from the deltas between them.
 *
 * Shape on disk (`balance-history.json` under userData):
 *
 *   { "<providerId>": [ { "at": ISO, "amount": number, "currency": "USD" }, … ] }
 *
 * `amount` is a NUMBER here, and this is the one place money is allowed to be a
 * float: it exists only for delta arithmetic (balance_start − balance_now).
 * Every figure the user actually reads still comes from the provider's exact
 * `totalBalance` string — this file never feeds a displayed number.
 *
 * The log is bounded: at most `MAX_POINTS` per provider, and points older than
 * `MAX_AGE_MS` are pruned, so a long-running install cannot grow it without
 * limit. Writes are atomic (temp + fsync + rename); a corrupt file degrades to
 * an empty history rather than crashing the engine.
 */
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import type { QuotaBalance, QuotaCost } from '../../shared/types/quota'

/** One recorded balance observation. `amount` is numeric for delta math only. */
export interface BalancePoint {
  at: string
  amount: number
  currency: 'USD' | 'CNY' | 'credits'
}

type HistoryStore = Record<string, BalancePoint[]>

/** Keep the log bounded so it cannot grow without limit. */
export const MAX_POINTS = 500
/** Drop points older than ~90 days — spend older than a quarter is not shown. */
export const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000

let cache: HistoryStore | null = null

export function balanceHistoryFilePath(): string {
  // Required lazily, exactly as settings.ts does for safeStorage: importing
  // `app` at module load pulls Electron into every consumer's graph, which
  // breaks a plain vitest process where `electron` resolves to a path string.
  // The pure spend/record helpers never call this, so tests never touch it.
  const { app } = require('electron') as typeof import('electron')
  return join(app.getPath('userData'), 'balance-history.json')
}

/**
 * Parse a money string to a number for delta math ONLY. Returns null when the
 * string is not a finite number, so a garbled balance is skipped rather than
 * recorded as NaN. This is the sole place a balance amount becomes a float, and
 * the result never reaches a displayed figure.
 */
export function parseAmount(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Coerce one untrusted entry to a `BalancePoint`, or null. */
function toPoint(raw: unknown): BalancePoint | null {
  if (!isPlainObject(raw)) return null
  const at = typeof raw.at === 'string' ? raw.at : null
  const amount = typeof raw.amount === 'number' && Number.isFinite(raw.amount) ? raw.amount : null
  // Accept every currency `recordBalance` can actually write. `QuotaBalance`
  // (shared/types/quota.ts) allows `'credits'` too — Antigravity reports its
  // balance in credits, not money — so restricting this to `'USD' | 'CNY'`
  // silently dropped every Antigravity point on the very next load: it wrote
  // fine, then `toStore` filtered it back out, resetting the cost line every
  // restart.
  const currency =
    raw.currency === 'USD' || raw.currency === 'CNY' || raw.currency === 'credits'
      ? raw.currency
      : null
  if (at === null || amount === null || currency === null) return null
  if (Number.isNaN(Date.parse(at))) return null
  return { at, amount, currency }
}

/**
 * Coerce an untrusted parsed file to a `HistoryStore`, dropping bad entries.
 * Exported so the save/load round trip (in particular, that a `credits`
 * point survives it) is unit-tested against a plain decoded object, without
 * touching the filesystem or Electron's `app`.
 */
export function toStore(raw: unknown): HistoryStore {
  if (!isPlainObject(raw)) return {}
  const out: HistoryStore = {}
  for (const key of Object.keys(raw)) {
    const list = raw[key]
    if (!Array.isArray(list)) continue
    const points = list.map(toPoint).filter((p): p is BalancePoint => p !== null)
    if (points.length > 0) out[key] = points
  }
  return out
}

function loadStore(): HistoryStore {
  if (cache) return cache

  const path = balanceHistoryFilePath()
  let store: HistoryStore = {}
  try {
    if (existsSync(path)) {
      const text = readFileSync(path, 'utf8')
      store = toStore(JSON.parse(text) as unknown)
    }
  } catch (err) {
    // A corrupt or unreadable file must never take the engine down: start
    // fresh and let the next successful record rewrite it.
    console.error('[balance-history] unreadable, starting fresh', err)
    store = {}
  }
  cache = store
  return store
}

/**
 * Bound one provider's list: sort ascending, drop anything older than
 * `MAX_AGE_MS`, then cap to the most recent `MAX_POINTS`. Pure.
 */
export function prunePoints(points: readonly BalancePoint[], now: number): BalancePoint[] {
  const cutoff = now - MAX_AGE_MS
  const kept = points
    .filter((p) => {
      const ms = Date.parse(p.at)
      return Number.isFinite(ms) && ms >= cutoff
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  return kept.length > MAX_POINTS ? kept.slice(kept.length - MAX_POINTS) : kept
}

/**
 * Append `point` to `points` unless it repeats the last amount. Dedupe is by
 * amount only: a balance that has not moved carries no new spend information,
 * so re-recording it would just churn the log. Pure — returns a new array (the
 * same reference when nothing was appended).
 */
export function appendPoint(
  points: readonly BalancePoint[],
  point: BalancePoint,
  now: number
): BalancePoint[] {
  const last = points[points.length - 1]
  if (last && last.amount === point.amount && last.currency === point.currency) {
    return points as BalancePoint[]
  }
  return prunePoints([...points, point], now)
}

/**
 * Spend within one period, per the Cost Meter contract:
 *
 *   spend = (balance AS THE PERIOD BEGAN) − (latest amount), max(0)
 *
 * The anchor is the last point at-or-before `periodStart`, NOT the earliest
 * point inside the period. `appendPoint` only records on a change, so the
 * first in-period sample can arrive hours late: if $100 was the balance at
 * 23:00 yesterday and it dropped to $80 at 09:00 today, the only in-period
 * point at noon is that $80 — anchoring on it makes `earliest === latest` and
 * reports "0.00 spent today" when $20 was actually spent overnight.
 *
 * Floored at 0 because a rising balance is a top-up, not negative spend. Points
 * must be sorted ascending. Returns null when there is NO history in the
 * period at all (nothing to anchor the start of the window on).
 */
function spendInPeriod(points: readonly BalancePoint[], periodStart: number): number | null {
  const inPeriod = points.filter((p) => Date.parse(p.at) >= periodStart)
  if (inPeriod.length === 0) return null
  // The latest overall point is always in-period (its timestamp is the max), so
  // the last of `inPeriod` is the current balance.
  const latest = inPeriod[inPeriod.length - 1]!.amount

  // Preferred anchor: the last point at or before the period boundary — the
  // balance as the day/month actually opened.
  const before = points.filter((p) => Date.parse(p.at) <= periodStart)
  if (before.length > 0) {
    const anchor = before[before.length - 1]!.amount
    const spend = anchor - latest
    return spend > 0 ? spend : 0
  }

  // No point was ever recorded before this period started — e.g. Ledge (or
  // this provider) was only configured partway through today. Judgement call:
  // with exactly one in-period sample there is nothing to diff against —
  // "earliest" and "latest" would be the very same reading, and reporting `0`
  // would reproduce the exact fabrication this function exists to fix (a
  // same-value comparison read as "nothing spent" instead of "nothing known
  // yet"). Prefer null — unknown is honest, a diff-of-one-point is not.
  if (inPeriod.length < 2) return null

  // Two or more in-period points with no pre-period anchor: the diff between
  // the earliest and latest in-period samples is still a REAL observed drop
  // between two distinct readings (just possibly missing whatever was spent
  // before the first one), so this keeps the original behaviour.
  const earliest = inPeriod[0]!.amount
  const spend = earliest - latest
  return spend > 0 ? spend : 0
}

/** Local midnight today, as epoch ms, for the `todayAmount` window. */
function startOfLocalDay(now: number): number {
  const d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Local first-of-month, as epoch ms, for the `monthAmount` window. */
function startOfLocalMonth(now: number): number {
  const d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}

/**
 * Compute spend from a list of points. Pure and exported so the delta logic is
 * unit-tested without any filesystem. Returns null when there are fewer than
 * two points — a single reading has no delta, so spend is unknown, not zero.
 */
export function computeSpendFromPoints(
  points: readonly BalancePoint[],
  now: number
): QuotaCost | null {
  const sorted = [...points].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  if (sorted.length < 2) return null

  const currency = sorted[sorted.length - 1]!.currency
  return {
    currency,
    // No session concept for a standing balance — there is no window to anchor.
    sessionAmount: null,
    todayAmount: spendInPeriod(sorted, startOfLocalDay(now)),
    monthAmount: spendInPeriod(sorted, startOfLocalMonth(now)),
    // Real spend, derived from a balance falling over time.
    meteredByToken: true
  }
}

/**
 * Record a provider's current balance, if it changed. Non-throwing: a write
 * failure is logged and swallowed so a history problem can never fail a
 * refresh. `now` is injectable for tests; production omits it.
 */
export function recordBalance(
  providerId: string,
  balance: QuotaBalance,
  now: number = Date.now()
): void {
  const amount = parseAmount(balance.totalBalance)
  if (amount === null) return // Un-parseable balance: nothing safe to record.

  try {
    const store = loadStore()
    const existing = store[providerId] ?? []
    const point: BalancePoint = {
      at: new Date(now).toISOString(),
      amount,
      currency: balance.currency
    }
    const next = appendPoint(existing, point, now)
    if (next === existing) return // Deduped: identical consecutive amount.

    store[providerId] = next
    writeAtomic(balanceHistoryFilePath(), `${JSON.stringify(store)}\n`)
  } catch (err) {
    console.error('[balance-history] failed to record', err)
  }
}

/**
 * Spend for a provider over today and this month, or null when the stored
 * history is too thin to derive a delta. Reads from the cached store — cheap to
 * call on every refresh.
 */
export function computeSpend(providerId: string, now: number = Date.now()): QuotaCost | null {
  try {
    const points = loadStore()[providerId] ?? []
    return computeSpendFromPoints(points, now)
  } catch (err) {
    console.error('[balance-history] failed to compute spend', err)
    return null
  }
}

/** Test seam: drop the in-memory copy so the next read hits disk. */
export function resetBalanceHistoryCache(): void {
  cache = null
}

function writeAtomic(path: string, contents: string): void {
  const dir = dirname(path)
  const tmp = `${path}.${process.pid}.tmp`
  try {
    mkdirSync(dir, { recursive: true })
    const fd = openSync(tmp, 'w')
    try {
      writeSync(fd, contents)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(tmp, path)
  } catch (err) {
    console.error('[balance-history] failed to write', err)
    try {
      if (existsSync(tmp)) unlinkSync(tmp)
    } catch {
      // The temp file is inert; nothing useful to do.
    }
  }
}
