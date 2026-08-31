/**
 * In-memory + on-disk store for clipboard history (Ledge model).
 *
 * Responsibilities:
 *   - Keep an ordered list (most recent first) of `ClipboardItem`.
 *   - Deduplicate by content signature so a re-copy bumps `hitCount` and the
 *     timestamp instead of adding a clone.
 *   - Enforce a size cap, evicting the oldest *unpinned* items.
 *   - Persist the index to `history.json` (encrypted at rest with safeStorage
 *     when the user asked for it and the OS provides a real key store).
 *   - Keep large text on disk (only the 300-char preview in memory) and image
 *     bytes as per-id PNG files under `images/`.
 *
 * Ledge's `stack` payload is the single grouping primitive: merging two items
 * yields a stack, splitting pulls one member back out. Stacks never nest and —
 * matching Edge-Drop's rule — never hold text or links.
 */
import { existsSync, readFileSync, writeFileSync, rmSync, readdirSync, closeSync, fsyncSync, mkdirSync, openSync, renameSync, unlinkSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { nativeImage, safeStorage } from 'electron'
import {
  PREVIEW_LIMIT,
  STACK_LIMIT,
  type ClipboardItem,
  type DragRequest,
  type ImagePayload,
  type ItemData,
  type MergeResult,
  type TextPayload
} from '../../../shared/types/clipboard'
import type { Settings } from '../../../shared/types/settings'
import { PATHS } from './paths'
import { createId } from './ids'
import { contentSignature } from './signature'

/** Hard cap on stored text so a pathological megabyte paste can't bloat a payload. */
const MAX_TEXT_BYTES = 500_000

interface Index {
  items: ClipboardItem[]
}

/**
 * Invoked with every batch of items permanently removed from history, no matter
 * which door removed them (delete, clear, cap eviction). The staged-temp
 * lifecycle manager uses it to reap orphaned drag artifacts.
 */
export type ItemsRemovedListener = (removed: readonly ClipboardItem[]) => void

/** A stack member is any non-stack payload. */
type Member = Exclude<ItemData, { kind: 'stack' }>

export class ItemStore {
  private items: ClipboardItem[] = []
  private sigToId = new Map<string, string>()
  private persistTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly getSettings: () => Settings,
    private readonly onRemoved?: ItemsRemovedListener
  ) {}

  /* ------------------------------- load/save ------------------------------ */

  /** Load persisted state from disk. Called once at startup. */
  load(): void {
    this.items = []
    this.sigToId.clear()
    try {
      const file = PATHS.indexFile()
      if (!existsSync(file)) return

      const raw = readFileSync(file, 'utf8').trim()
      let parsed: unknown = null
      try {
        parsed = JSON.parse(raw)
      } catch {
        // Not JSON at all (or an old raw DPAPI blob from Edge-Drop): keep a copy
        // and start fresh rather than crash.
        this.backupUnreadable(file)
        return
      }

      const index = this.decodeIndex(parsed)
      if (!index) {
        this.backupUnreadable(file)
        return
      }
      this.items = index.items.filter((it) => it && it.data && typeof it.id === 'string')
      // Any text item missing an on-disk payload but longer than the preview is
      // migrated to disk so memory stays flat regardless of how it was written.
      for (const it of this.items) {
        if (it.data.kind === 'text' && it.data.truncated && !existsSync(this.textPayloadPath(it.id))) {
          // Full text is unrecoverable (never spilled); mark as not-truncated so
          // getFullText returns the preview rather than an empty read.
          it.data.truncated = false
        }
      }
      this.rebuildIndex()
    } catch (err) {
      console.error('[ItemStore] failed to load history, starting empty', err)
      this.items = []
      this.sigToId.clear()
    }
  }

  /**
   * Decode a parsed history file into an `Index`, or null when it is not one we
   * understand. Handles both the plaintext envelope and the safeStorage one, and
   * — per the migration contract — treats an old Edge-Drop DPAPI file that fails
   * to decode into our shape as "unreadable" instead of throwing.
   */
  private decodeIndex(parsed: unknown): Index | null {
    if (!parsed || typeof parsed !== 'object') return null
    const obj = parsed as Record<string, unknown>

    if (obj['encrypted'] === true && typeof obj['payload'] === 'string') {
      if (!safeStorage.isEncryptionAvailable()) {
        console.warn('[ItemStore] history is encrypted but safeStorage is unavailable; starting empty')
        return null
      }
      try {
        const json = safeStorage.decryptString(Buffer.from(obj['payload'], 'base64'))
        const inner: unknown = JSON.parse(json)
        return this.asIndex(inner)
      } catch (err) {
        // Wrong key (another machine/user) or a foreign DPAPI blob — skip safely.
        console.warn('[ItemStore] could not decrypt history; starting empty', err)
        return null
      }
    }
    return this.asIndex(obj)
  }

  private asIndex(value: unknown): Index | null {
    if (value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items)) {
      return { items: (value as { items: ClipboardItem[] }).items }
    }
    return null
  }

  private backupUnreadable(file: string): void {
    try {
      const dest = `${file}.unreadable.${Date.now()}.bak`
      if (existsSync(file) && !existsSync(dest)) renameSync(file, dest)
      console.warn(`[ItemStore] unreadable history preserved at ${dest}`)
    } catch {
      /* nothing useful to do */
    }
  }

  private rebuildIndex(): void {
    this.sigToId.clear()
    for (const it of this.items) this.sigToId.set(it.signature, it.id)
  }

  /** Debounced disk write; coalesces bursts of mutations. */
  private persist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      this.persistSync()
    }, 150)
  }

  /** Synchronous, atomic disk write (temp file + fsync + rename). */
  persistSync(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    try {
      const index: Index = { items: this.items }
      const plain = JSON.stringify(index)
      let contents: string
      if (this.getSettings().shelf.encryptHistory && safeStorage.isEncryptionAvailable()) {
        const payload = safeStorage.encryptString(plain).toString('base64')
        contents = JSON.stringify({ v: 2, encrypted: true, payload }, null, 2)
      } else {
        // Plaintext on disk: either the user opted out, or the OS has no
        // hardware-backed key store (Linux without a keyring), in which case
        // encrypting would only obfuscate. Documented, deliberate fallback.
        contents = JSON.stringify({ v: 2, ...index }, null, 2)
      }
      this.writeAtomic(PATHS.indexFile(), contents)
    } catch (err) {
      console.error('[ItemStore] persist failed', err)
    }
  }

  private writeAtomic(path: string, contents: string): void {
    const tmp = `${path}.${process.pid}.tmp`
    try {
      mkdirSync(PATHS.root(), { recursive: true })
      const fd = openSync(tmp, 'w')
      try {
        writeSync(fd, contents)
        fsyncSync(fd) // rename is only crash-atomic once the bytes are on disk
      } finally {
        closeSync(fd)
      }
      renameSync(tmp, path)
    } catch (err) {
      console.error('[ItemStore] atomic write failed', err)
      try {
        if (existsSync(tmp)) unlinkSync(tmp)
      } catch {
        /* temp file is inert */
      }
    }
  }

  /* --------------------------------- reads -------------------------------- */

  get(id: string): ClipboardItem | undefined {
    return this.items.find((x) => x.id === id)
  }

  list(): ClipboardItem[] {
    // A shallow copy so callers (IPC snapshots, tests) can hold the array while
    // a later mutation splices the internal one.
    return [...this.items]
  }

  /* --------------------------------- add ---------------------------------- */

  /**
   * Add or refresh a piece of content. Returns true when the list changed.
   *
   * A `text` payload arriving here may carry its FULL text in `preview` (that is
   * the `formats`/IPC-in convention); we truncate it to `PREVIEW_LIMIT` and
   * spill the remainder to a payload file, keeping only the preview in memory.
   */
  add(data: ItemData): boolean {
    const sig = contentSignature(data)
    const now = Date.now()

    const existingId = this.sigToId.get(sig)
    if (existingId) {
      const idx = this.items.findIndex((it) => it.id === existingId)
      if (idx >= 0) {
        const it = this.items[idx]
        this.items.splice(idx, 1)
        this.items.unshift({ ...it, hitCount: it.hitCount + 1, updatedAt: now })
        this.persist()
        return true
      }
    }

    const id = createId()
    const stored = data.kind === 'text' ? this.spillText(id, data) : data
    const item: ClipboardItem = {
      id,
      data: stored,
      pinned: false,
      createdAt: now,
      updatedAt: now,
      hitCount: 1,
      signature: sig
    }
    this.items.unshift(item)
    this.sigToId.set(sig, id)
    this.trim()
    this.persist()
    return true
  }

  /** Bump an existing item (e.g. after a paste) to the front without re-adding. */
  touch(id: string): boolean {
    const idx = this.items.findIndex((it) => it.id === id)
    if (idx < 0) return false
    const it = this.items[idx]
    const updated: ClipboardItem = { ...it, hitCount: it.hitCount + 1, updatedAt: Date.now() }
    if (it.pinned) {
      this.items[idx] = updated
    } else {
      this.items.splice(idx, 1)
      this.items.unshift(updated)
    }
    this.persist()
    return true
  }

  /**
   * Record that an item was dragged/pasted *out* of Ledge: bump `hitCount`
   * without reordering (a drag is not a re-copy, so it should not jump to the
   * top the way `touch` does).
   */
  recordHit(id: string): void {
    const it = this.get(id)
    if (!it) return
    it.hitCount += 1
    it.updatedAt = Date.now()
    this.persist()
  }

  /** Split a `text` payload into an in-memory preview plus an on-disk payload file. */
  private spillText(id: string, data: TextPayload): TextPayload {
    let full = data.preview
    if (full.length > MAX_TEXT_BYTES) full = full.slice(0, MAX_TEXT_BYTES)
    const charCount = full.length
    if (charCount > PREVIEW_LIMIT) {
      this.writeTextPayload(id, full)
      return { kind: 'text', preview: full.slice(0, PREVIEW_LIMIT), truncated: true, charCount, html: data.html }
    }
    return { kind: 'text', preview: full, truncated: false, charCount, html: data.html }
  }

  /**
   * Evict oldest *unpinned* items down to `settings.shelf.maxItems`. Walks from
   * the tail (oldest) forward, skipping pinned so favorites survive.
   */
  private trim(): void {
    const limit = this.getSettings().shelf.maxItems
    if (this.items.length <= limit) return
    let over = this.items.length - limit
    const survivors: ClipboardItem[] = []
    const evicted: ClipboardItem[] = []
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]
      if (over > 0 && !it.pinned) {
        this.disownFiles(it)
        evicted.push(it)
        over--
      } else {
        survivors.unshift(it)
      }
    }
    this.items = survivors
    this.notifyRemoved(evicted)
  }

  /* ------------------------------- mutations ------------------------------ */

  setPinned(id: string, pinned: boolean): void {
    const it = this.get(id)
    if (!it || it.pinned === pinned) return
    it.pinned = pinned
    this.persist()
  }

  /** Permanently remove items by id. Deletes owned image/text files. */
  delete(ids: string[]): void {
    if (!ids.length) return
    const set = new Set(ids)
    const removed: ClipboardItem[] = []
    this.items = this.items.filter((it) => {
      if (set.has(it.id)) {
        this.disownFiles(it)
        removed.push(it)
        return false
      }
      return true
    })
    this.persistSync()
    this.notifyRemoved(removed)
  }

  /** Clear history, optionally keeping pinned items. */
  clear(keepPinned: boolean): void {
    const kept: ClipboardItem[] = []
    const removed: ClipboardItem[] = []
    for (const it of this.items) {
      if (keepPinned && it.pinned) kept.push(it)
      else {
        this.disownFiles(it)
        removed.push(it)
      }
    }
    this.items = kept
    this.rebuildIndex()
    this.persistSync()
    this.notifyRemoved(removed)
  }

  /**
   * Merge `source` into `target`, producing a stack on the target item. Text and
   * links cannot be stacked. De-dupes members by signature and refuses to exceed
   * `STACK_LIMIT`.
   */
  merge(sourceId: string, targetId: string): MergeResult {
    if (sourceId === targetId) return { ok: false, stackId: null, reason: 'incompatible' }
    const src = this.get(sourceId)
    const tgt = this.get(targetId)
    if (!src || !tgt) return { ok: false, stackId: null, reason: 'not-found' }
    if (!isStackable(src.data) || !isStackable(tgt.data)) {
      return { ok: false, stackId: null, reason: 'incompatible' }
    }

    const tgtMembers = membersOf(tgt.data)
    const srcMembers = membersOf(src.data)
    const seen = new Set(tgtMembers.map(memberSig))
    const combined = [...tgtMembers, ...srcMembers.filter((m) => !seen.has(memberSig(m)))]
    if (combined.length > STACK_LIMIT) return { ok: false, stackId: null, reason: 'stack-full' }

    // Retarget the target to the combined stack.
    this.sigToId.delete(tgt.signature)
    tgt.data = { kind: 'stack', members: combined }
    tgt.signature = contentSignature(tgt.data)
    this.sigToId.set(tgt.signature, tgt.id)
    tgt.updatedAt = Date.now()

    // Remove the source WITHOUT deleting its files/images — the target owns them
    // now. (disownFiles is intentionally NOT called here.)
    const srcIdx = this.items.findIndex((x) => x.id === src.id)
    if (srcIdx >= 0) this.items.splice(srcIdx, 1)
    this.sigToId.delete(src.signature)

    this.persist()
    return { ok: true, stackId: tgt.id, reason: 'ok' }
  }

  /**
   * Split one member out of a stack into its own item, placed right after the
   * source. When the stack drops to a single member it collapses back into that
   * bare payload. `memberIndex` must point at a real member.
   */
  split(req: DragRequest): boolean {
    if (req.memberIndex === null) return false
    const idx = this.items.findIndex((x) => x.id === req.itemId)
    if (idx < 0) return false
    const item = this.items[idx]
    if (item.data.kind !== 'stack') return false

    const members = item.data.members
    if (req.memberIndex < 0 || req.memberIndex >= members.length) return false

    const [extracted] = members.splice(req.memberIndex, 1)
    this.sigToId.delete(item.signature)
    if (members.length === 1) {
      item.data = members[0]
    }
    item.signature = contentSignature(item.data)
    this.sigToId.set(item.signature, item.id)

    const now = Date.now()
    const newItem: ClipboardItem = {
      id: createId(),
      data: extracted,
      pinned: false,
      createdAt: now,
      updatedAt: now,
      hitCount: 1,
      signature: contentSignature(extracted)
    }
    this.items.splice(idx + 1, 0, newItem)
    this.sigToId.set(newItem.signature, newItem.id)
    this.persist()
    return true
  }

  /* ------------------------------- text/full ------------------------------ */

  getFullText(id: string): string {
    const item = this.get(id)
    if (!item || item.data.kind !== 'text') return ''
    if (item.data.truncated) {
      try {
        const p = this.textPayloadPath(id)
        if (existsSync(p)) return readFileSync(p, 'utf8')
      } catch {
        /* fall through to preview */
      }
    }
    return item.data.preview
  }

  private textPayloadPath(id: string): string {
    return join(PATHS.payloadsDir(), `${id}.txt`)
  }

  private writeTextPayload(id: string, text: string): void {
    try {
      mkdirSync(PATHS.payloadsDir(), { recursive: true })
      writeFileSync(this.textPayloadPath(id), text, 'utf8')
    } catch {
      /* ignore — worst case fullText falls back to preview */
    }
  }

  /* -------------------------------- images -------------------------------- */

  /** Persist a captured bitmap (always PNG) to `images/<imageId>.png`. */
  stageImageBytes(imageId: string, png: Buffer): void {
    try {
      mkdirSync(PATHS.imagesDir(), { recursive: true })
      writeFileSync(this.getImagePath(imageId), png)
    } catch {
      /* ignore */
    }
  }

  /** Canonical path for a stored capture. Captures are always PNG. */
  getImagePath(imageId: string): string {
    return join(PATHS.imagesDir(), `${imageId}.png`)
  }

  /**
   * Resolve a stored image on disk, recovering via a directory scan when the
   * `.png` path is missing. Returns null only when genuinely unrecoverable.
   */
  resolveStoredImagePath(imageId: string): string | null {
    if (!imageId) return null
    const primary = this.getImagePath(imageId)
    if (existsSync(primary)) return primary
    try {
      const dir = PATHS.imagesDir()
      for (const f of readdirSync(dir)) {
        if (f.startsWith(`${imageId}.`)) return join(dir, f)
      }
    } catch {
      /* ignore */
    }
    return null
  }

  /** Best-effort dimensions for a stored image (used when re-hydrating). */
  imageSize(imageId: string): { width: number; height: number } | null {
    try {
      const p = this.resolveStoredImagePath(imageId)
      if (!p) return null
      const img = nativeImage.createFromPath(p)
      if (img.isEmpty()) return null
      return img.getSize()
    } catch {
      return null
    }
  }

  private removeImageFile(imageId: string): void {
    try {
      const dir = PATHS.imagesDir()
      if (!existsSync(dir)) return
      for (const f of readdirSync(dir)) {
        if (f.startsWith(`${imageId}.`)) rmSync(join(dir, f), { force: true })
      }
    } catch {
      /* ignore */
    }
  }

  private removeTextPayload(id: string): void {
    try {
      const p = this.textPayloadPath(id)
      if (existsSync(p)) rmSync(p, { force: true })
    } catch {
      /* ignore */
    }
  }

  /**
   * Release the on-disk artifacts a removed item owned: its own image PNGs and
   * text payload. Never touches real user files referenced by `file` payloads.
   */
  private disownFiles(it: ClipboardItem): void {
    this.sigToId.delete(it.signature)
    for (const imageId of imageIdsOf(it.data)) this.removeImageFile(imageId)
    if (it.data.kind === 'text') this.removeTextPayload(it.id)
  }

  private notifyRemoved(removed: ClipboardItem[]): void {
    if (removed.length === 0) return
    try {
      this.onRemoved?.(removed)
    } catch (err) {
      console.error('[ItemStore] onRemoved listener failed', err)
    }
  }
}

/* ------------------------------- pure helpers ----------------------------- */

/** Text and links are never stacked. */
function isStackable(data: ItemData): boolean {
  if (data.kind === 'stack') return true
  return data.kind === 'image' || data.kind === 'file'
}

/** A payload's members: the stack's own members, or the item as a singleton. */
function membersOf(data: ItemData): Member[] {
  return data.kind === 'stack' ? [...data.members] : [data as Member]
}

/** Dedup key for a member inside a stack. */
function memberSig(m: Member): string {
  return contentSignature(m)
}

/** Every stored-image id a payload owns (recursing stacks). */
function imageIdsOf(data: ItemData): string[] {
  if (data.kind === 'image') return [data.imageId]
  if (data.kind === 'stack') {
    return data.members.filter((m): m is ImagePayload => m.kind === 'image').map((m) => m.imageId)
  }
  return []
}
