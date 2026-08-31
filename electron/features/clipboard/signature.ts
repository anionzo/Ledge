/**
 * Stable, content-based key used for item deduplication and for correlating
 * staged temp artifacts with the history entries that own them.
 *
 * Single source of truth: the ItemStore dedup index and the staged-temp
 * registry MUST agree on identity, otherwise lifecycle cleanup would either
 * delete files that are still owned (data loss) or leak them forever.
 *
 * The signature is computed from the payload as it *arrives* at `add()`. For
 * text that means the full string (a fresh copy of the same paragraph always
 * hashes the same), even though the persisted item keeps only the 300-char
 * preview — the computed value is stored on `ClipboardItem.signature` once and
 * never recomputed from the truncated copy, which is exactly why the Ledge
 * model carries `signature` as a field.
 */
import type { ItemData } from '../../../shared/types/clipboard'

/** Signature of a single (non-stack) member. */
function memberSignature(data: Exclude<ItemData, { kind: 'stack' }>): string {
  switch (data.kind) {
    case 'text':
      return `text|${data.preview}`
    case 'link':
      return `link|${data.url}`
    case 'image':
      // Prefer content dimensions+size so a re-copy of the same bitmap dedupes
      // even when a fresh imageId was minted; fall back to the id when the
      // capture has not been sized yet.
      return data.byteSize > 0 ? `image|${data.width}x${data.height}|${data.byteSize}` : `image|${data.imageId}`
    case 'file':
      return `file|${data.path}`
  }
}

export function contentSignature(data: ItemData): string {
  if (data.kind === 'stack') {
    return `stack|${data.members.map(memberSignature).join(',')}`
  }
  return memberSignature(data)
}
