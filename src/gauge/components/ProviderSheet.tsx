/**
 * Provider detail.
 *
 * The row shows one window — whichever is closest to exhaustion. This shows
 * both, plus when the reading was taken, plus whatever the provider actually
 * said when it failed. It is the answer to "why does that ring say that".
 *
 * Same `Sheet` primitive as the shelf's preview, mirrored the other way.
 */
import { severityFor, type QuotaReading, type QuotaWindow } from '../../../shared/types/quota'
import type { PanelSide } from '../../../shared/types/settings'
import { modelPrice } from '../../../shared/pricing'
import { useCoarseNow } from '../../lib/clock'
import { EM_DASH, formatClock, humaniseDuration, msUntil } from '../../lib/format'
import { t } from '../../i18n'
import { Button, Chip, Ring, Sheet } from '../../ui'
import { hasNumber, isBalance, presentState, ringLabel } from '../readings'
import { BalanceMeter } from './BalanceMeter'
import '../styles/provider-sheet.css'

export interface ProviderSheetProps {
  reading: QuotaReading | null
  side: PanelSide
  /**
   * The user's critical threshold. Each window is banded on its own
   * percentage rather than inheriting the row's severity: a session at 30%
   * and a weekly at 95% are not the same colour, and pretending otherwise is
   * the kind of small lie this panel exists to avoid.
   */
  alertThreshold: number
  onClose: () => void
  onRefresh: () => void
  refreshing: boolean
}

export function ProviderSheet({
  reading,
  side,
  alertThreshold,
  onClose,
  onRefresh,
  refreshing
}: ProviderSheetProps) {
  return (
    <Sheet
      open={reading !== null}
      onClose={onClose}
      side={side}
      title={reading?.displayName ?? t('gauge.title')}
      closeLabel={t('common.back')}
      footer={
        <>
          <Button size="sm" icon="refresh" onClick={onRefresh} disabled={refreshing}>
            {t('common.refresh')}
          </Button>
          <span className="bz-row-fill" />
          {reading && (
            <span className="bz-provider-observed bz-num">
              {t('gauge.updated', { time: formatClock(reading.observedAt) })}
            </span>
          )}
        </>
      }
    >
      {reading && <SheetBody reading={reading} alertThreshold={alertThreshold} />}
    </Sheet>
  )
}

function SheetBody({
  reading,
  alertThreshold
}: {
  reading: QuotaReading
  alertThreshold: number
}) {
  const numeric = hasNumber(reading)
  const balance = isBalance(reading)
  const status = reading.state === 'ok' ? null : presentState(reading.state)

  return (
    <div className="bz-detail">
      <div className="bz-detail-head">
        {balance && reading.balance ? (
          <BalanceMeter balance={reading.balance} label={ringLabel(reading)} size="detail" />
        ) : (
          <Ring
            percent={numeric ? reading.ringPercent : null}
            severity={reading.severity}
            stale={reading.stale}
            size={64}
            label={ringLabel(reading)}
          />
        )}
        <div className="bz-detail-identity">
          <p className="bz-detail-name">{reading.displayName}</p>
          {reading.modelName ? (
            <p className="bz-detail-model">{reading.modelName}</p>
          ) : (
            <p className="bz-detail-model">{EM_DASH}</p>
          )}
          {reading.stale && (
            <Chip icon="info" tone="warn">
              {t('gauge.stale')}
            </Chip>
          )}
        </div>
      </div>

      {status && (
        <div className="bz-detail-status" data-tone={status.muted ? 'muted' : 'live'}>
          <p className="bz-detail-status-title">{status.title}</p>
          <p className="bz-detail-status-body">{status.body}</p>
          {/* The provider's own message, verbatim. It is the only text on this
              surface we did not write, so it is set apart as a quotation. */}
          {reading.message && <p className="bz-detail-message">{reading.message}</p>}
        </div>
      )}

      {reading.stale && (
        <p className="bz-detail-note">
          {t('gauge.stale.explain', { time: formatClock(reading.observedAt) })}
        </p>
      )}

      <div className="bz-detail-windows">
        <WindowRow
          label={t('gauge.window.session')}
          window={reading.session}
          alertThreshold={alertThreshold}
        />
        <WindowRow
          label={t('gauge.window.weekly')}
          window={reading.weekly}
          alertThreshold={alertThreshold}
        />
      </div>

      <CostLine reading={reading} />
      <PriceReference modelName={reading.modelName} />
    </div>
  )
}

/** Fixed-point money for a computed spend delta. Null renders an em dash. */
function formatAmount(value: number | null): string {
  return value === null || !Number.isFinite(value) ? EM_DASH : value.toFixed(2)
}

/**
 * Real spend, kept secondary to the quota/balance above it.
 *
 * Metered spend is a prepaid balance falling over time — the only cost Ledge
 * can prove, since it never sees a single token. A flat subscription has no
 * per-use figure, so it says so rather than showing a number. Nothing is drawn
 * when the reading carries no cost at all (history too thin, or not a balance).
 */
function CostLine({ reading }: { reading: QuotaReading }) {
  const cost = reading.cost
  if (!cost) return null

  if (!cost.meteredByToken) {
    return <p className="bz-detail-cost">{t('gauge.cost.subscription')}</p>
  }

  return (
    <p className="bz-detail-cost">
      <span className="bz-num">
        {t('gauge.cost.metered', {
          currency: cost.currency,
          today: formatAmount(cost.todayAmount),
          month: formatAmount(cost.monthAmount)
        })}
      </span>
    </p>
  )
}

/**
 * A one-line list-price reference for the configured model, when it is a known
 * Anthropic model. Purely informational — no tokens are counted, so this is
 * never multiplied into a spend. Unknown models (every non-Anthropic one) show
 * nothing rather than a wrong number.
 */
function PriceReference({ modelName }: { modelName: string | null }) {
  if (!modelName) return null
  const price = modelPrice(modelName)
  if (!price) return null

  return (
    <p className="bz-detail-price bz-num">
      {t('gauge.cost.price_ref', {
        model: price.model,
        input: price.inputPerMtok,
        output: price.outputPerMtok
      })}
    </p>
  )
}

/**
 * One rate-limit window.
 *
 * The bar is a second reading of the same number the ring gives, at a
 * precision the ring cannot show — it is easy to compare two bars and hard to
 * compare two arcs. A null percentage draws an empty track and an em dash, for
 * the same reason the ring does.
 */
function WindowRow({
  label,
  window: quotaWindow,
  alertThreshold
}: {
  label: string
  window: QuotaWindow | null
  alertThreshold: number
}) {
  const now = useCoarseNow()
  if (!quotaWindow) return null

  // Narrowed once, so nothing below has to re-prove that the number is real.
  const raw = quotaWindow.usedPercent
  const value = raw !== null && Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : null
  const remaining = msUntil(quotaWindow.resetsAt, now)

  return (
    <div
      className="bz-window"
      data-severity={value === null ? undefined : severityFor(value, alertThreshold)}
    >
      <div className="bz-window-head bz-row">
        {/* The provider's own label wins when it has one — "5-hour session"
            says more than our generic "Session". */}
        <span className="bz-window-label bz-row-fill">{quotaWindow.label || label}</span>
        <span className="bz-num bz-window-value">
          {value === null ? EM_DASH : `${Math.round(value)}%`}
        </span>
      </div>

      <div className="bz-window-track" data-unknown={value === null ? true : undefined}>
        {value !== null && <div className="bz-window-fill" style={{ width: `${value}%` }} />}
      </div>

      <p className="bz-window-reset">
        {remaining === null
          ? t('gauge.reset_unknown')
          : remaining <= 0
            ? t('gauge.resets_now')
            : t('gauge.resets_in', { duration: humaniseDuration(remaining) })}
      </p>
    </div>
  )
}
