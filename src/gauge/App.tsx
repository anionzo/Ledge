/**
 * The Gauge panel.
 *
 * A HUD, not a dashboard: one row per provider, no charts, no history. The
 * question it answers is "can I start another long task right now", and every
 * pixel that does not help answer it has been left out.
 *
 * Main polls on its own schedule and pushes `gauge:snapshot`; the refresh
 * button forces a cycle. The renderer never polls, because a panel that is
 * hidden behind a screen edge for hours should cost nothing while it is there.
 */
import { useCallback, useEffect, useMemo } from 'react'
import type { QuotaReading } from '../../shared/types/quota'
import {
  invoke,
  useLocale,
  usePanelOpen,
  usePush,
  useSettings,
  useThemeAttributes
} from '../lib/bridge'
import { useToastQueue } from '../lib/toasts'
import { formatClock } from '../lib/format'
import { t } from '../i18n'
import { Button, EmptyState, Panel, PanelHeader, ToastStack } from '../ui'
import { ProviderRow } from './components/ProviderRow'
import { ProviderSheet } from './components/ProviderSheet'
import { useGaugeStore } from './store'
import './styles/gauge.css'

export function App() {
  const { settings } = useSettings()
  useThemeAttributes(settings)
  useLocale(settings)

  const open = usePanelOpen()
  const toasts = useToastQueue()

  const snapshot = useGaugeStore((s) => s.snapshot)
  const refreshing = useGaugeStore((s) => s.refreshing)
  const detailId = useGaugeStore((s) => s.detailId)
  const setSnapshot = useGaugeStore((s) => s.setSnapshot)
  const setRefreshing = useGaugeStore((s) => s.setRefreshing)
  const setRefreshError = useGaugeStore((s) => s.setRefreshError)
  const openDetail = useGaugeStore((s) => s.openDetail)
  const closeDetail = useGaugeStore((s) => s.closeDetail)

  const side = settings?.gauge.side ?? 'right'
  const alertThreshold = settings?.gauge.alertThreshold ?? 80

  useEffect(() => {
    invoke('gauge:snapshot')
      .then(setSnapshot)
      .catch(() => setRefreshError(t('gauge.state.error')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  usePush('gauge:snapshot', setSnapshot)

  const refresh = useCallback(() => {
    setRefreshing(true)
    invoke('gauge:refresh')
      .then(setSnapshot)
      .catch(() => {
        setRefreshError(t('gauge.state.error'))
        toasts.push(t('gauge.state.error'), 'error')
      })
      .finally(() => setRefreshing(false))
  }, [setRefreshError, setRefreshing, setSnapshot, toasts])

  /**
   * Only providers the user has switched on.
   *
   * Main may still send a reading for a disabled provider — it has no reason
   * to prune, and pruning there would lose the retained value if the user
   * switches it back on — so the filter lives here, next to the setting.
   */
  const readings = useMemo(() => {
    const all = snapshot?.readings ?? []
    const enabled = settings?.gauge.enabledProviders
    if (!enabled) return all
    return all.filter((reading) => enabled[reading.providerId] !== false)
  }, [snapshot, settings])

  const detail = useMemo<QuotaReading | null>(
    () => readings.find((reading) => reading.providerId === detailId) ?? null,
    [readings, detailId]
  )

  return (
    <Panel
      side={side}
      open={open}
      label={t('gauge.title')}
      header={
        <PanelHeader
          title={t('gauge.title')}
          meta={snapshot ? formatClock(snapshot.lastUpdated) : undefined}
          action={
            <Button
              size="sm"
              icon="refresh"
              label={t('gauge.refresh')}
              onClick={refresh}
              disabled={refreshing}
              data-spinning={refreshing || undefined}
            />
          }
        />
      }
      overlay={
        <>
          <ProviderSheet
            reading={detail}
            side={side}
            alertThreshold={alertThreshold}
            onClose={closeDetail}
            onRefresh={refresh}
            refreshing={refreshing}
          />
          <ToastStack
            toasts={toasts.toasts}
            onDismiss={toasts.dismiss}
            dismissLabel={t('common.dismiss')}
            side={side}
          />
        </>
      }
    >
      {readings.length === 0 ? (
        <EmptyState
          icon="settings"
          title={t('gauge.empty.title')}
          body={t('gauge.empty.body')}
          action={
            <Button size="sm" onClick={() => invoke('panel:open', 'settings')}>
              {t('common.settings')}
            </Button>
          }
        />
      ) : (
        <div className="bz-provider-list">
          {readings.map((reading) => (
            <ProviderRow
              key={reading.providerId}
              reading={reading}
              side={side}
              onOpenDetail={openDetail}
              /* There is no per-provider read channel, so a retry is a full
                 refresh cycle. It is the honest thing to wire up rather than
                 a button that pretends to target one row. */
              onRetry={refresh}
              retrying={refreshing}
            />
          ))}
        </div>
      )}
    </Panel>
  )
}
