/**
 * Turning an OS drop into `ItemData` the shelf can add.
 *
 * The renderer never mints image ids or reads files off disk — that is main's
 * job — so a drop is translated into the payloads the renderer *can* honestly
 * build and hands them to `shelf:add`:
 *
 *   - dropped files with a real path  → `file` payloads (image files included,
 *     which the card then thumbnails through `ledge://thumb/file/…`)
 *   - a dropped URL                    → a `link` payload
 *   - dropped plain text               → a `text` payload
 *
 * File paths come from Electron's non-standard `File.path`, which is present in
 * the drag payload of some Electron builds and absent in others (the newer API
 * moves it behind `webUtils.getPathForFile`, which the fixed preload does not
 * expose). Where it is absent, files are skipped rather than added with a made
 * up path — a broken card is worse than a dropped drop.
 */
import type { FilePayload, ItemData, LinkPayload, TextPayload } from '../../shared/types/clipboard'
import { PREVIEW_LIMIT } from '../../shared/types/clipboard'
import { extOf } from '../lib/fileType'

/** True when a drag carries something the shelf could add. */
export function dropHasContent(transfer: DataTransfer): boolean {
  const types = Array.from(transfer.types)
  return (
    types.includes('Files') ||
    types.includes('text/uri-list') ||
    types.includes('text/plain') ||
    types.includes('text/html')
  )
}

/** Best-effort absolute path for a dropped file, or null when unavailable. */
function pathOf(file: File): string | null {
  const path = (file as File & { path?: unknown }).path
  return typeof path === 'string' && path.length > 0 ? path : null
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

function fileToPayload(file: File): FilePayload | null {
  const path = pathOf(file)
  if (!path) return null
  return {
    kind: 'file',
    path,
    name: file.name || baseName(path),
    extension: extOf(path),
    byteSize: Number.isFinite(file.size) ? file.size : null,
    isDirectory: false
  }
}

function looksLikeUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim())
}

function textToPayload(text: string): TextPayload | LinkPayload | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (looksLikeUrl(trimmed)) {
    return { kind: 'link', url: trimmed, title: null }
  }
  const preview = trimmed.slice(0, PREVIEW_LIMIT)
  return {
    kind: 'text',
    preview,
    truncated: trimmed.length > PREVIEW_LIMIT,
    charCount: trimmed.length,
    html: null
  }
}

/**
 * Build every `ItemData` a drop yields. Files win over text — a drag that
 * carries both is a file drag whose text is just the file's name.
 */
export function buildDropItems(transfer: DataTransfer): ItemData[] {
  const files = Array.from(transfer.files)
  if (files.length > 0) {
    const payloads = files
      .map(fileToPayload)
      .filter((payload): payload is FilePayload => payload !== null)
    if (payloads.length > 0) return payloads
  }

  const uri = transfer.getData('text/uri-list')
  const firstUri = uri
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith('#'))
  if (firstUri) {
    const payload = textToPayload(firstUri)
    if (payload) return [payload]
  }

  const text = transfer.getData('text/plain')
  const payload = text ? textToPayload(text) : null
  return payload ? [payload] : []
}
