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
 *  - "Weekly" → 7 days, "Monthly" → 30 days.
 *
 * Every other label — including "Billing period", "Rolling window", "Product
 * usage", … — returns null. "Billing period" used to be disambiguated by how
 * far off the reset was (≤7 days → weekly, else monthly), but that reset
 * instant is the one thing this function is not allowed to lean on: a reset
 * says when a window ends, not how long it has been running, and in the last
 * week of a monthly cycle "≤7 days to reset" is exactly as true of a monthly
 * plan as of a weekly one. Guessing weekly there was wrong in precisely the
 * case that matters — the closing week of the month, at real usage — where it
 * assumed a window seven times shorter than the truth and lit up "hot" for
 * anyone merely on pace. Cursor and Grok both use this label for a monthly
 * cycle, and neither response says the cycle's actual length anywhere else,
 * so there is nothing honest to derive it from. Losing the pace chip for
 * "Billing period" is the correct price: no chip is honest, a wrong chip
 * trains the user to ignore the one case that matters.
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

  // A length the provider actually stated beats one recovered from the label.
  // `windowLengthMs` can only read a length out of a *name*, which works for
  // "5h" and "Weekly" and cannot work for "Billing period" — so a provider
  // that hands over both ends of its period gets a real answer here where the
  // label alone would have to decline.
  const lengthMs = win.lengthMs ?? windowLengthMs(win.label, resetMs, now)
  if (lengthMs === null || !Number.isFinite(lengthMs) || lengthMs <= 0) return null

  const start = resetMs - lengthMs
  const elapsedFraction = Math.min(1, Math.max(0, (now - start) / lengthMs))
  return win.usedPercent > elapsedFraction * 100 * 1.15 + 5 ? 'hot' : 'ok'
}
