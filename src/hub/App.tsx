/**
 * The hub.
 *
 * One right-docked frame that carries both features the two source apps used to
 * split across two edges: the quota HUD as a collapsible strip at the top, the
 * clipboard shelf filling everything below it. Composition only — the shelf's
 * list, search, filters, selection and preview and the gauge's provider rows
 * and detail sheet are imported wholesale, so this file wires data and owns the
 * few things that are genuinely hub-level: when the panel opens and closes, and
 * how the behavioural settings (hover, incognito, preview, text scale, the copy
 * indicator) are applied across the whole surface.
 *
 * The item list is never predicted. Every mutating call returns the new array
 * and `shelf:items` pushes it when the OS clipboard changes underneath us, so
 * there is exactly one source of truth and no reconciliation to get wrong.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import type { ClipboardItem, DragRequest } from '../../shared/types/clipboard'
import type { ClearQuery } from '../../shared/ipc'
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
import {
  playButtonClickSound,
  playCardExpandSound,
  playDeleteSound,
  playDialTickSound,
  playToggleSound,
  setSoundEnabled
} from '../lib/soundEffects'
import { t } from '../i18n'
import { Button, Chip, EmptyState, Panel, PanelHeader, ToastStack } from '../ui'
import { ClearMenu } from '../shelf/components/ClearMenu'
import { CopyIndicatorCurve } from '../shelf/components/CopyIndicatorCurve'
import { FilterTabs } from '../shelf/components/FilterTabs'
import { ItemList } from '../shelf/components/ItemList'
import { Onboarding } from '../shelf/components/Onboarding'
import { PreviewSheet } from '../shelf/components/PreviewSheet'
import { SearchBar } from '../shelf/components/SearchBar'
import { SelectionBar } from '../shelf/components/SelectionBar'
import { buildDropItems, dropHasContent } from '../shelf/dragIn'
import { estimateCardHeight, matches, matchesFilter } from '../shelf/describe'
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

  // Behavioural settings, with defaults for the pre-bootstrap frame.
  const hoverActivation = settings?.shelf.hoverActivation ?? true
  const incognito = settings?.shelf.incognito ?? false
  const previewEnabled = settings?.shelf.previewEnabled ?? true
  const textScale = settings?.shelf.textScale ?? 'md'
  const indicatorStyle = settings?.shelf.indicatorStyle ?? 'curve'
  const reduceMotion = settings?.reduceMotion ?? false

  // The synth mirrors the persisted preference, and reduced motion silences it
  // along with the animations — a click track under a still UI is its own kind
  // of motion.
  useEffect(() => {
    if (!settings) return
    setSoundEnabled(settings.shelf.playSounds && !settings.reduceMotion)
  }, [settings])

  // ── Open / close ───────────────────────────────────────────────────────────
  //
  // While the hub is collapsed under the click-through strategy it cannot
  // receive DOM mouse events (the window ignores the mouse), so the open trigger
  // has to come from main's cursor poll, not from `onMouseEnter`. Once open the
  // window takes the mouse back, so closing on `onMouseLeave` works normally.
  /**
   * The proximity beacon: a hairline that flashes down the docked edge when the
   * cursor pressed that edge but missed the trigger strip — "it opens here, not
   * where you are". It runs the panel's own height rather than tracking the
   * cursor, because a miss means the cursor is usually outside this window
   * entirely (the frame is only `heightRatio` of the work area) and a marker
   * drawn at its Y would land off-viewport. Keyed so a second approach restarts
   * the animation instead of being swallowed by the one still running.
   */
  const [beacon, setBeacon] = useState<number | null>(null)
  const beaconSeq = useRef(0)
  const wasEdgeMiss = useRef(false)

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
    // Beacon on the rising edge only. Main keeps emitting while the cursor
    // rests near the edge, and a beacon that re-fired on each of those would
    // be a strobe rather than a hint. Skipped under reduced motion, and when
    // hover-to-open is off there is nothing for it to point at.
    const missed = event.edgeMiss && !wasEdgeMiss.current
    wasEdgeMiss.current = event.edgeMiss
    if (missed && !open && hoverActivation && !reduceMotion) {
      beaconSeq.current += 1
      setBeacon(beaconSeq.current)
    }

    // Hover-to-open is a setting. When it is off the shelf only opens on the
    // hotkey/tray toggle, both of which come through `panel:toggle` and are
    // unaffected by this handler.
    if (!hoverActivation) {
      clearDwell()
      return
    }
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

  // Open/close earns a switch-snap. Fires only on a real transition, never on
  // the initial closed mount.
  const prevOpen = useRef(open)
  useEffect(() => {
    if (prevOpen.current !== open) {
      playToggleSound(open)
      prevOpen.current = open
    }
  }, [open])

  // ── Clipboard (shelf) ──────────────────────────────────────────────────────
  const items = useShelfStore((s) => s.items)
  const query = useShelfStore((s) => s.query)
  const filter = useShelfStore((s) => s.filter)
  const selection = useShelfStore((s) => s.selection)
  const selecting = useShelfStore((s) => s.selecting)
  const previewId = useShelfStore((s) => s.previewId)
  const setItems = useShelfStore((s) => s.setItems)
  const setQuery = useShelfStore((s) => s.setQuery)
  const setFilter = useShelfStore((s) => s.setFilter)
  const toggleSelection = useShelfStore((s) => s.toggleSelection)
  const selectAll = useShelfStore((s) => s.selectAll)
  const clearSelection = useShelfStore((s) => s.clearSelection)
  const openPreview = useShelfStore((s) => s.openPreview)
  const closePreview = useShelfStore((s) => s.closePreview)

  // Capture detection for the copy indicator: a growth in the list means a new
  // clip landed (a re-copy only bumps an existing entry, so the count holds).
  const prevCount = useRef<number | null>(null)
  const [flareKey, setFlareKey] = useState(0)

  useEffect(() => {
    invoke('shelf:list')
      .then((list) => {
        setItems(list)
        prevCount.current = list.length
      })
      .catch(() => toasts.push(t('common.unknown'), 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  usePush('shelf:items', (next) => {
    const grew = prevCount.current !== null && next.length > prevCount.current
    prevCount.current = next.length
    setItems(next)
    if (grew) {
      // The flare is bumped unconditionally; the indicator component only
      // mounts when the style is not 'off', so 'off' shows nothing while the
      // capture tick still plays.
      setFlareKey((k) => k + 1)
      playDialTickSound()
    }
  })

  const filtered = useMemo(() => {
    const q = query.trim()
    return items.filter(
      (item) => matchesFilter(item, filter) && (q ? matches(item, q) : true)
    )
  }, [items, query, filter])

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
        .then((ok) => {
          if (ok) playButtonClickSound()
          toasts.push(ok ? t('shelf.toast.copied') : t('shelf.toast.copy_failed'), ok ? 'info' : 'error')
        })
        .catch(() => toasts.push(t('shelf.toast.copy_failed'), 'error'))
    },
    [toasts]
  )

  const runPaste = useCallback(
    (request: DragRequest) => {
      playButtonClickSound()
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
          prevCount.current = next.length
          setItems(next)
          clearSelection()
          playDeleteSound()
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

  const onClearQuery = useCallback(
    (query: ClearQuery) => {
      invoke('shelf:clear-query', query)
        .then((next) => {
          prevCount.current = next.length
          setItems(next)
          playDeleteSound()
        })
        .catch(() => toasts.push(t('common.unknown'), 'error'))
    },
    [setItems, toasts]
  )

  /**
   * Gather the selection into one stack.
   *
   * One call, not one per pair: main forms the whole stack or none of it, so a
   * selection that cannot fit never leaves half a stack behind. The reason a
   * refusal carries is worth showing — "that stack is full" and "only images
   * and files can be stacked" send the user to different fixes.
   */
  // Only images, files and existing stacks can join a stack — the store
  // refuses the rest, so the toolbar should not offer it. Counted here because
  // this is the side that knows each selected item's kind.
  const stackableSelectionCount = useMemo(() => {
    const chosen = new Set(selection)
    return items.filter(
      (item) =>
        chosen.has(item.id) &&
        (item.data.kind === 'image' || item.data.kind === 'file' || item.data.kind === 'stack')
    ).length
  }, [items, selection])

  const onMergeSelection = useCallback(() => {
    invoke('shelf:merge-many', selection)
      .then((result) => {
        if (result.ok) {
          clearSelection()
          toasts.push(t('shelf.toast.merged'))
          return
        }
        toasts.push(
          result.reason === 'stack-full'
            ? t('shelf.toast.stack_full')
            : t('shelf.toast.merge_incompatible'),
          'error'
        )
      })
      .catch(() => toasts.push(t('common.unknown'), 'error'))
  }, [selection, clearSelection, toasts])

  const onMerge = useCallback(
    (sourceId: string, targetId: string) => {
      invoke('shelf:merge', sourceId, targetId)
        .then((result) => {
          if (result.ok) {
            playCardExpandSound(true)
            toasts.push(t('shelf.toast.merged'))
          } else if (result.reason === 'stack-full') {
            toasts.push(t('shelf.toast.stack_full'), 'error')
          }
          return invoke('shelf:list')
        })
        .then((next) => {
          prevCount.current = next.length
          setItems(next)
        })
        .catch(() => toasts.push(t('common.unknown'), 'error'))
    },
    [setItems, toasts]
  )

  // ── Drag-in from the OS ──────────────────────────────────────────────────
  const [dropActive, setDropActive] = useState(false)

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    // A card dragged inside the shelf is a native drag whose id is parked in
    // the store; that is a merge or a no-op, never an add, so leave it to the
    // cards and never light the OS drop hint for it.
    if (useShelfStore.getState().draggingId !== null) return
    if (!dropHasContent(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDropActive(true)
  }, [])

  const onDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    const related = event.relatedTarget as Node | null
    if (related && event.currentTarget.contains(related)) return
    setDropActive(false)
  }, [])

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      // An internal card drag dropped on empty shelf space must not re-add the
      // card as if it were an external file.
      if (useShelfStore.getState().draggingId !== null) return
      if (!dropHasContent(event.dataTransfer)) return
      event.preventDefault()
      setDropActive(false)
      const payloads = buildDropItems(event.dataTransfer)
      if (payloads.length === 0) return
      // Added one after another; each returns the fresh list, so the last wins.
      let chain: Promise<ClipboardItem[]> | null = null
      for (const payload of payloads) {
        chain = chain ? chain.then(() => invoke('shelf:add', payload)) : invoke('shelf:add', payload)
      }
      chain
        ?.then((next) => {
          prevCount.current = next.length
          setItems(next)
          playDialTickSound()
          toasts.push(t('shelf.toast.added', { n: payloads.length }))
        })
        .catch(() => toasts.push(t('common.unknown'), 'error'))
    },
    [setItems, toasts]
  )

  const previewItem = useMemo(
    () => (previewEnabled ? (items.find((item) => item.id === previewId) ?? null) : null),
    [items, previewId, previewEnabled]
  )

  const focusList = useCallback(() => {
    const first = document.querySelector<HTMLElement>('.bz-item[tabindex="0"]')
    first?.focus()
  }, [])

  const isFiltered = query.trim().length > 0 || filter !== 'all'

  // What "this view" means to the clear menu: the same filtered+searched list
  // the virtual window scrolls, minus anything pinned. When there is no
  // filter and no search that view is just the whole shelf, so `null` is
  // passed instead of an id list — main can then do the O(1) whole-store
  // sweep rather than walking a list that would be every unpinned id anyway.
  const visibleUnpinnedIds = useMemo(
    () => (isFiltered ? filtered.filter((item) => !item.pinned).map((item) => item.id) : null),
    [isFiltered, filtered]
  )

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

  const headerMeta =
    incognito || items.length > 0 ? (
      <span className="bz-hub-meta bz-row">
        {incognito && (
          <Chip icon="lock" className="bz-hub-incognito">
            {t('shelf.incognito.badge')}
          </Chip>
        )}
        {items.length > 0 && <span className="bz-num">{items.length}</span>}
      </span>
    ) : undefined

  return (
    // The wrapper, not the Panel, catches the close gesture and the OS drop:
    // `Panel` is a shared primitive with no such props, and moving the cursor
    // off the whole frame is what should collapse the hub. `data-text-scale`
    // rescopes the type tokens (see hub.css) so the whole surface scales.
    <div
      className="bz-hub-root"
      data-text-scale={textScale}
      data-drop-active={dropActive || undefined}
      onMouseLeave={requestClose}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
    {/* Outside <Panel> on purpose: the panel translates off-edge when closed,
        and the beacon has to stay at the edge to point back at it. */}
    {beacon !== null && (
      <span
        key={beacon}
        className="bz-edge-beacon"
        data-side={side}
        aria-hidden="true"
        onAnimationEnd={() => setBeacon(null)}
      />
    )}
    <Panel
      side={side}
      open={open}
      className="bz-hub"
      label={t('app.name')}
      bodyRef={virtual.scrollRef}
      header={
        <PanelHeader
          title={t('app.name')}
          meta={headerMeta}
          action={
            <span className="bz-hub-header-actions bz-row">
              <ClearMenu
                disabled={items.length === 0}
                panelOpen={open}
                visibleUnpinnedIds={visibleUnpinnedIds}
                onClearQuery={onClearQuery}
              />
              <Button
                size="sm"
                icon="settings"
                label={t('common.settings')}
                onClick={() => void invoke('panel:open', 'settings')}
              />
            </span>
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
          <FilterTabs value={filter} onChange={setFilter} />
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
            onMerge={onMergeSelection}
            stackableCount={stackableSelectionCount}
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
          {/* Drop hint and the copy flare live inside the panel overlay so they
              are clipped to the panel, translate off-edge with it when it
              closes, and never paint or intercept clicks outside its bounds. */}
          {dropActive && (
            <div className="bz-hub-drop" aria-hidden="true">
              <span className="bz-hub-drop-label">{t('shelf.drop.hint')}</span>
            </div>
          )}
          {indicatorStyle !== 'off' && (
            <CopyIndicatorCurve
              flareKey={flareKey}
              side={side}
              style={indicatorStyle}
              reduceMotion={reduceMotion}
            />
          )}
          <Onboarding active={open} />
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
              <Button
                size="sm"
                onClick={() => {
                  setQuery('')
                  setFilter('all')
                }}
              >
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
          previewEnabled={previewEnabled}
          onCopy={onCopyItem}
          onPaste={onPasteItem}
          onToggleSelection={toggleSelection}
          onTogglePin={onTogglePin}
          onDelete={onDelete}
          onPreview={openPreview}
          onMerge={onMerge}
          onError={(message) => toasts.push(message, 'error')}
        />
      )}
    </Panel>
    </div>
  )
}
