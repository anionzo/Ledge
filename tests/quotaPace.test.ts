/**
 * Burn rate ("pace") and the usage-history store behind the sparklines.
 *
 * Both are exercised as pure functions, mirroring cost.test.ts: `computePace`
 * takes a reading and a clock, and the store is tested through its exported
 * append/prune/parse helpers over explicit sample lists — so no filesystem or
 * Electron `app` is ever touched. The fs plumbing itself (atomic write, lazy
 * `require('electron')`) is byte-for-byte the balanceHistory pattern.
 */
import { describe, expect, it } from 'vitest'
import type {
  QuotaReading,
  QuotaState,
  QuotaWindow,
  UsageSample
} from '../shared/types/quota'
import { makeReading, makeWindow } from '../electron/features/quota/util'
import { computePace, windowLengthMs } from '../electron/features/quota/pace'
import {
  appendSample,
  MAX_SAMPLES,
  MIN_FLAT_INTERVAL_MS,
  parseStoreText,
  pruneSamples
} from '../electron/store/usageHistory'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** A fixed instant, so every window position is exact. */
const NOW = Date.UTC(2026, 7, 31, 12, 0, 0)

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

function reading(init: {
  state?: QuotaState
  session?: QuotaWindow | null
  weekly?: QuotaWindow | null
}): QuotaReading {
  return makeReading({
    providerId: 'claude',
    displayName: 'Claude',
    state: init.state ?? 'ok',
    session: init.session ?? null,
    weekly: init.weekly ?? null,
    now: NOW,
    alertThreshold: 80
  })
}

// ── computePace ─────────────────────────────────────────────────────────────

describe('computePace', () => {
  it('reads on pace as ok: 5h window half elapsed at 30%', () => {
    // Half elapsed → threshold 50 × 1.15 + 5 = 62.5.
    const r = reading({ session: makeWindow('5h session', 30, iso(NOW + 2.5 * HOUR)) })
    expect(computePace(r, NOW)).toBe('ok')
  })

  it('reads ahead of the clock as hot: 5h window half elapsed at 80%', () => {
    const r = reading({ session: makeWindow('5h session', 80, iso(NOW + 2.5 * HOUR)) })
    expect(computePace(r, NOW)).toBe('hot')
  })

  it('returns null for a label whose length cannot be inferred', () => {
    // "Rolling window" (OpenCode) has no derivable length — null, not a guess.
    const r = reading({ session: makeWindow('Rolling window', 80, iso(NOW + HOUR)) })
    expect(computePace(r, NOW)).toBeNull()
  })

  it('returns null without a reset instant', () => {
    expect(computePace(reading({ session: makeWindow('5h session', 80, null) }), NOW)).toBeNull()
    expect(
      computePace(reading({ session: makeWindow('5h session', 80, 'not a date') }), NOW)
    ).toBeNull()
  })

  it('returns null for a non-ok reading', () => {
    const r = reading({
      state: 'error',
      session: makeWindow('5h session', 30, iso(NOW + 2.5 * HOUR))
    })
    expect(computePace(r, NOW)).toBeNull()
  })

  it('never screams in the first minutes of a window (the 5-point floor)', () => {
    // Window just opened: elapsedFraction 0, so the threshold is the bare
    // floor of 5. A couple of percent is fine; above the floor is hot.
    const fresh = (percent: number): QuotaReading =>
      reading({ session: makeWindow('5h session', percent, iso(NOW + 5 * HOUR)) })
    expect(computePace(fresh(4), NOW)).toBe('ok')
    expect(computePace(fresh(6), NOW)).toBe('hot')
  })

  it('treats a reset already in the past as fully elapsed, never hot', () => {
    const r = reading({ session: makeWindow('5h session', 100, iso(NOW - HOUR)) })
    expect(computePace(r, NOW)).toBe('ok')
  })

  it('understands Weekly and Monthly labels', () => {
    // Both half elapsed → threshold 62.5 either way.
    const weekly = reading({ weekly: makeWindow('Weekly', 70, iso(NOW + 3.5 * DAY)) })
    expect(computePace(weekly, NOW)).toBe('hot')
    const monthly = reading({ session: makeWindow('Monthly', 30, iso(NOW + 15 * DAY)) })
    expect(computePace(monthly, NOW)).toBe('ok')
  })

  it('disambiguates a Billing period by how far off the reset is', () => {
    // Reset 2d away → a weekly period, 5/7 elapsed → threshold ≈ 87.1 → ok.
    const shortPlan = reading({ weekly: makeWindow('Billing period', 80, iso(NOW + 2 * DAY)) })
    expect(computePace(shortPlan, NOW)).toBe('ok')
    // Same 80%, but the reset 15d away → a monthly period, half elapsed
    // → threshold 62.5 → hot.
    const longPlan = reading({ weekly: makeWindow('Billing period', 80, iso(NOW + 15 * DAY)) })
    expect(computePace(longPlan, NOW)).toBe('hot')
  })

  it('paces the window that drives the ring, not the other one', () => {
    // The weekly window is the max (70 > 20), so it drives the ring — and the
    // pace. Judged against the session window instead, 20% at half elapsed
    // would read ok.
    const r = reading({
      session: makeWindow('5h session', 20, iso(NOW + 2.5 * HOUR)),
      weekly: makeWindow('Weekly', 70, iso(NOW + 3.5 * DAY))
    })
    expect(r.ringPercent).toBe(70)
    expect(computePace(r, NOW)).toBe('hot')
  })
})

describe('windowLengthMs', () => {
  it('parses a leading <n>h from the label', () => {
    expect(windowLengthMs('5h session', NOW + HOUR, NOW)).toBe(5 * HOUR)
    expect(windowLengthMs('12h rolling', NOW + HOUR, NOW)).toBe(12 * HOUR)
  })

  it('returns null rather than guessing an unknown label', () => {
    expect(windowLengthMs('Product usage', NOW + HOUR, NOW)).toBeNull()
    expect(windowLengthMs('Session', NOW + HOUR, NOW)).toBeNull()
    expect(windowLengthMs('', NOW + HOUR, NOW)).toBeNull()
  })
})

// ── usage-history store ─────────────────────────────────────────────────────

function sample(ms: number, percent: number): UsageSample {
  return { at: iso(ms), percent }
}

describe('appendSample', () => {
  it('skips an unchanged percent within the heartbeat interval (same array back)', () => {
    const start = [sample(NOW, 40)]
    const at = NOW + 5 * MINUTE
    expect(appendSample(start, sample(at, 40), at)).toBe(start)
  })

  it('re-admits an unchanged percent once the heartbeat interval has passed', () => {
    const start = [sample(NOW, 40)]
    const at = NOW + MIN_FLAT_INTERVAL_MS
    const next = appendSample(start, sample(at, 40), at)
    expect(next).toHaveLength(2)
    expect(next[1]!.at).toBe(iso(at))
  })

  it('appends a changed percent immediately', () => {
    const start = [sample(NOW, 40)]
    const at = NOW + 1000
    const next = appendSample(start, sample(at, 41), at)
    expect(next).toHaveLength(2)
    expect(next[1]!.percent).toBe(41)
  })

  it('prunes expired samples on the way in', () => {
    const start = [sample(NOW - 15 * DAY, 10), sample(NOW - MINUTE, 20)]
    const next = appendSample(start, sample(NOW, 30), NOW)
    expect(next.map((s) => s.percent)).toEqual([20, 30])
  })
})

describe('pruneSamples', () => {
  it('caps a list at MAX_SAMPLES, keeping the most recent', () => {
    const extra = 5
    const all = Array.from({ length: MAX_SAMPLES + extra }, (_, i) =>
      sample(NOW - (MAX_SAMPLES + extra - i) * MINUTE, i % 101)
    )
    const kept = pruneSamples(all, NOW)
    expect(kept).toHaveLength(MAX_SAMPLES)
    // The oldest `extra` fell off the front.
    expect(kept[0]!.at).toBe(all[extra]!.at)
  })

  it('drops samples older than 14 days', () => {
    const kept = pruneSamples([sample(NOW - 15 * DAY, 10), sample(NOW - HOUR, 20)], NOW)
    expect(kept.map((s) => s.percent)).toEqual([20])
  })

  it('sorts oldest first', () => {
    const kept = pruneSamples([sample(NOW, 30), sample(NOW - HOUR, 10)], NOW)
    expect(kept.map((s) => s.percent)).toEqual([10, 30])
  })
})

describe('parseStoreText', () => {
  it('degrades a corrupt file to an empty store, never a throw', () => {
    expect(parseStoreText('not json {')).toEqual({})
    expect(parseStoreText('')).toEqual({})
    expect(parseStoreText('[]')).toEqual({}) // Wrong root shape.
    expect(parseStoreText('42')).toEqual({})
  })

  it('drops malformed entries and keeps the valid ones', () => {
    const text = JSON.stringify({
      claude: [
        { at: 'nope', percent: 50 }, // Unparseable instant.
        { at: iso(NOW), percent: 200 }, // Out of range.
        { at: iso(NOW), percent: 30 }, // Valid.
        'junk'
      ],
      bad: 'not a list'
    })
    expect(parseStoreText(text)).toEqual({ claude: [{ at: iso(NOW), percent: 30 }] })
  })
})
