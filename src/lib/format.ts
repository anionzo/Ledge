/**
 * Formatting helpers shared by both panels.
 *
 * Every string that reaches a user comes out of `t()`, so these functions
 * assemble translated fragments rather than concatenating English. That is why
 * `humaniseDuration` returns `t('time.hours', ...)` and not `${h}h ${m}m`.
 */
import { t } from '../i18n'

/**
 * "2h 15m" — the countdown shown next to a quota ring.
 *
 * Deliberately coarse. A quota window resetting at 14:03:27 is noise; the user
 * is deciding whether to start another task, and one significant unit plus its
 * neighbour is the whole answer. Anything under a minute reads as "now",
 * because a ticking seconds counter invites staring at it.
 */
export function humaniseDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return t('time.now')
  const totalMinutes = Math.floor(ms / 60_000)
  if (totalMinutes < 1) return t('time.now')

  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) return t('time.days', { d: days, h: hours })
  if (hours > 0) return t('time.hours', { h: hours, m: minutes })
  return t('time.minutes', { m: minutes })
}

/** Milliseconds until an ISO instant, or null when the instant is unusable. */
export function msUntil(iso: string | null, now: number = Date.now()): number | null {
  if (!iso) return null
  const at = Date.parse(iso)
  return Number.isNaN(at) ? null : at - now
}

/** "just now" / "12m ago" — for `observedAt` and `lastUpdated`. */
export function humaniseAgo(iso: string | null, now: number = Date.now()): string {
  const delta = msUntil(iso, now)
  if (delta === null) return t('common.unknown')
  const elapsed = -delta
  if (elapsed < 60_000) return t('time.just_now')
  return t('time.ago', { duration: humaniseDuration(elapsed) })
}

/** Wall-clock time only — a date is never useful for a reading minutes old. */
export function formatClock(iso: string | null): string {
  if (!iso) return t('common.unknown')
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return t('common.unknown')
  try {
    return new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
      hour: '2-digit',
      minute: '2-digit'
    }).format(at)
  } catch {
    return at.toTimeString().slice(0, 5)
  }
}

/** Binary-prefixed but decimal-labelled, matching what file managers show. */
export function humaniseBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return EM_DASH
  if (bytes < 1024) return t('size.bytes', { n: bytes })
  const kb = bytes / 1024
  if (kb < 1024) return t('size.kb', { n: round(kb) })
  const mb = kb / 1024
  if (mb < 1024) return t('size.mb', { n: round(mb) })
  return t('size.gb', { n: round(mb / 1024) })
}

function round(n: number): number {
  return n < 10 ? Math.round(n * 10) / 10 : Math.round(n)
}

/**
 * The typographic em dash, used everywhere a number is genuinely unknown.
 *
 * Exported as a constant so the "never render a fake 0%" rule is one grep
 * away, and so the character cannot drift to a hyphen.
 */
export const EM_DASH = '—'

/** Collapse whitespace so a multi-line clip fits on a card's one line. */
export function oneLine(text: string, limit = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat
}

/** Host of a URL, for the link card's secondary line. Falsey URLs pass through. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * Middle-elide a path: the tail identifies the file, the head identifies the
 * project, and the middle is the part nobody reads.
 */
export function elidePath(path: string, limit = 44): string {
  if (path.length <= limit) return path
  const keepTail = Math.floor(limit * 0.6)
  const keepHead = limit - keepTail - 1
  return `${path.slice(0, keepHead)}…${path.slice(-keepTail)}`
}
