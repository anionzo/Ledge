/**
 * The quota strip.
 *
 * Collapsed, it is one thin line at the top of the hub: a compact chip per
 * enabled provider — brand icon plus its used-% (or short state) — wrapping
 * to a second line if the row runs out of room. That is the whole
 * at-a-glance answer to "am I close to a limit right now", and clicking a
 * chip opens that provider's own detail sheet directly. A separate chevron
 * toggles the full provider list — the same rows the standalone Gauge
 * showed, with the same honesty rules — as a dropdown over the clipboard, so
 * the shelf keeps its place underneath.
 *
 * Colour lives here and in the rings only; the used-% number and the chip's
 * severity ring are the only carriers of the one thing on this panel that
 * colour is allowed to mean. Brand icons are tinted by currentColor as
 * identity, never as status.
 */
import { memo } from 'react'
import type { QuotaReading, QuotaSeverity } from '../../../shared/types/quota'
import type { PanelSide } from '../../../shared/types/settings'
import { t } from '../../i18n'
import { Icon } from '../../ui'
import { ProviderRow } from '../../gauge/components/ProviderRow'
import { ProviderBrandIcon } from '../../gauge/components/ProviderBrandIcon'
import { dotSeverity, hasNumber, isBalance } from '../../gauge/readings'

export interface QuotaStripProps {
  readings: QuotaReading[]
  side: PanelSide
  expanded: boolean
  onToggle: () => void
  onOpenDetail: (id: string) => void
  onRetry: () => void
  retrying: boolean
}

/**
 * What a single collapsed chip shows for a reading: the value text, the
 * severity that colours the number, the severity that rings the chip, and
 * whether the chip should read as muted (nothing real to show).
 */
function chipInfo(reading: QuotaReading): {
  value: string
  valSeverity: QuotaSeverity | undefined
  chipSeverity: QuotaSeverity | 'none'
  muted: boolean
} {
  if (hasNumber(reading)) {
    return {
      value: t('unit.percent', { n: Math.round(reading.ringPercent as number) }),
      valSeverity: reading.severity,
      chipSeverity: reading.severity,
      muted: false
    }
  }
  if (isBalance(reading) && reading.balance) {
    const { currency, totalBalance, isAvailable } = reading.balance
    return {
      // Same convention as `BalanceMeter`: a currency reads as a prefixed
      // symbol ("$110.00"), but "credits" is a unit word, not a symbol, so it
      // follows the amount instead ("1000 credits"). Bare `110.00` in a row of
      // `42%` chips gave no sense of what the number even was.
      value:
        currency === 'credits'
          ? `${totalBalance} ${t('gauge.balance.credits')}`
          : `${currency}${totalBalance}`,
      valSeverity: isAvailable ? undefined : 'critical',
      chipSeverity: dotSeverity(reading),
      muted: false
    }
  }
  return { value: '—', valSeverity: undefined, chipSeverity: 'none', muted: true }
}

function QuotaStripImpl({
  readings,
  side,
  expanded,
  onToggle,
  onOpenDetail,
  onRetry,
  retrying
}: QuotaStripProps) {
  return (
    <div className="bz-quota" data-expanded={expanded || undefined}>
      <div className="bz-quota-strip bz-row">
        {readings.length === 0 ? (
          <span className="bz-quota-idle">{t('gauge.empty.title')}</span>
        ) : (
          <div className="bz-quota-chips bz-row-fill">
            {readings.map((reading) => {
              const { value, valSeverity, chipSeverity, muted } = chipInfo(reading)
              return (
                <button
                  key={reading.providerId}
                  type="button"
                  className="bz-quota-chip"
                  data-severity={chipSeverity}
                  data-muted={muted || undefined}
                  data-pace={reading.pace === 'hot' ? 'hot' : undefined}
                  onClick={() => onOpenDetail(reading.providerId)}
                  title={reading.displayName}
                  aria-label={reading.displayName}
                >
                  <ProviderBrandIcon
                    id={reading.providerId}
                    size={13}
                    className="bz-quota-chip-glyph"
                  />
                  <span className="bz-quota-chip-val" data-severity={valSeverity}>
                    {value}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* One glyph, rotated by CSS when expanded — the icon set has no
            chevron-up, and a rotate reads as the same control turning rather
            than a different one appearing. */}
        <button
          type="button"
          className="bz-quota-toggle"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={t('gauge.strip.details')}
        >
          <Icon name="chevron-down" size={12} className="bz-quota-chevron" />
        </button>
      </div>

      {expanded && (
        <div className="bz-quota-panel" role="region" aria-label={t('gauge.title')}>
          {readings.length === 0 ? (
            <p className="bz-quota-empty">{t('gauge.empty.body')}</p>
          ) : (
            <div className="bz-provider-list">
              {readings.map((reading) => (
                <ProviderRow
                  key={reading.providerId}
                  reading={reading}
                  side={side}
                  onOpenDetail={onOpenDetail}
                  onRetry={onRetry}
                  retrying={retrying}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const QuotaStrip = memo(QuotaStripImpl)
