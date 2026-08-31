/**
 * Burn rate ("pace") for a percentage-shaped reading.
 *
 * Pure arithmetic over one `QuotaReading` and a clock — no filesystem, no
 * Electron — so it is unit-testable the same way the cache is. The governing
 * rule from util.ts applies here with full force: never invent a number. A
 * window whose length cannot be inferred from its label yields null rather
 * than a guess, because a wrong length becomes a wrong elapsed fraction, and
 * a false "hot" chip is worse than no pace at all.
 */
import type { QuotaReading, QuotaWindow, UsagePace } from '../../../shared/types/quota'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/**
 * The window that drives `ringPercent` — whichever is closest to exhaustion,
 * mirroring the `Math.max` in `makeReading`. On a tie the session wins, which
 * is the same answer `max(s, w)` gives. Null when neither window has a number.
 */
export function ringWindow(reading: QuotaReading): QuotaWindow | null {
  const s = reading.session?.usedPercent ?? null
  const w = reading.weekly?.usedPercent ?? null
  if (s === null && w === null) return null
  if (w === null || (s !== null && s >= w)) return reading.session
  return reading.weekly
}

/**
 * Infer a window's LENGTH from the shape of its label.
 *
 * Recognised shapes, and nothing else:
 *  - a leading `<n>h` ("5h session") → n hours;
 *  - "Weekly" → 7 days, "Monthly" → 30 days;
 *  - "Billing period" → ambiguous between a weekly and a monthly plan, so the
 *    reset disambiguates: a reset ≤7 days away can only be a weekly period,
 *    anything further out is treated as monthly.
 *
 * Every other label ("Rolling window", "Product usage", …) returns null.
 * Deriving a length from the reset instant alone would be guessing — a reset
 * says when a window ends, not how long it has been running.
 */
export function windowLengthMs(label: string, resetMs: number, now: number): number | null {
  const trimmed = label.trim()
  const hours = /^(\d+(?:\.\d+)?)\s*h\b/i.exec(trimmed)
  if (hours) {
    const n = Number(hours[1])
    return Number.isFinite(n) && n > 0 ? n * HOUR_MS : null
  }
  const lower = trimmed.toLowerCase()
  if (lower === 'weekly') return 7 * DAY_MS
  if (lower === 'monthly') return 30 * DAY_MS
  if (lower === 'billing period') return resetMs - now <= 7 * DAY_MS ? 7 * DAY_MS : 30 * DAY_MS
  return null
}

/**
 * Burn rate for the window the ring shows, or null when it cannot be proved.
 *
 * Requires an `ok` reading whose driving window has both a numeric percentage
 * and a parseable reset instant; anything less is null, never a guess.
 *
 * The window began one length before it resets, so
 *
 *   elapsedFraction = clamp((now − (resetsAt − length)) / length, 0, 1)
 *
 * and the reading is `hot` when
 *
 *   usedPercent > elapsedFraction × 100 × 1.15 + 5
 *
 * The 15% multiplier forgives ordinary burstiness — nobody spends a window
 * perfectly evenly, and flagging every lunch-hour spike would train the user
 * to ignore the chip. The flat 5-point floor keeps the first minutes of a
 * fresh window from screaming: at elapsedFraction ≈ 0 any use at all would
 * otherwise be "ahead of pace". The clamp means a reset instant slightly in
 * the past reads as a fully elapsed window (threshold 120), which can never
 * be hot — correct, since the window is over.
 */
export function computePace(reading: QuotaReading, now: number): UsagePace | null {
  if (reading.state !== 'ok') return null
  const win = ringWindow(reading)
  if (!win || win.usedPercent === null || win.resetsAt === null) return null

  const resetMs = Date.parse(win.resetsAt)
  if (!Number.isFinite(resetMs)) return null

  const lengthMs = windowLengthMs(win.label, resetMs, now)
  if (lengthMs === null) return null

  const start = resetMs - lengthMs
  const elapsedFraction = Math.min(1, Math.max(0, (now - start) / lengthMs))
  return win.usedPercent > elapsedFraction * 100 * 1.15 + 5 ? 'hot' : 'ok'
}
