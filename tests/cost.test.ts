/**
 * Cost Meter — the price reference (pricing.ts) and real-spend math
 * (balanceHistory.ts).
 *
 * Both halves are exercised as pure functions: `modelPrice`/`estimateCost` need
 * nothing external, and spend is tested through `computeSpendFromPoints`, which
 * takes an explicit list of points and a clock, so no filesystem or Electron
 * `app` is ever touched. This mirrors how the quota cache is tested — pure
 * helpers over injected data.
 */
import { describe, expect, it } from 'vitest'
import { estimateCost, modelPrice } from '../shared/pricing'
import {
  appendPoint,
  computeSpendFromPoints,
  parseAmount,
  type BalancePoint
} from '../electron/store/balanceHistory'

// ── modelPrice normalization ────────────────────────────────────────────────

describe('modelPrice', () => {
  it('matches an exact canonical id', () => {
    const p = modelPrice('claude-opus-4-8')
    expect(p).not.toBeNull()
    expect(p!.model).toBe('claude-opus-4-8')
    expect(p!.inputPerMtok).toBe(5)
    expect(p!.outputPerMtok).toBe(25)
    expect(p!.cacheReadPerMtok).toBe(0.5)
    expect(p!.cacheWritePerMtok).toBe(6.25)
  })

  it('is case-insensitive', () => {
    expect(modelPrice('CLAUDE-HAIKU-4-5')?.model).toBe('claude-haiku-4-5')
    expect(modelPrice('Claude-Sonnet-5')?.inputPerMtok).toBe(2)
  })

  it('tolerates a dated snapshot suffix', () => {
    expect(modelPrice('claude-opus-4-8-20260515')?.model).toBe('claude-opus-4-8')
    expect(modelPrice('claude-sonnet-5@20260101')?.model).toBe('claude-sonnet-5')
  })

  it('tolerates a provider prefix and a version tail', () => {
    expect(modelPrice('anthropic/claude-sonnet-5')?.model).toBe('claude-sonnet-5')
    expect(modelPrice('us.anthropic.claude-opus-4-8-v1:0')?.model).toBe('claude-opus-4-8')
    expect(modelPrice('bedrock/claude-fable-5-latest')?.model).toBe('claude-fable-5')
  })

  it('returns null for unknown or non-Anthropic models', () => {
    expect(modelPrice('gpt-4o')).toBeNull()
    expect(modelPrice('deepseek-chat')).toBeNull()
    // A real Anthropic model that predates this build's table is still unknown.
    expect(modelPrice('claude-3-5-sonnet-20241022')).toBeNull()
    expect(modelPrice('')).toBeNull()
    expect(modelPrice('   ')).toBeNull()
  })
})

// ── estimateCost math ───────────────────────────────────────────────────────

describe('estimateCost', () => {
  const opus = modelPrice('claude-opus-4-8')!

  it('sums each token kind at its per-million price', () => {
    // 1M of each: 5 + 25 + 0.5 + 6.25.
    const cost = estimateCost(opus, {
      input: 1_000_000,
      output: 1_000_000,
      cacheRead: 1_000_000,
      cacheWrite: 1_000_000
    })
    expect(cost).toBeCloseTo(36.75, 10)
  })

  it('scales linearly below a million', () => {
    const cost = estimateCost(opus, { input: 500_000, output: 0, cacheRead: 0, cacheWrite: 0 })
    expect(cost).toBeCloseTo(2.5, 10)
  })

  it('treats missing, negative or non-finite counts as zero', () => {
    const cost = estimateCost(opus, {
      input: 1_000_000,
      output: -5,
      cacheRead: Number.NaN,
      cacheWrite: 0
    })
    // Only the 1M of input contributes.
    expect(cost).toBeCloseTo(5, 10)
  })
})

// ── computeSpend (real spend from balance deltas) ───────────────────────────

/** A point at a LOCAL wall-clock time, so period math lines up with the clock. */
function point(
  y: number,
  mo: number,
  d: number,
  h: number,
  amount: number,
  currency: 'USD' | 'CNY' = 'USD'
): BalancePoint {
  return { at: new Date(y, mo, d, h, 0, 0).toISOString(), amount, currency }
}

describe('computeSpendFromPoints', () => {
  // Local noon on the 15th, so both the day and month windows have room.
  const now = new Date(2026, 5, 15, 12, 0, 0).getTime()

  it('reports spend today and this month from a falling balance', () => {
    const points = [
      point(2026, 5, 1, 9, 100), // month start, before today
      point(2026, 5, 15, 8, 60), // today
      point(2026, 5, 15, 11, 50) // today, latest
    ]
    const cost = computeSpendFromPoints(points, now)
    expect(cost).not.toBeNull()
    // Today: 60 (first in-day) − 50 (latest) = 10.
    expect(cost!.todayAmount).toBeCloseTo(10, 10)
    // Month: 100 (first in-month) − 50 (latest) = 50.
    expect(cost!.monthAmount).toBeCloseTo(50, 10)
    // No session concept for a standing balance.
    expect(cost!.sessionAmount).toBeNull()
    expect(cost!.meteredByToken).toBe(true)
  })

  it('sorts unsorted input before computing', () => {
    const points = [
      point(2026, 5, 15, 11, 50),
      point(2026, 5, 15, 8, 60),
      point(2026, 5, 1, 9, 100)
    ]
    const cost = computeSpendFromPoints(points, now)
    expect(cost!.todayAmount).toBeCloseTo(10, 10)
    expect(cost!.monthAmount).toBeCloseTo(50, 10)
  })

  it('floors a top-up (rising balance) at 0, never negative', () => {
    const points = [
      point(2026, 5, 15, 8, 50),
      point(2026, 5, 15, 11, 80) // topped up
    ]
    const cost = computeSpendFromPoints(points, now)
    expect(cost!.todayAmount).toBe(0)
    expect(cost!.monthAmount).toBe(0)
  })

  it('returns null with fewer than two points (unknown, not zero)', () => {
    expect(computeSpendFromPoints([], now)).toBeNull()
    expect(computeSpendFromPoints([point(2026, 5, 15, 8, 50)], now)).toBeNull()
  })

  it('reports null for a period with no in-window history', () => {
    // Two points, but both before today: today has no anchor, month does.
    const points = [
      point(2026, 5, 2, 9, 100),
      point(2026, 5, 3, 9, 70) // still this month, before today
    ]
    const cost = computeSpendFromPoints(points, now)
    expect(cost!.todayAmount).toBeNull()
    expect(cost!.monthAmount).toBeCloseTo(30, 10)
  })

  it('preserves the balance currency', () => {
    const points = [
      point(2026, 5, 15, 8, 60, 'CNY'),
      point(2026, 5, 15, 11, 50, 'CNY')
    ]
    const cost = computeSpendFromPoints(points, now)
    expect(cost!.currency).toBe('CNY')
  })
})

// ── point recording helpers ─────────────────────────────────────────────────

describe('parseAmount', () => {
  it('parses a numeric string for delta math', () => {
    expect(parseAmount('12.34')).toBeCloseTo(12.34, 10)
    expect(parseAmount('  7  ')).toBe(7)
  })
  it('returns null for a non-number', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount(null)).toBeNull()
    expect(parseAmount(undefined)).toBeNull()
  })
})

describe('appendPoint', () => {
  const now = new Date(2026, 5, 15, 12, 0, 0).getTime()

  it('dedupes an identical consecutive amount (same array back)', () => {
    const start = [point(2026, 5, 15, 8, 50)]
    const same = appendPoint(start, point(2026, 5, 15, 9, 50), now)
    expect(same).toBe(start)
  })

  it('appends when the amount changed', () => {
    const start = [point(2026, 5, 15, 8, 50)]
    const next = appendPoint(start, point(2026, 5, 15, 9, 40), now)
    expect(next).not.toBe(start)
    expect(next).toHaveLength(2)
    expect(next[1]!.amount).toBe(40)
  })
})
