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
import { windowLabel } from '../electron/features/quota/providers/codex'
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

/**
 * A length the provider stated beats one guessed from the label.
 *
 * This is the seam that lets a "Billing period" window have a pace at all
 * after `windowLengthMs` stopped guessing: the label cannot say how long a
 * billing period runs, but a provider handing over both ends of it can.
 */
describe('computePace with a provider-stated window length', () => {
  it('uses lengthMs for a label that windowLengthMs refuses to resolve', () => {
    // 30-day period, 6 days to reset, 70% used: 80% elapsed, threshold 97 —
    // on pace. The very case that read as "hot" while the length was guessed.
    const win = makeWindow('Billing period', 70, iso(NOW + 6 * DAY), 30 * DAY)
    expect(computePace(reading({ session: win }), NOW)).toBe('ok')
  })

  it('still flags genuinely hot usage once the length is known', () => {
    // Same 30-day period 6 days from reset, but 99% used against 80% elapsed.
    const win = makeWindow('Billing period', 99, iso(NOW + 6 * DAY), 30 * DAY)
    expect(computePace(reading({ session: win }), NOW)).toBe('hot')
  })

  it('declines when the stated length is not a usable number', () => {
    // A zero or negative length would divide the window into nothing; the
    // field is dropped at construction, so this falls back to the label — and
    // "Billing period" has no length, so there is no answer to give.
    expect(makeWindow('Billing period', 70, iso(NOW + 6 * DAY), 0).lengthMs).toBeUndefined()
    const win = makeWindow('Billing period', 70, iso(NOW + 6 * DAY), 0)
    expect(computePace(reading({ session: win }), NOW)).toBeNull()
  })
})

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

  it('never guesses a length for "Billing period" — null regardless of reset distance', () => {
    // The old behaviour disambiguated by how far off the reset was (≤7d →
    // weekly, else monthly). That guess was wrong in exactly the case that
    // matters — see the false-alarm regression below — so both distances now
    // come back with no pace at all rather than a plausible-looking one.
    const nearReset = reading({ weekly: makeWindow('Billing period', 80, iso(NOW + 2 * DAY)) })
    expect(computePace(nearReset, NOW)).toBeNull()
    const farReset = reading({ weekly: makeWindow('Billing period', 80, iso(NOW + 15 * DAY)) })
    expect(computePace(farReset, NOW)).toBeNull()
  })

  it('does not false-alarm "Burning fast" in the last week of a monthly Billing period', () => {
    // Regression for the bug this fix closes. A 30-day cycle, 6 days from
    // reset, 70% used is dead on pace for the real window (elapsedFraction
    // 0.8 → threshold ≈ 97 → ok) — but the old code saw "≤7 days to reset"
    // and assumed a 7-day window, giving elapsedFraction ≈ 0.143 and a
    // threshold of ≈ 21.4, so anyone above ~21% used got a false "hot" for
    // the entire closing week of every monthly cycle. Cursor and Grok both
    // use this label for a monthly plan. The only honest answer is no pace
    // chip at all, not a wrong one.
    const r = reading({ weekly: makeWindow('Billing period', 70, iso(NOW + 6 * DAY)) })
    expect(computePace(r, NOW)).toBeNull()
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

  it('no longer disambiguates "Billing period" by reset distance — always null', () => {
    expect(windowLengthMs('Billing period', NOW + 2 * DAY, NOW)).toBeNull()
    expect(windowLengthMs('Billing period', NOW + 15 * DAY, NOW)).toBeNull()
  })
})

// ── Codex window classification (limit_window_seconds) ──────────────────────

describe('codex windowLabel', () => {
  const FIVE_HOURS_SECONDS = 5 * 60 * 60
  const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60

  it('labels a window from its own limit_window_seconds', () => {
    expect(windowLabel(FIVE_HOURS_SECONDS)).toBe('5h session')
    expect(windowLabel(SEVEN_DAYS_SECONDS)).toBe('Weekly')
  })

  it('labels correctly even when the API swaps which slot holds which length', () => {
    // Regression for the codex.ts bug: primary_window/secondary_window are
    // anonymous slots, and which one carries the 5h session versus the 7-day
    // window has been observed to flip. windowLabel is fed a slot's own
    // limit_window_seconds, never told which slot it came from, so a "primary"
    // slot holding the 7-day length must still come back 'Weekly', and a
    // "secondary" slot holding the 5-hour length must still come back
    // '5h session'.
    const swappedPrimaryLimitWindowSeconds = SEVEN_DAYS_SECONDS
    const swappedSecondaryLimitWindowSeconds = FIVE_HOURS_SECONDS
    expect(windowLabel(swappedPrimaryLimitWindowSeconds)).toBe('Weekly')
    expect(windowLabel(swappedSecondaryLimitWindowSeconds)).toBe('5h session')
  })

  it('falls back to a generic, honest label when limit_window_seconds is unusable', () => {
    expect(windowLabel(undefined)).toBe('Usage window')
    expect(windowLabel(null)).toBe('Usage window')
    expect(windowLabel(0)).toBe('Usage window')
    expect(windowLabel(-604800)).toBe('Usage window')
    expect(windowLabel('not a number')).toBe('Usage window')
    // A real but unrecognised length — Codex hasn't shipped this window
    // shape, so it gets the honest fallback rather than an invented name.
    expect(windowLabel(3600)).toBe('Usage window')
  })

  it('the fallback label never accidentally resolves to a length in pace.ts', () => {
    // Ties codex.ts to pace.ts: the fallback must not collide with one of
    // windowLengthMs's recognised shapes, or an "unusable" window would
    // silently get a guessed pace after all.
    expect(windowLengthMs(windowLabel(undefined), NOW + HOUR, NOW)).toBeNull()
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
