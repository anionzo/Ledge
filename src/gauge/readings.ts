/**
 * Reading interpretation.
 *
 * The honesty rules for the Gauge live here rather than being spread across
 * the components, because they are the part of this panel that is easy to get
 * subtly wrong and impossible to notice afterwards: a provider that failed to
 * read must never be drawn the same way as a provider with nothing used.
 */
import type {
  QuotaReading,
  QuotaSeverity,
  QuotaState,
  QuotaWindow
} from '../../shared/types/quota'
import { t } from '../i18n'
import type { IconName } from '../ui'

/** A reading with a real number to show. Everything else is a status. */
export function hasNumber(reading: QuotaReading): boolean {
  return reading.state === 'ok' && reading.ringPercent !== null
}

/**
 * A balance-shaped reading: money left rather than a used-percentage. These
 * draw a balance meter in place of the ring, and `ringPercent` is null by
 * contract, so they must be routed before the ring's own null-handling.
 */
export function isBalance(reading: QuotaReading): boolean {
  return reading.state === 'ok' && reading.balance != null && reading.ringPercent === null
}

/**
 * The severity a strip dot carries.
 *
 * A window-shaped provider maps to its ring severity, but only once it has a
 * real number — an unknown is chrome, never an emergency. A balance-shaped
 * provider has no percentage to band, so it speaks through availability: green
 * while it can still make a call, critical once it cannot.
 */
export function dotSeverity(reading: QuotaReading): QuotaSeverity | 'none' {
  if (isBalance(reading)) {
    return reading.balance?.isAvailable ? 'ok' : 'critical'
  }
  if (reading.ringPercent === null) return 'none'
  return reading.severity
}

/**
 * The window the ring is showing.
 *
 * `ringPercent` is whichever window is closest to exhaustion, but the type
 * does not say which one it was, and the countdown next to the ring has to
 * name the right reset. Matching on the percentage recovers it; when both
 * windows read the same we prefer the session, because it is the one that
 * will free up first and therefore the one the user is asking about.
 */
export function ringWindow(reading: QuotaReading): QuotaWindow | null {
  const { session, weekly, ringPercent } = reading
  if (ringPercent === null) return session ?? weekly
  if (session && session.usedPercent === ringPercent) return session
  if (weekly && weekly.usedPercent === ringPercent) return weekly
  return session ?? weekly
}

export interface StatusPresentation {
  /** The short headline shown in place of a number. */
  title: string
  /** One sentence of explanation. */
  body: string
  icon: IconName
  /**
   * Whether the user can do anything about it from here.
   *
   * Only `permission-required` and `error` get a retry: retrying a provider
   * that is not installed, or one with no reader for this OS, would fail
   * identically every time and a button that cannot work is worse than none.
   */
  retryable: boolean
  /**
   * Whether the row should recede.
   *
   * `not-installed` and `unsupported-platform` are not problems — they are the
   * correct, permanent answer for this machine — so they sit quietly. The
   * other failures stay at full weight because they are asking for something.
   */
  muted: boolean
}

export function presentState(state: Exclude<QuotaState, 'ok'>): StatusPresentation {
  switch (state) {
    case 'not-installed':
      return {
        title: t('gauge.state.not_installed'),
        body: t('gauge.state.not_installed.body'),
        icon: 'info',
        retryable: false,
        muted: true
      }
    case 'logged-out':
      return {
        title: t('gauge.state.logged_out'),
        body: t('gauge.state.logged_out.body'),
        icon: 'lock',
        retryable: false,
        muted: false
      }
    case 'permission-required':
      return {
        title: t('gauge.state.permission_required'),
        body: t('gauge.state.permission_required.body'),
        icon: 'lock',
        retryable: true,
        muted: false
      }
    case 'unsupported-platform':
      return {
        title: t('gauge.state.unsupported_platform'),
        body: t('gauge.state.unsupported_platform.body'),
        icon: 'info',
        retryable: false,
        muted: true
      }
    case 'error':
      return {
        title: t('gauge.state.error'),
        body: t('gauge.state.error.body'),
        icon: 'alert',
        retryable: true,
        muted: false
      }
  }
}

/**
 * The ring's accessible label.
 *
 * Two forms, never one with a zero substituted in: a screen reader user has no
 * dimmed row or em dash to fall back on, so the distinction between "unknown"
 * and "nothing used" has to be in the words.
 */
export function ringLabel(reading: QuotaReading): string {
  if (isBalance(reading) && reading.balance) {
    return t('gauge.balance.aria', {
      name: reading.displayName,
      currency: reading.balance.currency,
      amount: reading.balance.totalBalance,
      status: reading.balance.isAvailable
        ? t('gauge.balance.available')
        : t('gauge.balance.unavailable')
    })
  }
  if (!hasNumber(reading)) {
    return t('gauge.ring.aria_unknown', { name: reading.displayName })
  }
  return t('gauge.ring.aria', {
    name: reading.displayName,
    percent: Math.round(reading.ringPercent as number)
  })
}
