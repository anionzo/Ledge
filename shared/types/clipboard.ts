/**
 * Clipboard model for the Shelf panel. Ported from Edge-Drop.
 *
 * Large payloads never live in this object: text over PREVIEW_LIMIT is written
 * to a payload file and only the preview is carried here, and images are served
 * as thumbnails through the `ledge://` protocol. That is what keeps the
 * renderer's memory flat as history grows.
 */

export type ItemKind = 'text' | 'link' | 'image' | 'file' | 'stack'

/** Characters of a text item kept in memory. The rest lives on disk. */
export const PREVIEW_LIMIT = 300

/** Max entries merged into one stack before it stops accepting more. */
export const STACK_LIMIT = 10

export interface TextPayload {
  kind: 'text'
  preview: string
  /** True when the full text is longer than the preview and lives on disk. */
  truncated: boolean
  charCount: number
  /** Structured HTML kept for spreadsheet cells so paste preserves the grid. */
  html: string | null
}

export interface LinkPayload {
  kind: 'link'
  url: string
  title: string | null
}

export interface ImagePayload {
  kind: 'image'
  /** Opaque id; resolve through `ledge://thumb/<id>` for display. */
  imageId: string
  width: number
  height: number
  byteSize: number
  /** Set when the image came from a screenshot tool rather than a copy. */
  capturedName: string | null
}

export interface FilePayload {
  kind: 'file'
  path: string
  name: string
  /** Lowercase, no leading dot. Empty for extensionless files. */
  extension: string
  byteSize: number | null
  isDirectory: boolean
}

export interface StackPayload {
  kind: 'stack'
  /** Members are always non-stack items — stacks do not nest. */
  members: Exclude<ItemData, StackPayload>[]
}

export type ItemData =
  | TextPayload
  | LinkPayload
  | ImagePayload
  | FilePayload
  | StackPayload

export interface ClipboardItem {
  id: string
  data: ItemData
  pinned: boolean
  /** Epoch ms. Bumped when the same content is copied again. */
  createdAt: number
  updatedAt: number
  /**
   * How many times this item was dragged or pasted *out* of Ledge. Drops back
   * onto the shelf itself do not count.
   */
  hitCount: number
  /** Stable content hash, used to dedupe and to bump instead of re-adding. */
  signature: string
}

/** Identifies a drag source: a whole item, or one member of a stack. */
export interface DragRequest {
  itemId: string
  /** Index into `StackPayload.members`, or null for the item itself. */
  memberIndex: number | null
}

export interface MergeResult {
  ok: boolean
  /** The surviving stack, when the merge succeeded. */
  stackId: string | null
  reason: 'ok' | 'stack-full' | 'not-found' | 'incompatible'
}
