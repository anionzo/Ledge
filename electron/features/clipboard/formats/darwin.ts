/**
 * macOS-specific clipboard file reads.
 *
 * The pasteboard advertises copied files as `public.file-url` (one entry), the
 * legacy `NSFilenamesPboardType` plist (multiple), or `text/uri-list`. macOS has
 * no Electron-exposed clipboard sequence counter, so re-copies dedupe by
 * content (sequence number 0).
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const fileFormats = ['public.file-url', 'NSFilenamesPboardType', 'text/uri-list'] as const

export function clipboardSequenceNumber(): number {
  return 0
}

export function hasFileHint(types: readonly string[]): boolean {
  return types.some((t) => (fileFormats as readonly string[]).includes(t))
}

function pathFromFileUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    return trimmed.startsWith('file://') ? fileURLToPath(trimmed) : trimmed.startsWith('/') ? trimmed : null
  } catch {
    return null
  }
}

export function parseFiles(raw: Map<string, Buffer>, _text: string): string[] {
  const out: string[] = []

  const single = raw.get('public.file-url')
  if (single) {
    const p = pathFromFileUrl(single.toString('utf8'))
    if (p) out.push(p)
  }

  const plist = raw.get('NSFilenamesPboardType')
  if (plist) {
    for (const m of plist.toString('utf8').matchAll(/<string>([^<]+)<\/string>/g)) {
      const p = pathFromFileUrl(m[1])
      if (p) out.push(p)
    }
  }

  const uris = raw.get('text/uri-list')
  if (uris) {
    for (const line of uris.toString('utf8').split(/\r?\n/)) {
      if (line.startsWith('#')) continue
      const p = pathFromFileUrl(line)
      if (p) out.push(p)
    }
  }

  return [...new Set(out)].filter((p) => existsSync(p))
}
