/**
 * Preview.
 *
 * The card shows 160 characters because two hundred cards have to fit. This is
 * where the rest of it lives — the full text, the whole image, the untruncated
 * path, the members of a stack.
 *
 * Full text is fetched on demand rather than carried in the list: a hundred
 * items at PREVIEW_LIMIT each is a few dozen kilobytes in the renderer, and a
 * hundred items at their true length is however large the largest thing the
 * user has ever copied.
 */
import { useEffect, useState } from 'react'
import type { ClipboardItem, DragRequest, ItemData } from '../../../shared/types/clipboard'
import type { PanelSide } from '../../../shared/types/settings'
import { invoke, send } from '../../lib/bridge'
import { elidePath, EM_DASH, humaniseBytes } from '../../lib/format'
import { t } from '../../i18n'
import { Button, Chip, Icon, Lightbox, Sheet } from '../../ui'
import { kindIcon, kindLabel, primaryLine } from '../describe'
import '../styles/preview-sheet.css'

export interface PreviewSheetProps {
  item: ClipboardItem | null
  side: PanelSide
  onClose: () => void
  onCopy: (request: DragRequest) => void
  onPaste: (request: DragRequest) => void
  onTogglePin: (item: ClipboardItem) => void
  onDelete: (ids: string[]) => void
  onError: (message: string) => void
}

export function PreviewSheet({
  item,
  side,
  onClose,
  onCopy,
  onPaste,
  onTogglePin,
  onDelete,
  onError
}: PreviewSheetProps) {
  return (
    <Sheet
      open={item !== null}
      onClose={onClose}
      side={side}
      title={item ? kindLabel(item.data) : t('shelf.preview.title')}
      closeLabel={t('common.back')}
      footer={
        item && (
          <>
            <Button
              variant="primary"
              size="sm"
              icon="copy"
              onClick={() => onCopy({ itemId: item.id, memberIndex: null })}
            >
              {t('common.copy')}
            </Button>
            <Button
              size="sm"
              onClick={() => onPaste({ itemId: item.id, memberIndex: null })}
            >
              {t('common.paste')}
            </Button>
            <span className="bz-row-fill" />
            <Button
              size="sm"
              icon={item.pinned ? 'pin-filled' : 'pin'}
              label={item.pinned ? t('common.unpin') : t('common.pin')}
              onClick={() => onTogglePin(item)}
            />
            <Button
              size="sm"
              icon="trash"
              variant="danger"
              label={t('common.delete')}
              onClick={() => {
                onDelete([item.id])
                onClose()
              }}
            />
          </>
        )
      }
    >
      {item && (
        <>
          <PreviewBody item={item} onError={onError} onCopy={onCopy} />
          {/* Drags and pastes out of Ledge. Worth showing because it is the
              only signal on the sheet about whether this entry is one the user
              actually reaches for. */}
          {item.hitCount > 0 && (
            <p className="bz-preview-note">{t('shelf.item.uses', { n: item.hitCount })}</p>
          )}
        </>
      )}
    </Sheet>
  )
}

function PreviewBody({
  item,
  onError,
  onCopy
}: {
  item: ClipboardItem
  onError: (message: string) => void
  onCopy: (request: DragRequest) => void
}) {
  const { data } = item

  switch (data.kind) {
    case 'text':
      return <TextPreview item={item} onError={onError} />
    case 'link':
      return (
        <div className="bz-preview">
          <p className="bz-preview-title">{data.title ?? data.url}</p>
          <p className="bz-preview-url bz-num">{data.url}</p>
        </div>
      )
    case 'image':
      return <ImagePreview data={data} />
    case 'file':
      return <FilePreview data={data} onError={onError} />
    case 'stack':
      return <StackPreview item={item} onCopy={onCopy} onError={onError} />
  }
}

/**
 * Image.
 *
 * The card and the sheet's own preview both cap at a fraction of the screen,
 * so the lightbox is the only place the full-resolution image is shown at
 * its own size.
 */
function ImagePreview({ data }: { data: Extract<ItemData, { kind: 'image' }> }) {
  const [zoom, setZoom] = useState<string | null>(null)
  const full = `ledge://${data.imageId}`

  return (
    <div className="bz-preview">
      <button
        type="button"
        className="bz-preview-image"
        onClick={() => setZoom(full)}
        title={t('shelf.preview.view_full')}
        aria-label={t('shelf.preview.view_full')}
      >
        <img src={`ledge://thumb/${data.imageId}`} alt={primaryLine(data)} draggable={false} />
      </button>
      <dl className="bz-preview-facts">
        <Fact
          term={t('shelf.preview.fact.dimensions')}
          value={t('shelf.item.dimensions', { w: data.width, h: data.height })}
        />
        <Fact term={t('shelf.preview.fact.size')} value={humaniseBytes(data.byteSize)} />
      </dl>
      <Lightbox
        src={zoom}
        alt={primaryLine(data)}
        onClose={() => setZoom(null)}
        closeLabel={t('shelf.preview.close_full')}
      />
    </div>
  )
}

/**
 * Text.
 *
 * The preview is shown immediately and replaced by the full text when it
 * arrives, rather than showing a spinner over an empty area — the first 300
 * characters are usually all the user needed, and they are already in memory.
 */
function TextPreview({
  item,
  onError
}: {
  item: ClipboardItem
  onError: (message: string) => void
}) {
  const data = item.data
  const truncated = data.kind === 'text' && data.truncated
  const preview = data.kind === 'text' ? data.preview : ''
  const [full, setFull] = useState<string | null>(null)

  useEffect(() => {
    if (!truncated) return
    let live = true
    invoke('shelf:full-text', item.id)
      .then((text) => {
        if (live) setFull(text)
      })
      .catch(() => {
        if (live) onError(t('common.unknown'))
      })
    return () => {
      live = false
    }
  }, [item.id, truncated, onError])

  return (
    <div className="bz-preview">
      <pre className="bz-preview-text">{full ?? preview}</pre>
      {truncated && full === null && (
        <p className="bz-preview-note">{t('shelf.preview.loading')}</p>
      )}
      {data.kind === 'text' && (
        <dl className="bz-preview-facts">
          <Fact term={t('shelf.preview.fact.characters')} value={String(data.charCount)} />
        </dl>
      )}
    </div>
  )
}

function FilePreview({
  data,
  onError
}: {
  data: Extract<ItemData, { kind: 'file' }>
  onError: (message: string) => void
}) {
  return (
    <div className="bz-preview">
      <div className="bz-preview-file bz-row">
        <Icon name={data.isDirectory ? 'folder' : 'file'} size={18} />
        <span className="bz-row-fill bz-truncate">{data.name}</span>
      </div>
      <p className="bz-preview-url bz-num">{elidePath(data.path, 200)}</p>
      <dl className="bz-preview-facts">
        <Fact term={t('shelf.preview.fact.type')} value={data.extension || EM_DASH} />
        <Fact term={t('shelf.preview.fact.size')} value={humaniseBytes(data.byteSize)} />
      </dl>
      <Button
        size="sm"
        icon="external"
        onClick={() => {
          invoke('shelf:reveal', data.path).catch(() => onError(t('common.unknown')))
        }}
      >
        {t('common.reveal')}
      </Button>
    </div>
  )
}

/**
 * Stack.
 *
 * Members are listed rather than summarised, and each one drags independently
 * — that is the entire point of a stack, and it is invisible on the card.
 */
function StackPreview({
  item,
  onCopy,
  onError
}: {
  item: ClipboardItem
  onCopy: (request: DragRequest) => void
  onError: (message: string) => void
}) {
  if (item.data.kind !== 'stack') return null
  const members = item.data.members

  return (
    <ul className="bz-preview-stack">
      {members.map((member, index) => {
        const request: DragRequest = { itemId: item.id, memberIndex: index }
        return (
          <li key={index} className="bz-preview-member bz-row">
            <Icon name={kindIcon(member.kind)} size={13} />
            <span
              className="bz-row-fill bz-truncate bz-preview-member-text"
              /* Same synchronous rule as the card: the drag session only
                 exists inside this event's tick. */
              draggable
              onDragStart={(event) => {
                event.preventDefault()
                send('shelf:start-drag', request)
              }}
            >
              {primaryLine(member)}
            </span>
            <Chip quiet>{t('shelf.stack.member', { n: index + 1, total: members.length })}</Chip>
            <Button
              size="sm"
              icon="copy"
              label={t('common.copy')}
              onClick={() => onCopy(request)}
            />
            <Button
              size="sm"
              icon="minus"
              label={t('shelf.preview.split')}
              onClick={() => {
                invoke('shelf:split', request).catch(() => onError(t('common.unknown')))
              }}
            />
          </li>
        )
      })}
    </ul>
  )
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div className="bz-preview-fact bz-row">
      <dt>{term}</dt>
      <dd className="bz-num">{value}</dd>
    </div>
  )
}
