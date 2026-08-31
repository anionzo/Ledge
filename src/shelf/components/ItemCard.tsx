/**
 * One clipboard entry.
 *
 * The card is the same shape for every `ItemKind` — mark, two lines, actions —
 * and only the mark and the two lines change. A per-kind layout would make the
 * list ragged, and a clipboard history is scanned vertically at speed; a
 * consistent left rail is what makes that possible.
 *
 * Interaction, in order of how often it happens:
 *   click            copy to the clipboard
 *   double click     copy and paste into whatever had focus
 *   drag             hand the payload to another app natively
 *   click while selecting / ctrl-click   toggle selection
 */
import { memo, type DragEvent, type MouseEvent, type Ref } from 'react'
import type { ClipboardItem, DragRequest, ItemData } from '../../../shared/types/clipboard'
import type { PanelSide } from '../../../shared/types/settings'
import { send } from '../../lib/bridge'
import { t } from '../../i18n'
import { Icon } from '../../ui'
import { accessibleName, kindIcon, kindLabel, primaryLine, secondaryLine } from '../describe'
import '../styles/item-card.css'

export interface ItemCardProps {
  item: ClipboardItem
  /** Position in the filtered list, for `aria-posinset`. */
  index: number
  total: number
  side: PanelSide
  selected: boolean
  selecting: boolean
  /** True for the one card that is in the tab order (roving tabindex). */
  focusable: boolean
  onCopy: (item: ClipboardItem) => void
  onPaste: (item: ClipboardItem) => void
  onToggleSelection: (id: string) => void
  onTogglePin: (item: ClipboardItem) => void
  onPreview: (id: string) => void
  /** From the virtualiser: replaces the estimated height with the real one. */
  measureRef?: Ref<HTMLDivElement>
}

function ItemCardImpl({
  item,
  index,
  total,
  side,
  selected,
  selecting,
  focusable,
  onCopy,
  onPaste,
  onToggleSelection,
  onTogglePin,
  onPreview,
  measureRef
}: ItemCardProps) {
  const { data } = item
  const request: DragRequest = { itemId: item.id, memberIndex: null }

  /**
   * Native drag out.
   *
   * `send` here is synchronous by contract and must stay that way. The OS
   * hands the renderer a drag session that is only valid inside this event's
   * tick; an `invoke` round trip — or anything that awaits, defers to a
   * microtask, or wraps this in a promise — returns after the session has
   * already been dropped, and the drag silently does nothing.
   *
   * `preventDefault` stops Chromium starting its own HTML5 drag, because main
   * is about to start a real one with `webContents.startDrag`.
   */
  const onDragStart = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    send('shelf:start-drag', request)
  }

  /**
   * Warm the temp file and the drag icon while the pointer is merely hovering.
   * Writing a 4 MB image to disk after `dragstart` shows up as a stutter at
   * the exact moment the user is moving the mouse.
   */
  const onPointerEnter = () => {
    send('shelf:prestage-drag', request)
  }

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (selecting || event.ctrlKey || event.metaKey) {
      onToggleSelection(item.id)
      return
    }
    onCopy(item)
  }

  const onDoubleClick = () => {
    if (!selecting) onPaste(item)
  }

  const secondary = secondaryLine(data)

  return (
    <div
      ref={measureRef}
      className="bz-item bz-row"
      role="option"
      aria-selected={selected}
      aria-setsize={total}
      aria-posinset={index + 1}
      aria-label={accessibleName(item)}
      tabIndex={focusable ? 0 : -1}
      data-id={item.id}
      data-kind={data.kind}
      data-selected={selected || undefined}
      data-pinned={item.pinned || undefined}
      draggable
      onDragStart={onDragStart}
      onPointerEnter={onPointerEnter}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <ItemMark data={data} />

      <div className="bz-item-body bz-row-fill">
        <span className="bz-item-primary bz-truncate">{primaryLine(data)}</span>
        <span className="bz-item-meta bz-row">
          <span className="bz-item-kind">{kindLabel(data)}</span>
          {secondary && <span className="bz-item-secondary bz-truncate">{secondary}</span>}
        </span>
      </div>

      {/*
        Actions are revealed on hover and on keyboard focus, but they stay in
        the DOM: rendering them conditionally would make them unreachable by
        tab, and mounting a button on hover costs a frame right where the
        pointer is already moving.
      */}
      <div className="bz-item-actions bz-row">
        <button
          type="button"
          className="bz-item-action"
          data-always={item.pinned || undefined}
          aria-pressed={item.pinned}
          aria-label={item.pinned ? t('common.unpin') : t('common.pin')}
          title={item.pinned ? t('common.unpin') : t('common.pin')}
          onClick={(event) => {
            event.stopPropagation()
            onTogglePin(item)
          }}
        >
          <Icon name={item.pinned ? 'pin-filled' : 'pin'} size={12} />
        </button>
        <button
          type="button"
          className="bz-item-action"
          aria-label={t('shelf.preview.title')}
          title={t('shelf.preview.title')}
          onClick={(event) => {
            event.stopPropagation()
            onPreview(item.id)
          }}
        >
          <Icon name={side === 'left' ? 'chevron-right' : 'chevron-left'} size={12} />
        </button>
      </div>
    </div>
  )
}

/**
 * The left rail.
 *
 * Images get a real thumbnail — it is the only way to tell two screenshots
 * apart — and everything else gets its kind glyph. Thumbnails are the second
 * place colour is allowed into the panel, and unlike the rings that colour is
 * the user's own content rather than ours.
 */
function ItemMark({ data }: { data: ItemData }) {
  if (data.kind === 'image') {
    return (
      <span className="bz-item-mark bz-item-thumb">
        {/*
          Served by main through the ledge:// protocol, already downscaled.
          Decoding async keeps a burst of image items from blocking the first
          paint of the list.
        */}
        <img
          src={`ledge://thumb/${data.imageId}`}
          alt=""
          decoding="async"
          loading="lazy"
          draggable={false}
        />
      </span>
    )
  }

  return (
    <span className="bz-item-mark">
      <Icon name={kindIcon(data.kind)} size={14} />
    </span>
  )
}

/**
 * Memoised on identity. Main replaces the whole array on every change, but the
 * item objects inside it are stable for untouched entries, so a pin toggle
 * re-renders one card rather than two hundred.
 */
export const ItemCard = memo(ItemCardImpl)
