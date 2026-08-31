/**
 * The Shelf panel.
 *
 * Composition root: it owns the IPC wiring and the virtualiser, and hands both
 * down. Everything below it is presentational or holds state that only it
 * cares about.
 *
 * The item list is never predicted. Every mutating call returns the new array
 * and `shelf:items` pushes it when the OS clipboard changes underneath us, so
 * there is exactly one source of truth and no reconciliation to get wrong.
 */
import { useCallback, useEffect, useMemo } from 'react'
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
import { ItemList } from './components/ItemList'
import { PreviewSheet } from './components/PreviewSheet'
import { SearchBar } from './components/SearchBar'
import { SelectionBar } from './components/SelectionBar'
import { estimateCardHeight, matches } from './describe'
import { useShelfStore } from './store'
import './styles/shelf.css'

export function App() {
  const { settings } = useSettings()
  useThemeAttributes(settings)
  useLocale(settings)

  const open = usePanelOpen()
  const toasts = useToastQueue()

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

  const side = settings?.shelf.side ?? 'left'

  // First paint. Main pushes every subsequent change, so this runs once.
  useEffect(() => {
    invoke('shelf:list')
      .then(setItems)
      .catch(() => toasts.push(t('common.unknown'), 'error'))
    // `toasts.push` is stable and `setItems` comes from the store; neither
    // changes identity, so this genuinely is a mount-only effect.
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

  // ── Actions ──────────────────────────────────────────────────────────────

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
      // No toast on success: the paste lands in the app the user was already
      // looking at, which is its own confirmation.
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
          setItems(next)
          clearSelection()
          toasts.push(t('shelf.toast.deleted', { n: ids.length }))
        })
        .catch(() => toasts.push(t('common.unknown'), 'error'))
    },
    [clearSelection, setItems, toasts]
  )

  const onCopySelection = useCallback(() => {
    // Copying a multi-selection copies them one after another, which on every
    // platform means the last one wins. Rather than pretend otherwise, only
    // the last selected item is put on the clipboard — and it is the one the
    // user picked most recently, which is the least surprising choice.
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

  return (
    <Panel
      side={side}
      open={open}
      label={t('shelf.title')}
      bodyRef={virtual.scrollRef}
      header={
        <PanelHeader
          title={t('shelf.title')}
          meta={items.length > 0 ? String(items.length) : undefined}
          action={
            <Button
              size="sm"
              icon="trash"
              label={t('shelf.action.clear_unpinned')}
              onClick={onClearUnpinned}
              disabled={items.length === 0}
            />
          }
        />
      }
      toolbar={
        <SearchBar
          value={query}
          onChange={setQuery}
          onEnterList={focusList}
          autoFocus={open}
        />
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
  )
}
