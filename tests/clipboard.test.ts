/**
 * Ports the meaningful, live-clipboard-free assertions from Edge-Drop's suite
 * (clipboardWatcher, itemSignature, imageFileStacking, spreadsheetClipboard,
 * snippingTool, stagedTempLifecycle) onto Ledge's `text/link/image/file/stack`
 * model.
 *
 * The classification and signature logic is exercised through the PURE
 * `analyzeSnapshot` / `signatureForSnapshot` functions with hand-built
 * snapshots, so no live clipboard — and no async Electron clipboard mock — is
 * needed. The store tests use a tiny in-memory Electron stub.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const roots = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => {
  class ClipboardItem {
    types: string[] = []
    async getType(): Promise<Blob> {
      return new Blob([])
    }
  }
  return {
    app: {
      getPath: (name: string) => (name === 'userData' ? roots.userData : join(roots.userData, name)),
      getAppPath: () => join(roots.userData, 'app')
    },
    nativeImage: {
      createFromPath: () => ({
        isEmpty: () => false,
        getSize: () => ({ width: 800, height: 600 }),
        toPNG: () => Buffer.from('png'),
        resize: () => ({ toPNG: () => Buffer.from('png') })
      }),
      createFromBuffer: () => ({ isEmpty: () => false, getSize: () => ({ width: 1, height: 1 }), toPNG: () => Buffer.alloc(0) })
    },
    safeStorage: {
      isEncryptionAvailable: () => false,
      encryptString: (s: string) => Buffer.from(s, 'utf8'),
      decryptString: (b: Buffer) => b.toString('utf8')
    },
    powerMonitor: { on: () => {}, removeListener: () => {} },
    clipboard: {
      read: async () => [],
      readText: async () => '',
      write: async () => {},
      writeText: async () => {},
      clear: () => {}
    },
    ClipboardItem,
    protocol: { handle: () => {}, registerSchemesAsPrivileged: () => {} },
    shell: { showItemInFolder: () => {} }
  }
})

import type { ClipSnapshot } from '../electron/features/clipboard/formats'
import * as formats from '../electron/features/clipboard/formats'
import {
  analyzeSnapshot,
  signatureForSnapshot,
  formatTabularDataForClipboard,
  formatScreenshotName,
  isUrlText,
  detectClipboardImageSource
} from '../electron/features/clipboard/formats'
import { ClipboardWatcher } from '../electron/features/clipboard/ClipboardWatcher'
import { contentSignature } from '../electron/features/clipboard/signature'
import { ItemStore } from '../electron/features/clipboard/ItemStore'
import type { ItemData } from '../shared/types/clipboard'
import { PREVIEW_LIMIT, STACK_LIMIT } from '../shared/types/clipboard'
import type { Settings } from '../shared/types/settings'
import { DEFAULT_SETTINGS } from '../shared/types/settings'

/* ------------------------------- fixtures --------------------------------- */

function snap(over: Partial<ClipSnapshot> = {}): ClipSnapshot {
  return { types: [], text: '', html: null, image: null, raw: new Map(), ...over }
}

function imageSnap(width: number, height: number, types: string[], text = '', html: string | null = null): ClipSnapshot {
  return snap({ types, text, html, image: { width, height, png: Buffer.from(`${width}x${height}-bytes`) } })
}

function settings(maxItems = 200, encrypt = false): () => Settings {
  const s: Settings = {
    ...DEFAULT_SETTINGS,
    shelf: { ...DEFAULT_SETTINGS.shelf, maxItems, encryptHistory: encrypt }
  }
  return () => s
}

/* ================================ signature =============================== */

describe('contentSignature — dedup identity', () => {
  it('is stable across identical payloads and distinct across content', () => {
    const a: ItemData = { kind: 'text', preview: 'hello', truncated: false, charCount: 5, html: null }
    const b: ItemData = { kind: 'text', preview: 'hello', truncated: false, charCount: 5, html: null }
    expect(contentSignature(a)).toBe(contentSignature(b))
    expect(contentSignature({ ...a, preview: 'world' })).not.toBe(contentSignature(a))
  })

  it('images dedup by dimensions+size, not by minted id', () => {
    const one: ItemData = { kind: 'image', imageId: 'id-1', width: 800, height: 600, byteSize: 1024, capturedName: null }
    const two: ItemData = { kind: 'image', imageId: 'id-2', width: 800, height: 600, byteSize: 1024, capturedName: null }
    expect(contentSignature(one)).toBe(contentSignature(two))
  })

  it('links and files sign by url / path', () => {
    expect(contentSignature({ kind: 'link', url: 'https://a.com', title: null })).toBe('link|https://a.com')
    expect(contentSignature({ kind: 'file', path: '/x/a.pdf', name: 'a.pdf', extension: 'pdf', byteSize: 1, isDirectory: false })).toBe('file|/x/a.pdf')
  })

  it('stack signature reflects member order', () => {
    const f = (p: string): ItemData => ({ kind: 'file', path: p, name: p, extension: '', byteSize: null, isDirectory: false })
    const ab = contentSignature({ kind: 'stack', members: [f('/a'), f('/b')] as never })
    const ba = contentSignature({ kind: 'stack', members: [f('/b'), f('/a')] as never })
    expect(ab).not.toBe(ba)
  })
})

/* ============================ snapshot analysis =========================== */

describe('analyzeSnapshot — classification (snipping tool / spreadsheet / url)', () => {
  it('Snipping Tool window capture (bitmap + window title) => image/screenshot', () => {
    const data = analyzeSnapshot(imageSnap(1920, 1080, ['image/png', 'text/plain'], 'Visual Studio Code - Ledge'), [])
    expect(data?.kind).toBe('image')
    if (data?.kind === 'image') {
      expect(data.width).toBe(1920)
      expect(data.capturedName).toMatch(/^Screenshot .+\.png$/)
    }
    expect(signatureForSnapshot(imageSnap(1920, 1080, ['image/png']), 0, [])).toContain('image:1920x1080:')
  })

  it('browser "Copy Image" with a URL fallback => image, capturedName from url', () => {
    const s = imageSnap(400, 300, ['image/png', 'text/html'], 'https://example.com/photo.png', '<img src="https://example.com/photo.png">')
    const data = analyzeSnapshot(s, [])
    expect(data?.kind).toBe('image')
    if (data?.kind === 'image') expect(data.capturedName).toBe('photo.png')
  })

  it('Excel/Sheets tabular copy (tabs + <table> + bitmap) => text, not image', () => {
    const s = imageSnap(400, 200, ['text/html', 'image/png', 'text/plain'], 'Product\tPrice\nApple\t1.20', '<table><tr><td>Product</td></tr></table>')
    const data = analyzeSnapshot(s, [])
    expect(data?.kind).toBe('text')
    if (data?.kind === 'text') expect(data.preview).toContain('\t')
    expect(signatureForSnapshot(s, 0, [])).toContain('text:Product\tPrice')
  })

  it('a bare URL => link', () => {
    const data = analyzeSnapshot(snap({ types: ['text/plain'], text: 'https://anthropic.com' }), [])
    expect(data?.kind).toBe('link')
    if (data?.kind === 'link') expect(data.url).toBe('https://anthropic.com')
  })

  it('plain code copy => text with no image confusion', () => {
    const data = analyzeSnapshot(snap({ types: ['text/plain'], text: 'const greeting = "hi"' }), [])
    expect(data?.kind).toBe('text')
  })

  it('file paths => a single file, several => a stack of files', () => {
    expect(analyzeSnapshot(snap({ types: ['text/uri-list'] }), ['/docs/a.pdf'])?.kind).toBe('file')
    const many = analyzeSnapshot(snap({ types: ['text/uri-list'] }), ['/docs/a.pdf', '/docs/b.txt'])
    expect(many?.kind).toBe('stack')
    if (many?.kind === 'stack') expect(many.members).toHaveLength(2)
  })

  it('privacy-flagged content is never classified', () => {
    const s = snap({ types: ['text/plain', 'ExcludeClipboardContentFromMonitorProcessing'], text: 'secret' })
    expect(analyzeSnapshot(s, [])).toBeNull()
    expect(signatureForSnapshot(s, 5, [])).toBe('seq:5:excluded')
  })

  it('detectClipboardImageSource keys off advertised format names', () => {
    expect(detectClipboardImageSource(['ScreenShot'], '', '')).toBe('screenshot')
    expect(detectClipboardImageSource(['FileGroupDescriptorW'], '', '')).toBe('image')
  })
})

/* =========================== tabular formatting ========================== */

describe('formatTabularDataForClipboard — spreadsheet write-back', () => {
  it('TSV becomes CRLF text + a standard HTML table', () => {
    const r = formatTabularDataForClipboard('Name\tAge\nAlice\t28')
    expect(r.text).toBe('Name\tAge\r\nAlice\t28')
    expect(r.html).toBe(
      '<table border="0" cellpadding="0" cellspacing="0"><tbody><tr><td>Name</td><td>Age</td></tr><tr><td>Alice</td><td>28</td></tr></tbody></table>'
    )
  })

  it('keeps an existing real <table>, escapes cells, leaves plain multiline HTML-free', () => {
    const existing = '<table class="x"><tr><td>A</td></tr></table>'
    expect(formatTabularDataForClipboard('A\tB', existing).html).toBe(existing)
    expect(formatTabularDataForClipboard('\t<Tom & Jerry>').html).toContain('&lt;Tom &amp; Jerry&gt;')
    expect(formatTabularDataForClipboard('l1\nl2').html).toBeUndefined()
  })
})

/* ============================ screenshot naming ========================== */

describe('formatScreenshotName', () => {
  it('formats "Screenshot YYYY-MM-DD HH.MM.SS.png"', () => {
    expect(formatScreenshotName(new Date(2026, 7, 31, 14, 5, 9))).toBe('Screenshot 2026-08-31 14.05.09.png')
  })
  it('isUrlText recognizes urls', () => {
    expect(isUrlText('https://x.com/a')).toBe(true)
    expect(isUrlText('not a url')).toBe(false)
  })
})

/* ================================ ItemStore ============================== */

describe('ItemStore — dedupe/bump, cap, truncation, merge/split', () => {
  let store: ItemStore

  beforeEach(() => {
    roots.userData = join(tmpdir(), `bz-clip-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    mkdirSync(join(roots.userData, 'images'), { recursive: true })
    mkdirSync(join(roots.userData, 'payloads'), { recursive: true })
    store = new ItemStore(settings())
    store.load()
  })

  afterEach(() => {
    try {
      rmSync(roots.userData, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  })

  const text = (s: string): ItemData => ({ kind: 'text', preview: s, truncated: false, charCount: s.length, html: null })
  const image = (id: string, w = 100, h = 100, bytes = 10): ItemData => ({ kind: 'image', imageId: id, width: w, height: h, byteSize: bytes, capturedName: null })
  const file = (p: string): ItemData => ({ kind: 'file', path: p, name: p, extension: 'bin', byteSize: 1, isDirectory: false })

  it('a re-copy bumps hitCount and moves to front instead of cloning', () => {
    store.add(text('one'))
    store.add(text('two'))
    expect(store.list()).toHaveLength(2)

    store.add(text('one')) // re-copy
    const list = store.list()
    expect(list).toHaveLength(2)
    expect(list[0].data.kind === 'text' && list[0].data.preview).toBe('one')
    expect(list[0].hitCount).toBe(2)
  })

  it('caps at maxItems, evicting oldest unpinned but keeping pinned', () => {
    const capped = new ItemStore(settings(3))
    capped.load()
    capped.add(text('a'))
    const first = capped.list()[0].id
    capped.setPinned(first, true)
    capped.add(text('b'))
    capped.add(text('c'))
    capped.add(text('d')) // over cap of 3
    const list = capped.list()
    expect(list).toHaveLength(3)
    expect(list.some((i) => i.id === first)).toBe(true) // pinned survived
    expect(list.some((i) => i.data.kind === 'text' && i.data.preview === 'b')).toBe(false) // oldest unpinned evicted
  })

  it('stores large text on disk and keeps only the preview in memory', () => {
    const big = 'x'.repeat(PREVIEW_LIMIT + 500)
    store.add(text(big))
    const item = store.list()[0]
    expect(item.data.kind).toBe('text')
    if (item.data.kind === 'text') {
      expect(item.data.preview).toHaveLength(PREVIEW_LIMIT)
      expect(item.data.truncated).toBe(true)
      expect(item.data.charCount).toBe(PREVIEW_LIMIT + 500)
    }
    expect(store.getFullText(item.id)).toBe(big)
    expect(existsSync(join(roots.userData, 'payloads', `${item.id}.txt`))).toBe(true)
  })

  it('merges two images into a stack, a file into an image, and refuses text', () => {
    store.add(image('img-1'))
    store.add(image('img-2', 200, 200, 20))
    let list = store.list()
    const res = store.merge(list[0].id, list[1].id)
    expect(res.ok).toBe(true)
    expect(res.stackId).toBe(list[1].id)
    list = store.list()
    expect(list).toHaveLength(1)
    expect(list[0].data.kind).toBe('stack')
    if (list[0].data.kind === 'stack') expect(list[0].data.members).toHaveLength(2)

    // text cannot be stacked
    store.add(text('note'))
    const l = store.list()
    const bad = store.merge(l.find((i) => i.data.kind === 'text')!.id, l.find((i) => i.data.kind === 'stack')!.id)
    expect(bad.ok).toBe(false)
    expect(bad.reason).toBe('incompatible')
  })

  it('merges a file card into an image card into a mixed stack', () => {
    store.add(image('img-a'))
    store.add(file('/tmp/archive.zip'))
    const list = store.list()
    const img = list.find((i) => i.data.kind === 'image')!
    const fl = list.find((i) => i.data.kind === 'file')!
    const res = store.merge(fl.id, img.id)
    expect(res.ok).toBe(true)
    const merged = store.get(img.id)!
    expect(merged.data.kind).toBe('stack')
    if (merged.data.kind === 'stack') {
      expect(merged.data.members).toHaveLength(2)
      expect(merged.data.members.map((m) => m.kind).sort()).toEqual(['file', 'image'])
    }
  })

  it('refuses a merge that would exceed STACK_LIMIT', () => {
    for (let i = 0; i < STACK_LIMIT; i++) store.add(image(`img-${i}`, 10 + i, 10, i + 1))
    // Fold them all onto the first to build a full stack.
    let target = store.list()[store.list().length - 1].id
    for (const it of [...store.list()].filter((x) => x.id !== target)) {
      store.merge(it.id, target)
      target = store.get(target)!.id
    }
    const stack = store.list().find((i) => i.data.kind === 'stack')!
    expect(stack.data.kind === 'stack' && stack.data.members.length).toBe(STACK_LIMIT)

    store.add(image('one-too-many', 999, 999, 999))
    const extra = store.list().find((i) => i.data.kind === 'image')!
    const res = store.merge(extra.id, stack.id)
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('stack-full')
  })

  it('splits a member out of a stack, collapsing a 2-stack back to a bare item', () => {
    store.add(image('s-1'))
    store.add(file('/tmp/doc.txt'))
    const l = store.list()
    store.merge(l[0].id, l[1].id) // stack on l[1]
    const stack = store.list().find((i) => i.data.kind === 'stack')!
    expect(stack.data.kind === 'stack' && stack.data.members.length).toBe(2)

    const ok = store.split({ itemId: stack.id, memberIndex: 0 })
    expect(ok).toBe(true)
    const after = store.list()
    expect(after).toHaveLength(2)
    // The 2-member stack collapsed to its single remaining member.
    expect(after.find((i) => i.id === stack.id)!.data.kind).not.toBe('stack')
  })

  it('persists and reloads history across instances', () => {
    store.add(text('persisted'))
    store.persistSync()
    const reopened = new ItemStore(settings())
    reopened.load()
    expect(reopened.list()).toHaveLength(1)
    expect(reopened.list()[0].data.kind === 'text' && reopened.list()[0].data.preview).toBe('persisted')
  })

  it('ignores an unreadable/foreign history file instead of crashing', () => {
    writeFileSync(join(roots.userData, 'history.json'), 'not json at all', 'utf8')
    const s = new ItemStore(settings())
    expect(() => s.load()).not.toThrow()
    expect(s.list()).toHaveLength(0)
  })
})

/* =============================== ClipboardWatcher ========================= */

describe('ClipboardWatcher — re-copy detection & pause', () => {
  let watcher: ClipboardWatcher

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    watcher?.stop()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const textData: ItemData = { kind: 'text', preview: 'Hello', truncated: false, charCount: 5, html: null }

  it('seeds silently, then fires once when the OS sequence number bumps on a re-copy', async () => {
    let seq = 100
    vi.spyOn(formats, 'clipboardSignature').mockImplementation(async () => `seq:${seq}:text:Hello`)
    vi.spyOn(formats, 'captureClipboard').mockImplementation(async () => ({ data: textData }))

    const onNew = vi.fn()
    watcher = new ClipboardWatcher(50)
    watcher.start(onNew)

    await vi.advanceTimersByTimeAsync(70) // seed + a tick with no change
    expect(onNew).not.toHaveBeenCalled()

    seq = 101 // same text re-copied; sequence increments
    await vi.advanceTimersByTimeAsync(70) // tick detects change
    await vi.advanceTimersByTimeAsync(250) // settle window fires
    expect(onNew).toHaveBeenCalledTimes(1)
    expect(onNew).toHaveBeenCalledWith(textData)
  })

  it('does not fire while paused', async () => {
    let seq = 300
    vi.spyOn(formats, 'clipboardSignature').mockImplementation(async () => `seq:${seq}:text:x`)
    vi.spyOn(formats, 'captureClipboard').mockImplementation(async () => ({
      data: { kind: 'text', preview: 'x', truncated: false, charCount: 1, html: null }
    }))

    const onNew = vi.fn()
    watcher = new ClipboardWatcher(50)
    watcher.start(onNew)
    watcher.setPaused(true)

    seq = 301
    await vi.advanceTimersByTimeAsync(400)
    expect(onNew).not.toHaveBeenCalled()
  })
})
