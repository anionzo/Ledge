/**
 * Linux-specific clipboard file reads.
 *
 * Files copied in a file manager land on the clipboard as `text/uri-list`
 * (RFC 2483): `file://` URIs, one per line, `#`-comment lines ignored. There is
 * no portable X11/Wayland clipboard sequence counter, so re-copies dedupe by
 * content (sequence number 0).
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const fileFormats = ['text/uri-list'] as const

export function clipboardSequenceNumber(): number {
  return 0
}

export function hasFileHint(types: readonly string[]): boolean {
  return types.includes('text/uri-list')
}

function pathFromUri(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  try {
    if (trimmed.startsWith('file://')) return fileURLToPath(trimmed)
    if (trimmed.startsWith('/')) return trimmed
    return null
  } catch {
    return null
  }
}

export function parseFiles(raw: Map<string, Buffer>, _text: string): string[] {
  const buf = raw.get('text/uri-list')
  if (!buf) return []
  const paths: string[] = []
  for (const line of buf.toString('utf8').split(/\r?\n/)) {
    const p = pathFromUri(line)
    if (p) paths.push(p)
  }
  return [...new Set(paths)].filter((p) => existsSync(p))
}
