/**
 * One clipboard entry.
 *
 * The card is the same shape for every `ItemKind` — mark, two lines, actions —
 * and only the mark and the two lines change. A per-kind layout would make the
 * list ragged, and a clipboard history is scanned vertically at speed; a
 * consistent left rail is what makes that possible.
 *
 * Two kinds carry more than a rail. A `stack` fans its members as a small 3D
 * deck and unfolds, on click, into a sub-list whose rows drag out and split off
 * one at a time. A `link` unfurls into a service badge and a smart title. Both
 * are ported from Edge-Drop and dressed in Ledge tokens.
 *
 * Interaction, in order of how often it happens:
 *   click            copy (or, on a stack, expand)
 *   double click     copy and paste into whatever had focus
 *   drag             hand the payload to another app natively
 *   drop-on          merge the dragged card into this one
 *   click while selecting / ctrl-click   toggle selection
 */
import { memo, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent, type Ref } from 'react'
import type {
  ClipboardItem,
  DragRequest,
  ItemData,
  StackPayload
} from '../../../shared/types/clipboard'
import type { PanelSide } from '../../../shared/types/settings'
import { invoke, send } from '../../lib/bridge'
import { playCardExpandSound } from '../../lib/soundEffects'
import { parseUrlPreview } from '../../lib/urlPreview'
import { humaniseAgo } from '../../lib/format'
import { t } from '../../i18n'
import { Icon } from '../../ui'
import {
  accessibleName,
  isImageExt,
  kindIcon,
  kindLabel,
  primaryLine,
  secondaryLine
} from '../describe'
import { useShelfStore } from '../store'
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
  /** When false the preview affordance is hidden — the sheet is disabled. */
  previewEnabled: boolean
  onCopy: (item: ClipboardItem) => void
  onPaste: (item: ClipboardItem) => void
  onToggleSelection: (id: string) => void
  onTogglePin: (item: ClipboardItem) => void
  onDelete: (ids: string[]) => void
  onPreview: (id: string) => void
  /** Merge the dragged source card into a target card dropped on. */
  onMerge: (sourceId: string, targetId: string) => void
  /** Report a failed sub-action so the panel can toast it. */
  onError: (message: string) => void
  /**
   * Open the Lightbox straight from the card's own thumbnail, bypassing the
   * preview sheet. Only wired for a real `image` item — see `ItemMark`.
   */
  onPreviewImage: (src: string) => void
  /** From the virtualiser: replaces the estimated height with the real one. */
  measureRef?: Ref<HTMLDivElement>
}

/**
 * Below this many pixels of pointer travel since `pointerdown`, a drag is
 * still "probably a click" — a slightly imprecise mouse-down-and-up, or a
 * trackpad's inherent wobble. Chromium's own drag-intent distance (a few
 * device pixels) is smaller than this and fires `dragstart` regardless, so
 * that handler re-checks against this threshold before committing to an OLE
 * drag; below it, the drag is cancelled outright and the pending click/
 * double-click handlers run exactly as if no drag had been attempted. Ported
 * from Edge-Drop's "intelligent 5px movement guard".
 */
const DRAG_THRESHOLD_PX = 5

function ItemCardImpl({
  item,
  index,
  total,
  side,
  selected,
  selecting,
  focusable,
  previewEnabled,
  onCopy,
  onPaste,
  onToggleSelection,
  onTogglePin,
  onDelete,
  onPreview,
  onMerge,
  onError,
  onPreviewImage,
  measureRef
}: ItemCardProps) {
  const { data } = item
  const isStack = data.kind === 'stack'
  const request: DragRequest = { itemId: item.id, memberIndex: null }

  const [expanded, setExpanded] = useState(false)
  const [dropTarget, setDropTarget] = useState(false)

  const setDraggingId = useShelfStore((s) => s.setDraggingId)

  // ── 5 px click-vs-drag guard ─────────────────────────────────────────────
  //
  // Refs, not state: this is read once per `dragstart` and otherwise never
  // drives a render, so putting it in state would just be extra work on every
  // pointer move of every mouse gesture across the list.
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const pastThreshold = useRef(false)

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // Only the primary button ever starts a drag; a right-click opens the OS
    // context menu (or nothing) and must not arm the tracker for it.
    if (event.button !== 0) return
    pointerStart.current = { x: event.clientX, y: event.clientY }
    pastThreshold.current = false
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointerStart.current || pastThreshold.current) return
    const dx = event.clientX - pointerStart.current.x
    const dy = event.clientY - pointerStart.current.y
    if (Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) pastThreshold.current = true
  }

  const resetPointerTracking = () => {
    pointerStart.current = null
    pastThreshold.current = false
  }

  /**
   * Native drag out.
   *
   * The 5 px guard runs first: Chromium fires `dragstart` on its own, smaller
   * drag-intent distance, so a barely-moved mouse-down-and-up can reach this
   * handler on its way to being a click. Below `DRAG_THRESHOLD_PX` of travel
   * since `pointerdown` we cancel the whole HTML5 drag and do nothing else —
   * no dragging id, no OLE session — so the click/double-click handlers fire
   * normally on mouseup exactly as if no drag had been attempted.
   *
   * Past the threshold, `send` here is synchronous by contract and must stay
   * that way. The OS hands the renderer a drag session valid only inside this
   * event's tick; an `invoke` round trip — or anything that awaits — returns
   * after the session has been dropped, and the drag silently does nothing.
   * `preventDefault` stops Chromium starting its own HTML5 drag, because main
   * is about to start a real one with `webContents.startDrag`.
   *
   * The drag id is recorded so another card can merge this one in when it is
   * dropped on. Only whole-item drags are recorded; a member dragged out of a
   * stack must not merge the stack into whatever it lands on.
   */
  const onDragStart = (event: DragEvent<HTMLDivElement>) => {
    // `pointermove` is the usual evidence, but it is not guaranteed to have
    // fired before `dragstart` — a fast flick can produce the drag intent from
    // a single coalesced move, and pointer capture behaves differently across
    // platforms. So the drag event's own coordinates are checked as a fallback
    // rather than cancelling on missing evidence: refusing a real drag because
    // no `pointermove` arrived is a far worse bug than letting a marginal one
    // through.
    const start = pointerStart.current
    const travelled =
      start === null ? Infinity : Math.hypot(event.clientX - start.x, event.clientY - start.y)

    if (!pastThreshold.current && travelled < DRAG_THRESHOLD_PX) {
      event.preventDefault()
      return
    }
    event.preventDefault()
    setDraggingId(item.id)
    send('shelf:start-drag', request)
  }

  const onDragEnd = () => {
    setDraggingId(null)
    resetPointerTracking()
  }

  const onPointerEnter = () => {
    send('shelf:prestage-drag', request)
  }

  // ── Merge: another card dropped onto this one ──────────────────────────────
  const draggingOther = () => {
    const dragging = useShelfStore.getState().draggingId
    return dragging !== null && dragging !== item.id
  }

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!draggingOther()) return
    event.preventDefault()
    event.stopPropagation()
    if (!dropTarget) setDropTarget(true)
  }

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    const related = event.relatedTarget as Node | null
    if (related && event.currentTarget.contains(related)) return
    setDropTarget(false)
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    const source = useShelfStore.getState().draggingId
    if (source === null || source === item.id) return
    event.preventDefault()
    event.stopPropagation()
    setDropTarget(false)
    setDraggingId(null)
    onMerge(source, item.id)
  }

  const toggleExpand = () => {
    // The sound is a side effect, so it must live outside the state updater —
    // React may call an updater more than once (StrictMode, batching) and a
    // pure updater is the contract. Compute next from the current value once.
    const next = !expanded
    playCardExpandSound(next)
    setExpanded(next)
  }

  // Single click opens the preview — the closest thing to inspecting a clip
  // without leaving the shelf — when it is enabled; with the sheet turned off
  // the same click copies, so a click is never a dead gesture. A stack unfolds
  // instead. Copy stays a one-gesture action either way: the hover Copy button
  // and the double-click both put it on the clipboard.
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (selecting || event.ctrlKey || event.metaKey) {
      onToggleSelection(item.id)
      return
    }
    if (isStack) {
      toggleExpand()
      return
    }
    if (previewEnabled) onPreview(item.id)
    else onCopy(item)
  }

  const onDoubleClick = () => {
    if (!selecting && !isStack) onCopy(item)
  }

  const secondary = secondaryLine(data)
  const ago = humaniseAgo(new Date(item.createdAt).toISOString())

  // Unfurl a bare link: when main captured no title, the offline parser derives
  // a readable one (a repo path, a video id, a service name) so the card is not
  // just a raw URL. It degrades to the URL itself when nothing can be inferred.
  let primary = primaryLine(data)
  if (data.kind === 'link' && !data.title) {
    const preview = parseUrlPreview(data.url)
    primary = preview.title ?? preview.serviceName ?? data.url
  }

  return (
    <div
      ref={measureRef}
      className="bz-item"
      role="option"
      aria-selected={selected}
      aria-setsize={total}
      aria-posinset={index + 1}
      aria-label={accessibleName(item)}
      aria-expanded={isStack ? expanded : undefined}
      tabIndex={focusable ? 0 : -1}
      data-id={item.id}
      data-kind={data.kind}
      data-selected={selected || undefined}
      data-pinned={item.pinned || undefined}
      data-drop-target={dropTarget || undefined}
      data-expanded={expanded || undefined}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={resetPointerTracking}
      onPointerCancel={resetPointerTracking}
      onPointerEnter={onPointerEnter}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <div className="bz-item-lead bz-row">
        <ItemMark data={data} previewEnabled={previewEnabled} onPreviewImage={onPreviewImage} />

        <div className="bz-item-body bz-row-fill">
          <span className="bz-item-primary bz-truncate">{primary}</span>
          <span className="bz-item-meta bz-row">
            <span className="bz-item-kind">{kindLabel(data)}</span>
            {secondary && <span className="bz-item-secondary bz-truncate">{secondary}</span>}
            <span className="bz-row-fill" />
            {/* Relative capture time, so a card is scannable — kind, content,
                age — without opening it. */}
            <time className="bz-item-time bz-num" dateTime={new Date(item.createdAt).toISOString()}>
              {ago}
            </time>
          </span>
        </div>

        {/*
          Actions are revealed on hover and on keyboard focus, but they stay in
          the DOM: rendering them conditionally would make them unreachable by
          tab, and mounting a button on hover costs a frame right where the
          pointer is already moving.
        */}
        <div className="bz-item-actions bz-row">
          {/* Inline actions fade in on hover/focus: every primary verb reachable
              in one gesture, no context menu. Copy first — it is what a
              clipboard history is for. */}
          {!isStack && (
            <button
              type="button"
              className="bz-item-action"
              aria-label={t('common.copy')}
              title={t('common.copy')}
              onClick={(event) => {
                event.stopPropagation()
                onCopy(item)
              }}
            >
              <Icon name="copy" size={12} />
            </button>
          )}
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
            aria-label={t('common.delete')}
            title={t('common.delete')}
            onClick={(event) => {
              event.stopPropagation()
              onDelete([item.id])
            }}
          >
            <Icon name="trash" size={12} />
          </button>
          {isStack && (
            <button
              type="button"
              className="bz-item-action"
              aria-label={expanded ? t('shelf.stack.collapse') : t('shelf.stack.expand')}
              title={expanded ? t('shelf.stack.collapse') : t('shelf.stack.expand')}
              onClick={(event) => {
                event.stopPropagation()
                toggleExpand()
              }}
            >
              <Icon name="chevron-down" size={12} className="bz-item-caret" data-open={expanded || undefined} />
            </button>
          )}
        </div>
      </div>

      {isStack && expanded && data.kind === 'stack' && (
        <StackMembers item={item} data={data} onError={onError} />
      )}
    </div>
  )
}

/**
 * The unfolded stack.
 *
 * Members are listed rather than summarised, and each one drags independently
 * and can be split off — that is the entire point of a stack, and it is
 * invisible on the collapsed card.
 */
function StackMembers({
  item,
  data,
  onError
}: {
  item: ClipboardItem
  data: StackPayload
  onError: (message: string) => void
}) {
  return (
    <ul className="bz-stack-members" onClick={(event) => event.stopPropagation()}>
      {data.members.map((member, memberIndex) => {
        const req: DragRequest = { itemId: item.id, memberIndex }
        return (
          <li key={memberIndex} className="bz-stack-member bz-row">
            <span className="bz-stack-member-mark">
              <MemberThumb data={member} size={20} />
            </span>
            <span
              className="bz-row-fill bz-truncate bz-stack-member-text"
              draggable
              onDragStart={(event) => {
                // Same synchronous rule as the card: the drag session only
                // exists inside this event's tick.
                // stopPropagation is load-bearing: dragstart bubbles, and the
                // ancestor card's onDragStart would otherwise also fire —
                // recording the whole stack as the drag source (draggingId =
                // stack id) and sending a second whole-item start-drag. That
                // turns "drag one member out" into "merge/move the entire
                // stack". Keep the member drag from ever reaching the card.
                event.stopPropagation()
                event.preventDefault()
                send('shelf:start-drag', req)
              }}
            >
              {primaryLine(member)}
            </span>
            <button
              type="button"
              className="bz-item-action"
              aria-label={t('common.copy')}
              title={t('common.copy')}
              onClick={() => {
                invoke('shelf:copy', req).catch(() => onError(t('shelf.toast.copy_failed')))
              }}
            >
              <Icon name="copy" size={12} />
            </button>
            <button
              type="button"
              className="bz-item-action"
              aria-label={t('shelf.preview.split')}
              title={t('shelf.preview.split')}
              onClick={() => {
                invoke('shelf:split', req).catch(() => onError(t('common.unknown')))
              }}
            >
              <Icon name="minus" size={12} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The left rail.
 *
 * Images get a real thumbnail — the only way to tell two screenshots apart —
 * files that are images get one too, and a stack fans its first few members
 * into a small deck. Everything else gets its kind glyph, with the link kind
 * borrowing a lettered service badge from the offline URL parser.
 */
function ItemMark({
  data,
  previewEnabled,
  onPreviewImage
}: {
  data: ItemData
  previewEnabled: boolean
  onPreviewImage: (src: string) => void
}) {
  // A real `image` item has a full-resolution `ledge://<id>` route, so its
  // thumbnail is a shortcut straight into the Lightbox — the reader already
  // knows which tile this is; making them open the preview sheet first just
  // to click through to the same full image is a wasted step. `role="button"`
  // rather than a native `<button>`: the surrounding `.bz-item-thumb` sizing
  // is tuned for a plain box, and a real button would need its own padding/
  // border/background reset to avoid inheriting the browser's default chrome
  // around the 40 px tile. Gated on `previewEnabled` — with the sheet turned
  // off, the whole preview affordance (sheet and lightbox alike) is off, and
  // the click falls through to the card's own copy-on-click instead.
  if (data.kind === 'image') {
    if (!previewEnabled) {
      return (
        <span className="bz-item-mark bz-item-thumb">
          <MemberThumb data={data} size={40} />
        </span>
      )
    }
    const full = `ledge://${data.imageId}`
    return (
      <span
        className="bz-item-mark bz-item-thumb"
        role="button"
        tabIndex={0}
        title={t('shelf.preview.view_full')}
        aria-label={t('shelf.preview.view_full')}
        onClick={(event) => {
          event.stopPropagation()
          onPreviewImage(full)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          event.stopPropagation()
          onPreviewImage(full)
        }}
      >
        <MemberThumb data={data} size={40} />
      </span>
    )
  }

  if (data.kind === 'file' && isImageExt(data.extension)) {
    return (
      <span className="bz-item-mark bz-item-thumb">
        <MemberThumb data={data} size={40} />
      </span>
    )
  }

  if (data.kind === 'link') {
    const preview = parseUrlPreview(data.url)
    const initial = (preview.serviceName || preview.domain || '?').charAt(0).toUpperCase()
    return (
      <span className="bz-item-mark bz-item-favicon" aria-hidden="true">
        {initial}
      </span>
    )
  }

  if (data.kind === 'stack') {
    return <StackFan data={data} />
  }

  return (
    <span className="bz-item-mark">
      <Icon name={kindIcon(data.kind)} size={14} />
    </span>
  )
}

/**
 * The collapsed stack: up to four members fanned into a 3D deck, each rotated
 * and offset a touch more than the last. Ported from Edge-Drop's bundle stack,
 * re-tuned to the panel's 28 px rail.
 */
function StackFan({ data }: { data: StackPayload }) {
  const shown = data.members.slice(0, 4)
  return (
    <span className="bz-item-mark bz-stack-fan" data-count={shown.length}>
      {shown.map((member, i) => (
        <span
          key={i}
          className="bz-stack-fan-card"
          style={{
            ['--bz-fan-i' as string]: i,
            zIndex: shown.length - i
          }}
        >
          <MemberThumb data={member} size={26} />
        </span>
      ))}
    </span>
  )
}

/**
 * A single thumbnail with a graceful fallback.
 *
 * Images resolve through `ledge://thumb/<imageId>`, image files through
 * `ledge://thumb/file/<path>`. When either fails to decode — a deleted file, a
 * dropped protocol — the kind glyph takes its place rather than a broken image
 * frame.
 */
function MemberThumb({ data, size }: { data: ItemData; size: number }) {
  const [failed, setFailed] = useState(false)
  const src = thumbSrc(data)

  if (src && !failed) {
    return (
      <img
        className="bz-thumb-img"
        src={src}
        alt=""
        width={size}
        height={size}
        decoding="async"
        loading="lazy"
        draggable={false}
        onError={() => setFailed(true)}
      />
    )
  }

  return <Icon name={kindIcon(data.kind)} size={Math.round(size * 0.55)} />
}

/**
 * The `ledge://` URL for an item's thumbnail, or null when it has none.
 *
 * A GIF file is the one case that does NOT go through the thumbnail route: a
 * thumbnail is a re-encoded still, so a GIF served through it stops moving.
 * Those go to `ledge://file/`, which streams the original bytes — a stack of
 * reaction GIFs is worth very little if every tile is frozen on frame one.
 * Stored captures are always PNG by the time they reach the store (the
 * clipboard hands over a `nativeImage`, not a container), so this only ever
 * applies to a real file on disk.
 */
function thumbSrc(data: ItemData): string | null {
  if (data.kind === 'image') return `ledge://thumb/${data.imageId}`
  if (data.kind === 'file' && isImageExt(data.extension)) {
    const route = data.extension.toLowerCase() === 'gif' ? 'file' : 'thumb/file'
    return `ledge://${route}/${encodeURIComponent(data.path)}`
  }
  return null
}

/**
 * Memoised on identity. Main replaces the whole array on every change, but the
 * item objects inside it are stable for untouched entries, so a pin toggle
 * re-renders one card rather than two hundred.
 */
export const ItemCard = memo(ItemCardImpl)
