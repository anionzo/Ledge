/**
 * Turning an `ItemData` into the strings a card shows.
 *
 * One module, because the card, the preview sheet, the search index and the
 * accessible name must all describe an item the same way. When they drift, a
 * search matches something whose card shows different text and the list looks
 * broken.
 */
import type { ClipboardItem, ItemData, ItemKind } from '../../shared/types/clipboard'
import { elidePath, hostOf, humaniseBytes, oneLine } from '../lib/format'
import { t } from '../i18n'
import type { IconName } from '../ui'

export function kindIcon(kind: ItemKind): IconName {
  switch (kind) {
    case 'text':
      return 'text'
    case 'link':
      return 'link'
    case 'image':
      return 'image'
    case 'file':
      return 'file'
    case 'stack':
      return 'stack'
  }
}

export function kindLabel(data: ItemData): string {
  if (data.kind === 'file' && data.isDirectory) return t('shelf.kind.folder')
  return t(`shelf.kind.${data.kind}`)
}

/** The card's first line: the thing the user is actually looking for. */
export function primaryLine(data: ItemData): string {
  switch (data.kind) {
    case 'text':
      return oneLine(data.preview)
    case 'link':
      // The title when we have one, because a raw URL is unreadable at 11.5px
      // in a 320px panel; the host goes on the second line either way.
      return data.title ?? data.url
    case 'image':
      return data.capturedName ?? t('shelf.kind.image')
    case 'file':
      return data.name
    case 'stack':
      return t('shelf.stack.members', { n: data.members.length })
  }
}

/** The card's second line: provenance and size, never a repeat of the first. */
export function secondaryLine(data: ItemData): string | null {
  switch (data.kind) {
    case 'text':
      return data.truncated ? t('shelf.item.chars', { n: data.charCount }) : null
    case 'link':
      return hostOf(data.url)
    case 'image':
      return `${t('shelf.item.dimensions', { w: data.width, h: data.height })} · ${humaniseBytes(
        data.byteSize
      )}`
    case 'file':
      return elidePath(data.path)
    case 'stack':
      // Name the kinds inside so a stack is not an opaque box.
      return data.members.map((member) => kindLabel(member)).join(' · ')
  }
}

/**
 * Everything about an item worth matching a search against, lowercased.
 *
 * Deliberately wider than what the card shows: a user searching for a URL they
 * remember should find the link whose card shows only its title, and searching
 * for a file extension should find the file whose card shows an elided path.
 */
export function searchHaystack(item: ClipboardItem): string {
  return haystackOf(item.data).toLowerCase()
}

function haystackOf(data: ItemData): string {
  switch (data.kind) {
    case 'text':
      return data.preview
    case 'link':
      return `${data.url} ${data.title ?? ''}`
    case 'image':
      return data.capturedName ?? 'image'
    case 'file':
      return `${data.name} ${data.path} ${data.extension}`
    case 'stack':
      return data.members.map(haystackOf).join(' ')
  }
}

/**
 * Substring match on the haystack, all terms required in any order.
 *
 * Not fuzzy. A clipboard history is a place the user goes looking for
 * something they know they copied, and fuzzy matching turns "config" into
 * forty results in a list where the right answer was going to be second.
 */
export function matches(item: ClipboardItem, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const hay = searchHaystack(item)
  return needle.split(/\s+/).every((term) => hay.includes(term))
}

/** The accessible name for a card. Kind first, so a list scan makes sense. */
export function accessibleName(item: ClipboardItem): string {
  const parts = [kindLabel(item.data), primaryLine(item.data)]
  if (item.pinned) parts.push(t('shelf.item.pinned'))
  return parts.filter(Boolean).join(', ')
}

/**
 * Estimated card height, for the virtualiser's first pass.
 *
 * Real heights replace these as rows mount; these only need to be close enough
 * that the scrollbar does not visibly resize on the first scroll.
 */
export function estimateCardHeight(item: ClipboardItem): number {
  switch (item.data.kind) {
    case 'image':
      return 76
    case 'stack':
      return 62
    default:
      return 54
  }
}
