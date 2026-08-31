/**
 * One provider.
 *
 * The row has a fixed anatomy — ring on the screen-edge side, then the
 * provider's identity, then one line of status — and every `QuotaState` fills
 * it differently. What never changes is that the ring shows an em dash rather
 * than a number whenever there is no number, and the third line says why.
 *
 * The whole row is a button: it opens the detail sheet. A quota that is 94%
 * used prompts exactly one question — of what, and when does it reset — and
 * that answer is one press away rather than behind a hover-revealed chevron.
 */
import { memo } from 'react'
import type { QuotaReading } from '../../../shared/types/quota'
import type { PanelSide } from '../../../shared/types/settings'
import { useCoarseNow } from '../../lib/clock'
import { formatClock, humaniseDuration, msUntil } from '../../lib/format'
import { t } from '../../i18n'
import { Button, Chip, Icon, Ring } from '../../ui'
import { hasNumber, isBalance, presentState, ringLabel, ringWindow } from '../readings'
import { ProviderBrandIcon } from './ProviderBrandIcon'
import { BalanceMeter } from './BalanceMeter'
import '../styles/provider-row.css'

export interface ProviderRowProps {
  reading: QuotaReading
  side: PanelSide
  onOpenDetail: (id: string) => void
  /** Re-reads this one provider. Only offered where retrying can help. */
  onRetry: () => void
  retrying: boolean
}

function ProviderRowImpl({ reading, side, onOpenDetail, onRetry, retrying }: ProviderRowProps) {
  const numeric = hasNumber(reading)
  const balance = isBalance(reading)
  const status = reading.state === 'ok' ? null : presentState(reading.state)

  return (
    <div
      className="bz-provider"
      data-state={reading.state}
      data-stale={reading.stale || undefined}
      data-muted={status?.muted || undefined}
    >
      <button
        type="button"
        className="bz-provider-main bz-row"
        onClick={() => onOpenDetail(reading.providerId)}
        aria-label={reading.displayName}
      >
        {balance && reading.balance ? (
          <BalanceMeter balance={reading.balance} label={ringLabel(reading)} />
        ) : (
          <Ring
            percent={numeric ? reading.ringPercent : null}
            severity={reading.severity}
            stale={reading.stale}
            label={ringLabel(reading)}
          />
        )}

        <span className="bz-provider-body bz-row-fill">
          <span className="bz-provider-name bz-truncate">
            {/* Brand mark carried over from agent-notch, tinted by currentColor
                so it reads as identity, not as a coloured status signal. */}
            <ProviderBrandIcon id={reading.providerId} className="bz-provider-glyph" />
            {reading.displayName}
          </span>
          {/* Model is the second most useful fact on the row: a quota reading
              means something different on Opus than on Haiku. */}
          {reading.modelName && (
            <span className="bz-provider-model bz-truncate">{reading.modelName}</span>
          )}
          <StatusLine reading={reading} />
        </span>

        <Icon
          name={side === 'left' ? 'chevron-right' : 'chevron-left'}
          size={12}
          className="bz-provider-more"
        />
      </button>

      {/* Retry sits outside the row button so it is its own control rather
          than a nested one, which is invalid and unusable by keyboard. */}
      {status?.retryable && (
        <div className="bz-provider-recover bz-row">
          <Button size="sm" icon="refresh" onClick={onRetry} disabled={retrying}>
            {t('common.retry')}
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * The third line.
 *
 * Exactly one of three things: a countdown when there is a live reading, a
 * "last known" marker when the reading is retained, or the reason there is no
 * reading at all.
 */
function StatusLine({ reading }: { reading: QuotaReading }) {
  const now = useCoarseNow()

  if (reading.state !== 'ok') {
    const status = presentState(reading.state)
    return (
      <span className="bz-provider-status bz-row">
        <Icon name={status.icon} size={11} />
        <span className="bz-truncate">{status.title}</span>
        {/* The provider's own words, when it gave us any, are more useful than
            our generic sentence — an error message naming an expired token
            tells the user what to do. */}
        {reading.message && (
          <span className="bz-provider-message bz-truncate" title={reading.message}>
            {reading.message}
          </span>
        )}
      </span>
    )
  }

  // Balance-shaped readings have no reset countdown — money does not roll over
  // on a clock — so the third line speaks to whether there is enough to spend.
  if (isBalance(reading) && reading.balance) {
    const available = reading.balance.isAvailable
    return (
      <span
        className="bz-provider-status bz-row"
        data-balance={available ? undefined : 'critical'}
      >
        <Icon name={available ? 'check' : 'alert'} size={11} />
        <span className="bz-truncate">
          {available ? t('gauge.balance.available') : t('gauge.balance.unavailable')}
        </span>
      </span>
    )
  }

  const active = ringWindow(reading)
  const remaining = msUntil(active?.resetsAt ?? null, now)

  return (
    <span className="bz-provider-status bz-row">
      {reading.stale && (
        <Chip icon="info" tone="warn">
          {t('gauge.stale')}
        </Chip>
      )}
      {active && <span className="bz-provider-window">{active.label}</span>}
      <span className="bz-provider-reset bz-truncate">
        {remaining === null
          ? t('gauge.reset_unknown')
          : remaining <= 0
            ? t('gauge.resets_now')
            : t('gauge.resets_in', { duration: humaniseDuration(remaining) })}
      </span>
      {reading.stale && (
        <span className="bz-sr">
          {t('gauge.stale.explain', { time: formatClock(reading.observedAt) })}
        </span>
      )}
    </span>
  )
}

export const ProviderRow = memo(ProviderRowImpl)
