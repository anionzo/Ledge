/**
 * A prepaid balance, drawn where the ring would be.
 *
 * Some providers — DeepSeek, and the gateway relays — report money left rather
 * than a used-percentage. There is no denominator for "money left", so this is
 * emphatically not a progress bar: it shows the amount verbatim and, only when
 * the provider hands us both halves of the split, a slim two-segment meter of
 * granted vs topped-up credit. It never invents a fraction — with no split to
 * show, there is only the amount.
 *
 * Money is a string end to end. The segment widths are the one place a number
 * is parsed out of it, and that number only ever becomes a pixel width; the
 * figure the user reads is the untouched string, so it cannot lose a cent to
 * IEEE-754.
 */
import type { QuotaBalance } from '../../../shared/types/quota'
import { t } from '../../i18n'
import '../styles/balance-meter.css'

export interface BalanceMeterProps {
  balance: QuotaBalance
  /** Announced to assistive tech in place of the row's own ring label. */
  label: string
  /** `row` is the compact form beside a provider; `detail` is the sheet. */
  size?: 'row' | 'detail'
}

/** Parse a decimal money string for layout only. Never for display. */
function width(value: string | null): number | null {
  if (value === null) return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function BalanceMeter({ balance, label, size = 'row' }: BalanceMeterProps) {
  const granted = width(balance.grantedBalance)
  const topup = width(balance.toppedUpBalance)
  const denom = (granted ?? 0) + (topup ?? 0)
  // A split is only real when both halves are known and add up to something.
  const split = granted !== null && topup !== null && denom > 0

  return (
    <div
      className="bz-balance"
      data-size={size}
      data-critical={balance.isAvailable ? undefined : true}
      role="img"
      aria-label={label}
    >
      <span className="bz-balance-amount bz-num" aria-hidden="true">
        {balance.currency === 'credits' ? (
          // Credits are a count, not money: read "1000 credits", unit after.
          <>
            {balance.totalBalance}
            <span className="bz-balance-currency"> {t('gauge.balance.credits')}</span>
          </>
        ) : (
          <>
            <span className="bz-balance-currency">{balance.currency}</span>
            {balance.totalBalance}
          </>
        )}
      </span>

      {split && (
        <div className="bz-balance-meter" aria-hidden="true">
          <span
            className="bz-balance-seg"
            data-part="granted"
            style={{ flexGrow: (granted as number) / denom }}
            title={t('gauge.balance.granted')}
          />
          <span
            className="bz-balance-seg"
            data-part="topup"
            style={{ flexGrow: (topup as number) / denom }}
            title={t('gauge.balance.topup')}
          />
        </div>
      )}
    </div>
  )
}
