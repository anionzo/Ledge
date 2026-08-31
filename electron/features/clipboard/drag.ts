/**
 * Native drag-out of items into other applications.
 *
 * Electron's supported drag path is `webContents.startDrag({ file, icon })`,
 * which MUST be called synchronously from an `ipcMain.on` (send) handler so
 * `event.sender` is the exact webContents that began the drag — that is why the
 * IPC contract routes drag through `shelf:start-drag` (send), not an invoke.
 *
 * Before dragging we stage the item's content as a temp file:
 *   - image  -> images/<id>.png copied to temp under a friendly name
 *   - text   -> Snippet_<t>.txt
 *   - link   -> the URL as text
 *   - file   -> the ORIGINAL path (drag the real thing, not a copy)
 *   - stack  -> each member staged the same way
 *
 * The staged temp files are lifecycle-managed by `stagedTemp.ts`.
 */
import { nativeImage, type WebContents } from 'electron'
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { ItemData } from '../../../shared/types/clipboard'
import type { DragRequest } from '../../../shared/types/clipboard'
import type { ItemStore } from './ItemStore'
import { PATHS } from './paths'
import { formatScreenshotName } from './formats'
import { getFileKind, type FileKind } from './fileType'
import { buildFileDragSvg } from './fileSvg'
import { recordStagedFiles } from './stagedTemp'

interface Staged {
  /** Primary file handed to the OS. */
  file: string
  /** All files (for a multi-file drag). */
  files?: string[]
}

/* ------------------------------------------------------------------ */
/* resvg — optionalDependency, loaded lazily and guarded              */
/* ------------------------------------------------------------------ */

type ResvgCtor = new (svg: string, opts?: unknown) => { render(): { asPng(): Buffer } }
let resvgCtor: ResvgCtor | null | undefined // undefined = not yet tried, null = unavailable
function loadResvg(): ResvgCtor | null {
  if (resvgCtor !== undefined) return resvgCtor
  try {
    resvgCtor = (require('@resvg/resvg-js') as { Resvg: ResvgCtor }).Resvg
  } catch {
    // The native SVG rasterizer is an optionalDependency; without it we fall
    // back to a bundled transparent icon and the OS supplies its own.
    resvgCtor = null
  }
  return resvgCtor
}

/* ------------------------------------------------------------------ */
/* Resolve a DragRequest to concrete data                             */
/* ------------------------------------------------------------------ */

interface Resolved {
  data: ItemData
  /** 1-based sibling index, so sub-drags of one stack get distinct filenames. */
  subIndex?: number
  /** Full text for a text item (preview is truncated in memory). */
  fullText?: string
  /**
   * When the source `ClipboardItem` entered history. Used to name an
   * unlabeled image capture as a Snipping-Tool-style screenshot; a stack's
   * members all share their parent item's timestamp.
   */
  createdAt: number
}

export function resolveDragData(store: ItemStore, req: DragRequest): Resolved | null {
  const item = store.get(req.itemId)
  if (!item) return null

  if (req.memberIndex !== null) {
    if (item.data.kind !== 'stack') return null
    const member = item.data.members[req.memberIndex]
    if (!member) return null
    return { data: member, subIndex: req.memberIndex + 1, createdAt: item.createdAt }
  }

  if (item.data.kind === 'text') {
    return { data: item.data, fullText: store.getFullText(item.id), createdAt: item.createdAt }
  }
  return { data: item.data, createdAt: item.createdAt }
}

/* ------------------------------------------------------------------ */
/* Staging                                                            */
/* ------------------------------------------------------------------ */

const stagedCache = new Map<string, Staged>()
const STAGED_CACHE_MAX = 64

function cacheKey(data: ItemData, subIndex?: number): string {
  switch (data.kind) {
    case 'file':
      return `file:${data.path}`
    case 'image':
      return `img:${data.imageId}:${subIndex ?? 0}`
    case 'text':
      return `text:${data.preview.slice(0, 100)}`
    case 'link':
      return `link:${data.url}`
    case 'stack':
      return `stack:${data.members.map((m) => contentKey(m)).join('|')}`
  }
}

function contentKey(m: Exclude<ItemData, { kind: 'stack' }>): string {
  return m.kind === 'file' ? m.path : m.kind === 'image' ? m.imageId : m.kind === 'link' ? m.url : m.preview.slice(0, 40)
}

/**
 * Basename (no extension) for an image staged out to a temp file.
 *
 * An item that carries an original filename (a web image, a copied file's
 * re-capture) keeps it untouched — Edge-Drop's "Original Filename
 * Preservation". An unlabeled capture (Win+Shift+S, a raw bitmap copy) has no
 * such name, so it gets named the way Windows itself names a screenshot:
 * `Screenshot YYYY-MM-DD HH.MM.SS`, formatted from when the item entered
 * history (not "now" — the drag can happen long after the capture). Pure, so
 * it unit-tests without touching the filesystem or a live clipboard.
 */
export function imageDragBaseName(capturedName: string | null, createdAt: number): string {
  if (capturedName) return capturedName.replace(/\.[^.]+$/, '')
  return formatScreenshotName(new Date(createdAt)).replace(/\.png$/i, '')
}

/** Copy a stored capture into temp under a friendly, collision-free name. */
function stageImage(
  store: ItemStore,
  data: Extract<ItemData, { kind: 'image' }>,
  subIndex: number | undefined,
  temp: string,
  createdAt: number
): string | null {
  const src = store.resolveStoredImagePath(data.imageId)
  if (!src) return null
  const ext = (extname(src).slice(1) || 'png').toLowerCase()
  const baseName = imageDragBaseName(data.capturedName, createdAt)
  const suffix = subIndex && subIndex > 1 ? ` (${subIndex})` : ''
  let dest = join(temp, `${baseName}${suffix}.${ext}`)
  // Distinct siblings in a collection share names; disambiguate by size.
  if (existsSync(dest)) {
    try {
      if (statSync(dest).size !== (data.byteSize || -1)) {
        let n = 2
        do {
          dest = join(temp, `${baseName}${suffix} (${n}).${ext}`)
          n++
        } while (existsSync(dest) && n < 1000)
      }
    } catch {
      /* fall through and overwrite */
    }
  }
  try {
    copyFileSync(src, dest)
    return dest
  } catch {
    return null
  }
}

function stageText(text: string, temp: string): string | null {
  const dest = join(temp, `Snippet_${Date.now().toString(36)}.txt`)
  try {
    writeFileSync(dest, text, 'utf8')
    return dest
  } catch {
    return null
  }
}

/**
 * Resolve an item to concrete file(s) for the OS. `fullText` supplies the
 * un-truncated text for text items (the in-memory preview is capped);
 * `createdAt` is the owning item's capture time, used to name an unlabeled
 * image capture (see `imageDragBaseName`).
 */
export function stageDragFile(store: ItemStore, data: ItemData, subIndex: number | undefined, fullText: string | undefined, createdAt: number): Staged | null {
  const key = cacheKey(data, subIndex)
  const cached = stagedCache.get(key)
  if (cached && existsSync(cached.file)) return cached

  const temp = PATHS.tempDir()
  mkdirSync(temp, { recursive: true })
  let result: Staged | null = null

  switch (data.kind) {
    case 'file': {
      if (!existsSync(data.path)) return null
      result = { file: data.path, files: [data.path] }
      break
    }
    case 'image': {
      const dest = stageImage(store, data, subIndex, temp, createdAt)
      if (!dest) return null
      result = { file: dest, files: [dest] }
      break
    }
    case 'text': {
      const dest = stageText(fullText ?? data.preview, temp)
      if (!dest) return null
      result = { file: dest, files: [dest] }
      break
    }
    case 'link': {
      const dest = stageText(data.url, temp)
      if (!dest) return null
      result = { file: dest, files: [dest] }
      break
    }
    case 'stack': {
      const files: string[] = []
      let idx = 1
      for (const member of data.members) {
        if (member.kind === 'file') {
          if (existsSync(member.path)) files.push(member.path)
        } else if (member.kind === 'image') {
          const dest = stageImage(store, member, idx, temp, createdAt)
          if (dest) files.push(dest)
        } else if (member.kind === 'link') {
          const dest = stageText(member.url, temp)
          if (dest) files.push(dest)
        } else {
          const dest = stageText(member.preview, temp)
          if (dest) files.push(dest)
        }
        idx++
      }
      if (!files.length) return null
      result = { file: files[0], files }
      break
    }
  }

  if (result) {
    stagedCache.set(key, result)
    if (stagedCache.size > STAGED_CACHE_MAX) {
      const first = stagedCache.keys().next().value
      if (first) stagedCache.delete(first)
    }
    // Only files we generated inside the managed temp dir are lifecycle-tracked;
    // original user files (file payloads) are never recorded for deletion.
    try {
      recordStagedFiles(data, result.files ?? [result.file])
    } catch {
      /* staging already succeeded */
    }
  }
  return result
}

/* ------------------------------------------------------------------ */
/* Z-band demotion hooks                                              */
/* ------------------------------------------------------------------ */

/**
 * Lets main lower the hub's always-on-top level for the duration of a native
 * OLE drag. Ledge's panels stay always-on-top so they survive alt-tabbing —
 * but that same level sits above every other window while `startDrag` runs
 * its native drag session, so without a demotion the OS delivers the drop
 * back onto our own always-on-top window instead of Explorer/Word underneath.
 *
 * Wired from `electron/main/index.ts` onto `PanelHost`; this module never
 * imports `PanelHost` directly (main constructs the clipboard engine, so a
 * clipboard -> main-owned-window-class import would be a dependency cycle).
 */
export interface DragZBandHooks {
  onDragBegin(): void
  onDragEnd(): void
}

let zBandHooks: DragZBandHooks | null = null

/** `null` clears the hooks; every call site below treats that as a no-op. */
export function setDragZBandHooks(hooks: DragZBandHooks | null): void {
  zBandHooks = hooks
}

/** Longest a drag may hold the demotion, even with no other completion signal. */
const DRAG_ZBAND_TIMEOUT_MS = 30_000

/**
 * Run `fn` (the synchronous `startDrag` call) with the hub demoted for its
 * duration, guaranteed to restore exactly once no matter how the drag ends:
 * `fn` returning normally, the sender's `webContents` going away mid-drag, or
 * — belt and suspenders, since Electron gives no drag-completion event on
 * `WebContents` — a bounded timeout. A stuck demotion would permanently sink
 * the hub behind every other window, which is far worse than restoring early.
 */
function withZBandDemotion(sender: WebContents, fn: () => void): void {
  const hooks = zBandHooks
  if (!hooks) {
    fn()
    return
  }

  let ended = false
  const end = (): void => {
    if (ended) return
    ended = true
    clearTimeout(timer)
    sender.removeListener('destroyed', end)
    try {
      hooks.onDragEnd()
    } catch (err) {
      console.error('[clipboard] onDragEnd hook failed', err)
    }
  }

  const timer = setTimeout(end, DRAG_ZBAND_TIMEOUT_MS)
  ;(timer as unknown as { unref?: () => void }).unref?.()
  sender.once('destroyed', end)

  try {
    hooks.onDragBegin()
  } catch (err) {
    console.error('[clipboard] onDragBegin hook failed', err)
  }

  try {
    fn()
  } finally {
    end()
  }
}

/* ------------------------------------------------------------------ */
/* Public entry points                                                */
/* ------------------------------------------------------------------ */

/** Begin the native drag. Must run inside the `shelf:start-drag` send handler. */
export function startDrag(store: ItemStore, sender: WebContents, req: DragRequest): void {
  const resolved = resolveDragData(store, req)
  if (!resolved) return
  const staged = stageDragFile(store, resolved.data, resolved.subIndex, resolved.fullText, resolved.createdAt)
  if (!staged) return

  const item: Electron.Item = { file: staged.file, icon: dragIcon(resolved.data) }
  if (staged.files && staged.files.length > 1) item.files = staged.files
  withZBandDemotion(sender, () => sender.startDrag(item))
}

/** Warm the temp file + icon while the pointer hovers, so drag start is 0ms. */
export function prestageDrag(store: ItemStore, req: DragRequest): void {
  try {
    const resolved = resolveDragData(store, req)
    if (!resolved) return
    stageDragFile(store, resolved.data, resolved.subIndex, resolved.fullText, resolved.createdAt)
    dragIcon(resolved.data)
  } catch {
    /* prestaging is best-effort */
  }
}

/* ------------------------------------------------------------------ */
/* Drag ghost icon                                                    */
/* ------------------------------------------------------------------ */

const iconCache = new Map<string, Electron.NativeImage>()
const ICON_CACHE_MAX = 64

/** 1x1 transparent PNG. Non-empty, so macOS (which requires a non-empty icon) is happy. */
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)
let emptyIcon: Electron.NativeImage | null = null
function fallbackIcon(): Electron.NativeImage {
  if (emptyIcon && !emptyIcon.isEmpty()) return emptyIcon
  emptyIcon = nativeImage.createFromBuffer(TRANSPARENT_PNG)
  return emptyIcon
}

function renderSvg(svg: string, scale = 2): Electron.NativeImage | null {
  const Resvg = loadResvg()
  if (!Resvg) return null
  try {
    const png = new Resvg(svg, { fitTo: { mode: 'zoom', value: scale } }).render().asPng()
    const img = nativeImage.createFromBuffer(png, { scaleFactor: scale })
    return img.isEmpty() ? null : img
  } catch {
    return null
  }
}

function memberKinds(data: ItemData): { kinds: FileKind[]; count: number } {
  if (data.kind === 'stack') {
    const kinds = data.members.slice(0, 3).map((m) => (m.kind === 'image' ? 'image' : m.kind === 'file' ? fileKindOf(m.path, m.isDirectory) : 'text'))
    return { kinds, count: data.members.length }
  }
  if (data.kind === 'image') return { kinds: ['image'], count: 1 }
  if (data.kind === 'file') return { kinds: [fileKindOf(data.path, data.isDirectory)], count: 1 }
  return { kinds: ['text'], count: 1 }
}

function fileKindOf(path: string, isDirectory: boolean): FileKind {
  return getFileKind(path, isDirectory)
}

function dragIcon(data: ItemData): Electron.NativeImage {
  const cacheable = data.kind !== 'text' && data.kind !== 'link'
  if (data.kind === 'text' || data.kind === 'link') {
    const icon = renderSvg(buildTextDragSvg(data.kind === 'link' ? data.url : data.preview))
    return icon ?? fallbackIcon()
  }
  const { kinds, count } = memberKinds(data)
  const key = `stack|${kinds.join('-')}|${count}`
  if (cacheable) {
    const hit = iconCache.get(key)
    if (hit && !hit.isEmpty()) return hit
  }
  const icon = renderSvg(buildFileDragSvg(kinds, count)) ?? fallbackIcon()
  if (cacheable && !icon.isEmpty()) {
    iconCache.set(key, icon)
    if (iconCache.size > ICON_CACHE_MAX) {
      const first = iconCache.keys().next().value
      if (first) iconCache.delete(first)
    }
  }
  return icon
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;'
  )
}

/** A small quote-card ghost for text/link drags. */
function buildTextDragSvg(text: string): string {
  const cleaned = text.replace(/[\r\n]+/g, ' ').trim()
  let line1 = cleaned.substring(0, 28)
  let line2 = cleaned.substring(28, 56)
  if (cleaned.length > 28 && !/\s/.test(cleaned.charAt(28))) {
    const lastSpace = line1.lastIndexOf(' ')
    if (lastSpace > 15) {
      line1 = cleaned.substring(0, lastSpace)
      line2 = cleaned.substring(lastSpace + 1, lastSpace + 29)
    }
  }
  if (cleaned.length > line1.length + line2.length) line2 = line2.replace(/.{3}$/, '...')
  const width = 330
  const height = 92
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs><clipPath id="tc"><rect x="58" y="0" width="255" height="${height}" /></clipPath></defs>
    <rect x="2" y="2" width="${width - 4}" height="${height - 4}" rx="14" fill="#000000" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" />
    <svg x="18" y="32" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#A0A0A5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
    <g clip-path="url(#tc)">
      <text x="58" y="42" font-family="sans-serif" font-size="15" font-weight="600" fill="#FFFFFF">${escapeXml(line1)}</text>
      ${line2 ? `<text x="58" y="66" font-family="sans-serif" font-size="14" font-weight="400" fill="#A0A0A5">${escapeXml(line2)}</text>` : ''}
    </g>
  </svg>`
}

/** Pre-warm common drag icons in the background so the first drag is instant. */
export function prewarmDragIcons(): void {
  const timer = setTimeout(() => {
    try {
      for (const k of ['pdf', 'word', 'excel', 'text', 'code', 'image', 'file'] as FileKind[]) {
        const icon = renderSvg(buildFileDragSvg([k], 1))
        if (icon) iconCache.set(`stack|${k}|1`, icon)
      }
    } catch {
      /* ignore */
    }
  }, 400)
  ;(timer as unknown as { unref?: () => void }).unref?.()
}
