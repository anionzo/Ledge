/**
 * The virtualised item list.
 *
 * Two hundred cards, several of which decode an image, is enough to make the
 * first open of the panel visibly hitch — and the first open is the whole
 * product. So only the visible window is mounted, offset by a spacer, and the
 * mounted cards additionally carry `content-visibility: auto`.
 *
 * The list is a real listbox: roving tabindex, arrow navigation, Space to
 * select, Enter to copy. A clipboard history that can only be driven with a
 * mouse is a clipboard history you stop using once your hands are on the
 * keyboard, which is exactly when you need it.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { ClipboardItem } from '../../../shared/types/clipboard'
import type { PanelSide } from '../../../shared/types/settings'
import type { VirtualWindow } from '../../lib/virtual'
import { t } from '../../i18n'
import { ItemCard } from './ItemCard'
import '../styles/item-list.css'

export interface ItemListProps {
  items: ClipboardItem[]
  side: PanelSide
  selection: string[]
  selecting: boolean
  virtual: VirtualWindow
  /** When false the preview affordance is hidden on every card. */
  previewEnabled: boolean
  onCopy: (item: ClipboardItem) => void
  onPaste: (item: ClipboardItem) => void
  onToggleSelection: (id: string) => void
  onTogglePin: (item: ClipboardItem) => void
  onDelete: (ids: string[]) => void
  onPreview: (id: string) => void
  onMerge: (sourceId: string, targetId: string) => void
  onError: (message: string) => void
}

export function ItemList({
  items,
  side,
  selection,
  selecting,
  virtual,
  previewEnabled,
  onCopy,
  onPaste,
  onToggleSelection,
  onTogglePin,
  onDelete,
  onPreview,
  onMerge,
  onError
}: ItemListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [focusIndex, setFocusIndex] = useState(0)
  const wantsFocus = useRef(false)

  const selected = new Set(selection)
  const clamped = Math.min(focusIndex, Math.max(0, items.length - 1))

  /**
   * Move the roving focus.
   *
   * The target card may not be mounted yet: `scrollToIndex` sets `scrollTop`,
   * and the window only widens after the scroll event has been handled and the
   * component re-rendered. So we retry across a couple of frames rather than
   * assuming the node is there, and give up rather than looping.
   */
  const focusRow = useCallback((index: number) => {
    setFocusIndex(index)
    virtual.scrollToIndex(index)
    wantsFocus.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [virtual])

  useEffect(() => {
    if (!wantsFocus.current) return
    const id = items[clamped]?.id
    if (!id) {
      wantsFocus.current = false
      return
    }

    let attempts = 3
    let frame = 0
    const tryFocus = () => {
      const node = containerRef.current?.querySelector<HTMLElement>(
        `[data-id="${CSS.escape(id)}"]`
      )
      if (node) {
        node.focus()
        wantsFocus.current = false
        return
      }
      attempts -= 1
      if (attempts > 0) frame = requestAnimationFrame(tryFocus)
      else wantsFocus.current = false
    }
    tryFocus()

    return () => cancelAnimationFrame(frame)
  }, [clamped, items, virtual.start, virtual.end])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const item = items[clamped]
    // The inner direction — away from the screen edge — opens the preview, and
    // the outer direction closes it. The gesture mirrors with the panel, so it
    // means the same thing in both.
    const inward = side === 'left' ? 'ArrowRight' : 'ArrowLeft'

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusRow(Math.min(items.length - 1, clamped + 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        focusRow(Math.max(0, clamped - 1))
        break
      case 'Home':
        event.preventDefault()
        focusRow(0)
        break
      case 'End':
        event.preventDefault()
        focusRow(items.length - 1)
        break
      case 'PageDown':
        event.preventDefault()
        focusRow(Math.min(items.length - 1, clamped + 8))
        break
      case 'PageUp':
        event.preventDefault()
        focusRow(Math.max(0, clamped - 8))
        break
      case ' ':
        if (!item) break
        event.preventDefault()
        onToggleSelection(item.id)
        break
      case 'Enter':
        if (!item) break
        event.preventDefault()
        // Shift promotes copy to paste, matching the double click.
        if (event.shiftKey) onPaste(item)
        else onCopy(item)
        break
      case inward:
        if (!item) break
        event.preventDefault()
        onPreview(item.id)
        break
      case 'Delete':
      case 'Backspace':
        if (!item) break
        event.preventDefault()
        onDelete(selection.length > 0 ? selection : [item.id])
        break
      case 'p':
      case 'P':
        if (!item) break
        event.preventDefault()
        onTogglePin(item)
        break
      default:
        break
    }
  }

  const visible = items.slice(virtual.start, virtual.end)

  return (
    <div
      ref={containerRef}
      className="bz-item-list"
      role="listbox"
      aria-multiselectable
      aria-label={t('shelf.title')}
      onKeyDown={onKeyDown}
      style={{ height: virtual.totalHeight }}
    >
      {/* One translated block instead of a spacer div: no extra element in the
          listbox for assistive tech to walk past. */}
      <div className="bz-item-window" style={{ transform: `translateY(${virtual.offsetTop}px)` }}>
        {visible.map((item, offset) => {
          const index = virtual.start + offset
          return (
            <ItemCard
              key={item.id}
              item={item}
              index={index}
              total={items.length}
              side={side}
              selected={selected.has(item.id)}
              selecting={selecting}
              focusable={index === clamped}
              previewEnabled={previewEnabled}
              measureRef={virtual.measureRef(index)}
              onCopy={onCopy}
              onPaste={onPaste}
              onToggleSelection={onToggleSelection}
              onTogglePin={onTogglePin}
              onDelete={onDelete}
              onPreview={onPreview}
              onMerge={onMerge}
              onError={onError}
            />
          )
        })}
      </div>
    </div>
  )
}
