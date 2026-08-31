/**
 * The hub.
 *
 * One right-docked frame that carries both features the two source apps used to
 * split across two edges: the quota HUD as a collapsible strip at the top, the
 * clipboard shelf filling everything below it. Composition only — the shelf's
 * list, search, selection and preview and the gauge's provider rows and detail
 * sheet are imported wholesale, so this file wires data and owns exactly one new
 * thing: when the panel opens and closes.
 *
 * The old per-feature renderers started with `usePanelOpen(true)`, which painted
 * the full glass panel over the desktop from the first frame. The hub starts
 * CLOSED and only opens on a hotkey/tray toggle or an edge-hover dwell, so a
 * collapsed Ledge leaves the desktop entirely alone.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardItem, DragRequest } from '../../shared/types/clipboard'
import {
  invoke,
  useLocale,
  usePanelOpen,
  usePush,
  useSettings,
  useThemeAttributes
} from '../lib/bridge'
import { useToastQueue } from '../lib/toasts'
import { useVirtualWindow } from '../lib/virtual'
import { t } from '../i18n'
import { Button, EmptyState, Panel, PanelHeader, ToastStack } from '../ui'
import { ItemList } from '../shelf/components/ItemList'
import { PreviewSheet } from '../shelf/components/PreviewSheet'
import { SearchBar } from '../shelf/components/SearchBar'
import { SelectionBar } from '../shelf/components/SelectionBar'
import { estimateCardHeight, matches } from '../shelf/describe'
import { useShelfStore } from '../shelf/store'
import { ProviderSheet } from '../gauge/components/ProviderSheet'
import { useGaugeStore } from '../gauge/store'
import { QuotaStrip } from './components/QuotaStrip'
import './styles/hub.css'

/** How long the cursor must dwell in the edge trigger before the hub opens. */
const OPEN_DWELL_MS = 120

export function App() {
  const { settings } = useSettings()
  useThemeAttributes(settings)
  useLocale(settings)

  // The hub is born closed — this is the fix for the panel covering the desktop.
  const open = usePanelOpen(false)
  const toasts = useToastQueue()

  const side = settings?.shelf.side ?? 'right'
  const alertThreshold = settings?.gauge.alertThreshold ?? 80

  // ── Open / close ───────────────────────────────────────────────────────────
  //
  // While the hub is collapsed under the click-through strategy it cannot
  // receive DOM mouse events (the window ignores the mouse), so the open trigger
  // has to come from main's cursor poll, not from `onMouseEnter`. Once open the
  // window takes the mouse back, so closing on `onMouseLeave` works normally.
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearDwell = useCallback(() => {
    if (dwellTimer.current !== null) {
      clearTimeout(dwellTimer.current)
      dwellTimer.current = null
    }
  }, [])

  const requestOpen = useCallback(() => {
    void invoke('panel:set-interactive', true).catch(() => {})
  }, [])

  const requestClose = useCallback(() => {
    clearDwell()
    void invoke('panel:set-interactive', false).catch(() => {})
  }, [clearDwell])

  usePush('panel:cursor-edge', (event) => {
    if (!event.inTriggerZone) {
      clearDwell()
      return
    }
    if (open || dwellTimer.current !== null) return
    dwellTimer.current = setTimeout(() => {
      dwellTimer.current = null
      requestOpen()
    }, OPEN_DWELL_MS)
  })

  useEffect(() => clearDwell, [clearDwell])

  // ── Clipboard (shelf) ──────────────────────────────────────────────────────
  const items = useShelfStore((s) => s.items)
  const query = useShelfStore((s) => s.query)
  const selection = useShelfStore((s) => s.selection)
  const selecting = useShelfStore((s) => s.selecting)
  const previewId = useShelfStore((s) => s.previewId)
  const setItems = useShelfStore((s) => s.setItems)
  const setQuery = useShelfStore((s) => s.setQuery)
  const toggleSelection = useShelfStore((s) => s.toggleSelection)
  const selectAll = useShelfStore((s) => s.selectAll)
  const clearSelection = useShelfStore((s) => s.clearSelection)
  const openPreview = useShelfStore((s) => s.openPreview)
  const closePreview = useShelfStore((s) => s.closePreview)

  useEffect(() => {
    invoke('shelf:list')
      .then(setItems)
      .catch(() => toasts.push(t('common.unknown'), 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  usePush('shelf:items', setItems)

  const filtered = useMemo(
    () => (query.trim() ? items.filter((item) => matches(item, query)) : items),
    [items, query]
  )

  const estimateHeight = useCallback(
    (index: number) => {
      const item = filtered[index]
      return item ? estimateCardHeight(item) : 54
    },
    [filtered]
  )

  const virtual = useVirtualWindow({ count: filtered.length, estimateHeight })

  const runCopy = useCallback(
    (request: DragRequest) => {
      invoke('shelf:copy', request)
        .then((ok) =>
          toasts.push(ok ? t('shelf.toast.copied') : t('shelf.toast.copy_failed'), ok ? 'info' : 'error')
        )
        .catch(() => toasts.push(t('shelf.toast.copy_failed'), 'error'))
    },
    [toasts]
  )

  const runPaste = useCallback(
    (request: DragRequest) => {
      invoke('shelf:paste', request).catch(() =>
        toasts.push(t('shelf.toast.copy_failed'), 'error')
      )
    },
    [toasts]
  )

  const onCopyItem = useCallback(
    (item: ClipboardItem) => runCopy({ itemId: item.id, memberIndex: null }),
    [runCopy]
  )
  const onPasteItem = useCallback(
    (item: ClipboardItem) => runPaste({ itemId: item.id, memberIndex: null }),
    [runPaste]
  )

  const onTogglePin = useCallback(
    (item: ClipboardItem) => {
      invoke('shelf:pin', item.id, !item.pinned)
        .then(setItems)
        .catch(() => toasts.push(t('common.unknown'), 'error'))
    },
    [setItems, toasts]
  )

  const onDelete = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return
      invoke('shelf:delete', ids)
        .then((next) => {
          setItems(next)
          clearSelection()
          toasts.push(t('shelf.toast.deleted', { n: ids.length }))
        })
        .catch(() => toasts.push(t('common.unknown'), 'error'))
    },
    [clearSelection, setItems, toasts]
  )

  const onCopySelection = useCallback(() => {
    const last = selection[selection.length - 1]
    if (last) runCopy({ itemId: last, memberIndex: null })
  }, [runCopy, selection])

  const onClearUnpinned = useCallback(() => {
    invoke('shelf:clear', true)
      .then(setItems)
      .catch(() => toasts.push(t('common.unknown'), 'error'))
  }, [setItems, toasts])

  const previewItem = useMemo(
    () => items.find((item) => item.id === previewId) ?? null,
    [items, previewId]
  )

  const focusList = useCallback(() => {
    const first = document.querySelector<HTMLElement>('.bz-item[tabindex="0"]')
    first?.focus()
  }, [])

  const isFiltered = query.trim().length > 0

  // ── Quota (gauge) ──────────────────────────────────────────────────────────
  const snapshot = useGaugeStore((s) => s.snapshot)
  const refreshing = useGaugeStore((s) => s.refreshing)
  const detailId = useGaugeStore((s) => s.detailId)
  const setSnapshot = useGaugeStore((s) => s.setSnapshot)
  const setRefreshing = useGaugeStore((s) => s.setRefreshing)
  const setRefreshError = useGaugeStore((s) => s.setRefreshError)
  const openDetail = useGaugeStore((s) => s.openDetail)
  const closeDetail = useGaugeStore((s) => s.closeDetail)

  const [quotaExpanded, setQuotaExpanded] = useState(false)

  useEffect(() => {
    invoke('gauge:snapshot')
      .then(setSnapshot)
      .catch(() => setRefreshError(t('gauge.state.error')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  usePush('gauge:snapshot', setSnapshot)

  const refreshQuota = useCallback(() => {
    setRefreshing(true)
    invoke('gauge:refresh')
      .then(setSnapshot)
      .catch(() => {
        setRefreshError(t('gauge.state.error'))
        toasts.push(t('gauge.state.error'), 'error')
      })
      .finally(() => setRefreshing(false))
  }, [setRefreshError, setRefreshing, setSnapshot, toasts])

  const readings = useMemo(() => {
    const all = snapshot?.readings ?? []
    const enabled = settings?.gauge.enabledProviders
    if (!enabled) return all
    return all.filter((reading) => enabled[reading.providerId] !== false)
  }, [snapshot, settings])

  const detail = useMemo(
    () => readings.find((reading) => reading.providerId === detailId) ?? null,
    [readings, detailId]
  )

  return (
    // The wrapper, not the Panel, catches the close gesture: `Panel` is a shared
    // primitive with no mouse-leave prop, and moving the cursor off the whole
    // frame is what should collapse the hub.
    <div className="bz-hub-root" onMouseLeave={requestClose}>
    <Panel
      side={side}
      open={open}
      className="bz-hub"
      label={t('app.name')}
      bodyRef={virtual.scrollRef}
      header={
        <PanelHeader
          title={t('app.name')}
          meta={items.length > 0 ? String(items.length) : undefined}
          action={
            <Button
              size="sm"
              icon="settings"
              label={t('common.settings')}
              onClick={() => void invoke('panel:open', 'settings')}
            />
          }
        />
      }
      toolbar={
        <>
          <QuotaStrip
            readings={readings}
            side={side}
            expanded={quotaExpanded}
            onToggle={() => setQuotaExpanded((v) => !v)}
            onOpenDetail={openDetail}
            onRetry={refreshQuota}
            retrying={refreshing}
          />
          <SearchBar value={query} onChange={setQuery} onEnterList={focusList} autoFocus={open} />
        </>
      }
      footer={
        selection.length > 0 ? (
          <SelectionBar
            count={selection.length}
            total={filtered.length}
            onSelectAll={() => selectAll(filtered.map((item) => item.id))}
            onClear={clearSelection}
            onCopy={onCopySelection}
            onDelete={() => onDelete(selection)}
          />
        ) : undefined
      }
      overlay={
        <>
          <PreviewSheet
            item={previewItem}
            side={side}
            onClose={closePreview}
            onCopy={runCopy}
            onPaste={runPaste}
            onTogglePin={onTogglePin}
            onDelete={onDelete}
            onError={(message) => toasts.push(message, 'error')}
          />
          <ProviderSheet
            reading={detail}
            side={side}
            alertThreshold={alertThreshold}
            onClose={closeDetail}
            onRefresh={refreshQuota}
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
      {filtered.length === 0 ? (
        <EmptyState
          icon={isFiltered ? 'search' : 'stack'}
          title={isFiltered ? t('shelf.empty.filtered.title') : t('shelf.empty.title')}
          body={isFiltered ? t('shelf.empty.filtered.body') : t('shelf.empty.body')}
          action={
            isFiltered ? (
              <Button size="sm" onClick={() => setQuery('')}>
                {t('shelf.search.clear')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ItemList
          items={filtered}
          side={side}
          selection={selection}
          selecting={selecting}
          virtual={virtual}
          onCopy={onCopyItem}
          onPaste={onPasteItem}
          onToggleSelection={toggleSelection}
          onTogglePin={onTogglePin}
          onDelete={onDelete}
          onPreview={openPreview}
        />
      )}
    </Panel>
    </div>
  )
}
