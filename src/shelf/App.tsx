/**
 * The Shelf panel.
 *
 * A standalone clipboard shelf. Ledge ships one composed hub now (see
 * `src/hub`), and this renderer is kept as the shelf on its own — the same
 * clipboard surface without the quota strip — so its components have a home
 * that exercises them in isolation. It carries the same behavioural settings
 * the hub does: filters, the clear menu, the copy indicator, incognito, text
 * scale, preview and drag-in.
 *
 * The item list is never predicted. Every mutating call returns the new array
 * and `shelf:items` pushes it when the OS clipboard changes underneath us, so
 * there is exactly one source of truth and no reconciliation to get wrong.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import type { ClearQuery } from '../../shared/ipc'
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
import { ClearMenu } from './components/ClearMenu'
import { CopyIndicatorCurve } from './components/CopyIndicatorCurve'
import { FilterTabs } from './components/FilterTabs'
import { ItemList } from './components/ItemList'
import { Onboarding } from './components/Onboarding'
import { PreviewSheet } from './components/PreviewSheet'
import { SearchBar } from './components/SearchBar'
import { SelectionBar } from './components/SelectionBar'
import { buildDropItems, dropHasContent } from './dragIn'
import { estimateCardHeight, matches, matchesFilter } from './describe'
import { useShelfStore } from './store'
import './styles/shelf.css'

export function App() {
  const { settings } = useSettings()
  useThemeAttributes(settings)
  useLocale(settings)

  const open = usePanelOpen()
  const toasts = useToastQueue()

  const side = settings?.shelf.side ?? 'left'
  const previewEnabled = settings?.shelf.previewEnabled ?? true
  const incognito = settings?.shelf.incognito ?? false
  const textScale = settings?.shelf.textScale ?? 'md'
  const indicatorStyle = settings?.shelf.indicatorStyle ?? 'curve'
  const reduceMotion = settings?.reduceMotion ?? false

  useEffect(() => {
    if (!settings) return
    setSoundEnabled(settings.shelf.playSounds && !settings.reduceMotion)
  }, [settings])

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

  const prevCount = useRef<number | null>(null)
  const [flareKey, setFlareKey] = useState(0)

  // First paint. Main pushes every subsequent change, so this runs once.
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
      setFlareKey((k) => k + 1)
      playDialTickSound()
    }
  })

  // Open/close switch-snap, only on a real transition.
  const prevOpen = useRef(open)
  useEffect(() => {
    if (prevOpen.current !== open) {
      playToggleSound(open)
      prevOpen.current = open
    }
  }, [open])

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

  // ── Actions ──────────────────────────────────────────────────────────────

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

  const onCopyItem = useCallback((item: ClipboardItem) => runCopy({ itemId: item.id, memberIndex: null }), [runCopy])
  const onPasteItem = useCallback((item: ClipboardItem) => runPaste({ itemId: item.id, memberIndex: null }), [runPaste])

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

  const [dropActive, setDropActive] = useState(false)

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
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
      if (useShelfStore.getState().draggingId !== null) return
      if (!dropHasContent(event.dataTransfer)) return
      event.preventDefault()
      setDropActive(false)
      const payloads = buildDropItems(event.dataTransfer)
      if (payloads.length === 0) return
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

  // What "this view" means to the clear menu. `null` when nothing is narrowing
  // the list, which lets main sweep the whole store instead of walking an id
  // list that would just be every id anyway.
  const visibleUnpinnedIds = useMemo(
    () => (isFiltered ? filtered.filter((item) => !item.pinned).map((item) => item.id) : null),
    [isFiltered, filtered]
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
    <div
      className="bz-shelf-root"
      data-text-scale={textScale}
      data-drop-active={dropActive || undefined}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <Panel
        side={side}
        open={open}
        label={t('shelf.title')}
        bodyRef={virtual.scrollRef}
        header={
          <PanelHeader
            title={t('shelf.title')}
            meta={headerMeta}
            action={
              <ClearMenu
                disabled={items.length === 0}
                panelOpen={open}
                visibleUnpinnedIds={visibleUnpinnedIds}
                onClearQuery={onClearQuery}
              />
            }
          />
        }
        toolbar={
          <>
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
            // The standalone shelf renderer has no side column to grow into —
            // that lives in the hub, which owns its window's width.
            onPreviewImage={() => undefined}
            onMerge={onMerge}
            onError={(message) => toasts.push(message, 'error')}
          />
        )}
      </Panel>
    </div>
  )
}
