/**
 * Typed adapter over Electron's clipboard.
 *
 * This Electron line ships the W3C-style **async** clipboard (`read()`,
 * `readText()`, `write()`), not the legacy synchronous API Edge-Drop used. All
 * of that asynchrony is contained here: the rest of the engine works against a
 * plain `ClipSnapshot` value and the small write helpers below, so the polling
 * and analysis logic stays synchronous and unit-testable.
 */
import { clipboard, nativeImage, ClipboardItem as ElectronClipboardItem } from 'electron'

/** A single sampled view of the clipboard. */
export interface ClipSnapshot {
  /** MIME/format names the platform clipboard currently advertises. */
  types: string[]
  text: string
  html: string | null
  /** Decoded when an image is present, so callers get dimensions + PNG bytes. */
  image: { width: number; height: number; png: Buffer } | null
  /** Raw payloads for the OS file formats the caller asked for, by format name. */
  raw: Map<string, Buffer>
}

async function blobToBuffer(blob: Blob): Promise<Buffer> {
  return Buffer.from(await blob.arrayBuffer())
}

/** Best-effort fetch of one clipboard type as bytes; null when absent/unreadable. */
async function readType(item: ElectronClipboardItem, type: string): Promise<Buffer | null> {
  try {
    const value = await item.getType(type)
    // getType resolves to a Blob for everything except the bookmark type.
    if (value instanceof Blob) return await blobToBuffer(value)
    return null
  } catch {
    return null
  }
}

/**
 * Sample the clipboard once. `fileFormats` names the OS file formats whose raw
 * bytes the caller wants back in `snapshot.raw` (so per-OS file parsing stays in
 * the per-OS modules). Never throws — a locked or empty clipboard yields an
 * empty snapshot.
 */
export async function readSnapshot(fileFormats: readonly string[] = []): Promise<ClipSnapshot> {
  const empty: ClipSnapshot = { types: [], text: '', html: null, image: null, raw: new Map() }
  let items: ElectronClipboardItem[]
  try {
    items = await clipboard.read()
  } catch {
    return empty
  }

  const types = [...new Set(items.flatMap((i) => i.types))]
  const first = items[0]
  const has = (t: string): boolean => types.includes(t)

  let text = ''
  try {
    text = await clipboard.readText()
  } catch {
    text = ''
  }

  let html: string | null = null
  if (first && has('text/html')) {
    const buf = await readType(first, 'text/html')
    if (buf) html = buf.toString('utf8')
  }

  let image: ClipSnapshot['image'] = null
  const imageType = types.find((t) => t.startsWith('image/'))
  if (first && imageType) {
    const buf = await readType(first, imageType)
    if (buf) {
      try {
        const img = nativeImage.createFromBuffer(buf)
        if (!img.isEmpty()) {
          const size = img.getSize()
          // Normalize to PNG bytes regardless of the source MIME so downstream
          // hashing/staging has one stable representation.
          image = { width: size.width, height: size.height, png: imageType === 'image/png' ? buf : img.toPNG() }
        }
      } catch {
        image = null
      }
    }
  }

  const raw = new Map<string, Buffer>()
  if (first) {
    for (const fmt of fileFormats) {
      if (!has(fmt)) continue
      const buf = await readType(first, fmt)
      if (buf) raw.set(fmt, buf)
    }
  }

  return { types, text, html, image, raw }
}

/* -------------------------------- writes --------------------------------- */

/** Replace the clipboard with text (and optional HTML). */
export async function writeTextHtml(text: string, html?: string | null): Promise<void> {
  const payload: Record<string, string> = { 'text/plain': text }
  if (html) payload['text/html'] = html
  await clipboard.write([new ElectronClipboardItem(payload)])
}

/** Replace the clipboard with a PNG image. */
export async function writeImagePng(png: Buffer): Promise<void> {
  const blob = new Blob([new Uint8Array(png)], { type: 'image/png' })
  await clipboard.write([new ElectronClipboardItem({ 'image/png': blob })])
}
