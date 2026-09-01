/**
 * Caching, backoff and staleness for quota readings.
 *
 * Three pieces, ported from agent-notch:
 *
 *  - `ReadingCache.read` is `readWithCache` from `scrapers.js`: single-flight
 *    per provider, a per-provider TTL, and exponential backoff so a provider
 *    that is down is not hammered once a minute forever.
 *  - `keepLastKnown` is from `quota-state.js` and is the good part of that
 *    file: when a refresh fails, keep showing the last real reading — clearly
 *    marked `stale` — for at most `STALE_TTL_MS`, rather than blanking a
 *    number the user was mid-glance at. After the TTL the failure shows
 *    through, because a five-minute-old number presented as current is a lie.
 *  - the fingerprint helpers let the main process skip an IPC push when
 *    nothing a user could see has changed.
 */
import type { QuotaReading, QuotaSnapshot } from '../../../shared/types/quota'
import { STALE_TTL_MS } from '../../../shared/types/quota'
import type { QuotaProvider, ReadContext } from './provider'
import { makeReading } from './util'

/** Ceiling on the backoff, ported from READER_MAX_BACKOFF_MS. */
export const MAX_BACKOFF_MS = 5 * 60 * 1000

interface CacheEntry {
  reading: QuotaReading | null
  failures: number
  nextPollAt: number
  inFlight: Promise<QuotaReading> | null
}

/**
 * How long to wait after `failures` consecutive unsuccessful reads.
 * `failures` of 1 yields the provider's own TTL, doubling from there.
 */
export function backoffDelay(ttlMs: number, failures: number): number {
  const exponent = Math.max(0, failures - 1)
  return Math.min(ttlMs * 2 ** exponent, MAX_BACKOFF_MS)
}

/** Shallow copy so a caller mutating a reading cannot corrupt the cache. */
function clone(reading: QuotaReading): QuotaReading {
  return { ...reading }
}

export class ReadingCache {
  private entries = new Map<string, CacheEntry>()

  clear(): void {
    this.entries.clear()
  }

  /** Test/diagnostic view of the consecutive-failure count. */
  failureCount(providerId: string): number {
    return this.entries.get(providerId)?.failures ?? 0
  }

  /**
   * Read a provider, honouring the cache.
   *
   * Never rejects. A provider that throws — which it should not, per the
   * `QuotaProvider` contract — is converted to an `error` reading so one bad
   * provider cannot fail the batch.
   */
  read(
    provider: QuotaProvider,
    ctx: ReadContext,
    options: { force?: boolean } = {}
  ): Promise<QuotaReading> {
    const { force = false } = options
    const existing: CacheEntry = this.entries.get(provider.id) ?? {
      reading: null,
      failures: 0,
      nextPollAt: 0,
      inFlight: null
    }

    // Single flight: a concurrent caller joins the read already in progress
    // rather than opening a second connection with the same credential.
    if (existing.inFlight) return existing.inFlight.then(clone)
    if (!force && existing.reading && existing.nextPollAt > ctx.now) {
      return Promise.resolve(clone(existing.reading))
    }

    const inFlight = Promise.resolve()
      .then(() => provider.read(ctx))
      .catch((err: unknown) =>
        // Defensive: providers are contractually required to resolve.
        makeReading({
          providerId: provider.id,
          displayName: provider.displayName,
          state: 'error',
          message: err instanceof Error ? `Provider threw: ${err.name}` : 'Provider threw',
          now: ctx.now,
          alertThreshold: ctx.alertThreshold
        })
      )
      .then((reading) => {
        const ok = reading.state === 'ok'
        const failures = ok ? 0 : existing.failures + 1
        const delay = ok ? provider.ttlMs : backoffDelay(provider.ttlMs, failures)
        this.entries.set(provider.id, {
          reading,
          failures,
          nextPollAt: ctx.now + delay,
          inFlight: null
        })
        return clone(reading)
      })

    this.entries.set(provider.id, { ...existing, inFlight })
    return inFlight
  }
}

/** The engine's cache. Module-level, as in the original. */
export const readingCache = new ReadingCache()

/** Drop everything. Tests call this; so does a settings change that could
 *  invalidate a reading (a changed custom command, for instance). */
export function resetQuotaCache(): void {
  readingCache.clear()
}

/**
 * Merge a previous set of readings into a new one, retaining a recent good
 * reading behind any provider that has just failed.
 *
 * Rules, unchanged from `quota-state.js`:
 *  - a fresh `ok` reading always wins and clears `stale`;
 *  - a previous reading is only retained if it was itself `ok`, or was
 *    already a retained `ok` (`stale`), so a failure never props up a failure;
 *  - retention expires `staleTtlMs` after the reading was *observed*, not
 *    after it was retained, so repeated failures cannot extend its life;
 *  - the retained reading carries the new failure's message, so the UI can
 *    say both "42%" and "refresh failed: offline".
 *
 * Dropped from the original: `staleAgeMs` and `attemptedAt`, which are not in
 * the `QuotaReading` contract. Age is `now - Date.parse(observedAt)`, which
 * the renderer can compute and keep ticking without another push.
 */
export function keepLastKnown(
  previous: readonly QuotaReading[] | null | undefined,
  next: readonly QuotaReading[],
  now: number,
  staleTtlMs: number = STALE_TTL_MS
): QuotaReading[] {
  if (!previous || previous.length === 0) return next.map(clone)
  const byId = new Map(previous.map((reading) => [reading.providerId, reading]))

  return next.map((reading) => {
    // A fresh `ok` reading clears the retention flag — that is what this line
    // is for. But `stale` has two authors: this function raises it when a
    // refresh failed and we are showing yesterday's number, and a *provider*
    // raises it when the number it just read was itself already old. The
    // second kind is not ours to clear. Antigravity is the case: it reads a
    // credit balance out of a local database that only Antigravity itself
    // rewrites, so the read succeeds (`ok`) while the value can be days old,
    // and the provider says so. Overwriting that with `false` here republished
    // a stale number as current — precisely the lie this file's own comment
    // about five-minute-old readings warns against.
    if (reading.state === 'ok') return reading.stale ? clone(reading) : { ...reading, stale: false }

    const old = byId.get(reading.providerId)
    if (!old) return clone(reading)
    // Only a real reading, or one already standing in for a real reading, is
    // worth keeping. Never retain one failure over another.
    if (old.state !== 'ok' && !old.stale) return clone(reading)

    const observedAt = Date.parse(old.observedAt)
    const ageMs = Number.isFinite(observedAt)
      ? Math.max(0, now - observedAt)
      : Number.POSITIVE_INFINITY
    if (ageMs > staleTtlMs) return clone(reading)

    return {
      ...old,
      stale: true,
      message: reading.message ?? 'Usage refresh failed'
    }
  })
}

/**
 * A stable string for one reading, covering exactly the fields the gauge
 * renders. `observedAt` is excluded on purpose: a re-read that produces the
 * same numbers should not repaint.
 */
export function readingFingerprint(reading: QuotaReading): string {
  return [
    reading.providerId,
    reading.state,
    reading.severity,
    reading.ringPercent ?? '',
    reading.session?.usedPercent ?? '',
    reading.session?.resetsAt ?? '',
    reading.weekly?.usedPercent ?? '',
    reading.weekly?.resetsAt ?? '',
    reading.modelName ?? '',
    reading.message ?? '',
    // `pace` is rendered (the "hot" chip), so a flip must count as a visible
    // change and trigger a push even while the percentages stand still. Note
    // `cost` stays excluded — see `withCost` in index.ts for why.
    reading.pace ?? '',
    reading.stale ? 'stale' : 'fresh'
  ].join(':')
}

/**
 * A stable string for a whole snapshot. Excludes `lastUpdated`, which changes
 * on every cycle by definition and would defeat the whole point.
 */
export function snapshotFingerprint(snapshot: QuotaSnapshot | null | undefined): string {
  if (!snapshot || !Array.isArray(snapshot.readings)) return ''
  return snapshot.readings.map(readingFingerprint).join('|')
}

/** True when `next` shows the user something `previous` did not. */
export function snapshotChanged(
  previous: QuotaSnapshot | null | undefined,
  next: QuotaSnapshot | null | undefined
): boolean {
  return snapshotFingerprint(previous) !== snapshotFingerprint(next)
}
