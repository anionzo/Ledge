/**
 * The quota strip.
 *
 * Collapsed, it is one thin line at the top of the hub: a severity-coloured dot
 * per provider and the single hottest used-percentage. That is the whole
 * at-a-glance answer to "am I close to a limit right now". Pressing it expands
 * the full provider list — the same rows the standalone Gauge showed, with the
 * same honesty rules — as a dropdown over the clipboard, so the shelf keeps its
 * place underneath.
 *
 * Colour lives here and in the rings only; the dot is the smallest possible
 * carrier of the one thing on this panel that colour is allowed to mean.
 */
import { memo, useMemo } from 'react'
import type { QuotaReading } from '../../../shared/types/quota'
import type { PanelSide } from '../../../shared/types/settings'
import { t } from '../../i18n'
import { Icon } from '../../ui'
import { ProviderRow } from '../../gauge/components/ProviderRow'
import { dotSeverity } from '../../gauge/readings'

const EM_DASH = '—'

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
 * The hottest reading is the one closest to its limit — the number the strip
 * shows, and whose severity tints the whole strip. Readings without a number
 * (`not-installed`, `logged-out`, …) never win: an unknown is not an emergency.
 */
function hottest(readings: QuotaReading[]): QuotaReading | null {
  let best: QuotaReading | null = null
  for (const reading of readings) {
    if (reading.ringPercent === null) continue
    if (best === null || reading.ringPercent > (best.ringPercent ?? -1)) best = reading
  }
  return best
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
  const top = useMemo(() => hottest(readings), [readings])

  return (
    <div className="bz-quota" data-expanded={expanded || undefined}>
      <button
        type="button"
        className="bz-quota-strip bz-row"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={t('gauge.title')}
      >
        <span className="bz-quota-dots" aria-hidden="true">
          {readings.length === 0 ? (
            <span className="bz-quota-dot" data-severity="none" />
          ) : (
            readings.map((reading) => (
              <span
                key={reading.providerId}
                className="bz-quota-dot"
                data-severity={dotSeverity(reading)}
                title={reading.displayName}
              />
            ))
          )}
        </span>

        <span className="bz-quota-headline bz-row-fill bz-num">
          {top && top.ringPercent !== null ? (
            <>
              <span className="bz-quota-name">{top.displayName}</span>
              <span className="bz-quota-pct" data-severity={top.severity}>
                {top.ringPercent}%
              </span>
            </>
          ) : (
            <span className="bz-quota-name bz-quota-idle">
              {readings.length === 0 ? t('gauge.empty.title') : `${t('gauge.title')} ${EM_DASH}`}
            </span>
          )}
        </span>

        {/* One glyph, rotated by CSS when expanded — the icon set has no
            chevron-up, and a rotate reads as the same control turning rather
            than a different one appearing. */}
        <Icon name="chevron-down" size={12} className="bz-quota-chevron" />
      </button>

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
