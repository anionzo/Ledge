/**
 * The clipboard engine: capture + persistence + native drag-out, wired behind a
 * single factory. The main process constructs one `ClipboardEngine`, registers
 * the `ledge://` protocol, and mounts the returned handlers onto the `shelf:*`
 * IPC channels — it owns no clipboard logic of its own.
 *
 * OS-specific behaviour is reached through the injected `PlatformAdapter`
 * (`platform.id`, `platform.runCommand`), never `process.platform`; the one
 * exception is `formats/`, which is the sanctioned home for OS selection.
 */
import { nativeImage, shell, type WebContents } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import type { PlatformAdapter } from '../../platform/types'
import type { Settings } from '../../../shared/types/settings'
import type { ClipboardItem, DragRequest, ItemData, MergeResult } from '../../../shared/types/clipboard'
import type { ClearQuery } from '../../../shared/ipc'
import { ClipboardWatcher } from './ClipboardWatcher'
import { ItemStore } from './ItemStore'
import { ensureDirs } from './paths'
import { formatTabularDataForClipboard } from './formats'
import { writeTextHtml, writeImagePng } from './formats/clip'
import { startDrag as dragStart, prestageDrag as dragPrestage, prewarmDragIcons } from './drag'
import { reconcileTempOnStartup, forgetStagedItems, flushStagedTempRegistry } from './stagedTemp'

export { registerLedgeProtocol, PRIVILEGED_SCHEME, LEDGE_PRIVILEGES } from './imageProtocol'
export { thumbnailUrlForStoredImage, fullUrlForStoredImage, thumbnailUrlForFile } from './imageProtocol'

export interface ClipboardEngineDeps {
  platform: PlatformAdapter
  getSettings: () => Settings
  /** Main wires this to `broadcast('shelf:items', …)`. Fires on every change. */
  onItems: (items: ClipboardItem[]) => void
}

export interface ClipboardEngine {
  start(): void
  stop(): void
  pause(paused: boolean): void
  list(): ClipboardItem[]
  setPinned(id: string, pinned: boolean): ClipboardItem[]
  remove(ids: string[]): ClipboardItem[]
  clear(keepPinned: boolean): ClipboardItem[]
  /**
   * Scoped clear: intersects `ids` (null = every item) and `withinMs`
   * (null = any age), always honouring `keepPinned`. Backs both the plain
   * "clear unpinned/all" menu items (`ids: null, withinMs: null`) and the
   * filter/search/time-window scoped ones.
   */
  clearQuery(query: ClearQuery): ClipboardItem[]
  fullText(id: string): string
  copy(req: DragRequest): boolean
  paste(req: DragRequest): Promise<boolean>
  addData(data: ItemData): ClipboardItem[]
  merge(sourceId: string, targetId: string): MergeResult
  /** Gather a multi-selection into one stack, atomically. */
  mergeMany(ids: string[]): MergeResult
  split(req: DragRequest): boolean
  reveal(path: string): boolean
  startDrag(webContents: WebContents, req: DragRequest): void
  prestageDrag(req: DragRequest): void
}

export function createClipboardEngine(deps: ClipboardEngineDeps): ClipboardEngine {
  const { platform, getSettings, onItems } = deps

  // The removal hook reaps staged drag artifacts owned by items leaving history.
  const store = new ItemStore(getSettings, (removed) => forgetStagedItems(removed))
  const watcher = new ClipboardWatcher(600)

  const broadcast = (): void => {
    try {
      onItems(store.list())
    } catch (err) {
      console.error('[clipboard] onItems failed', err)
    }
  }

  /* ------------------------------- lifecycle ------------------------------ */

  /** Once-a-minute cadence for the auto-delete sweep — a sloppy deadline, not a precise one. */
  const AUTO_DELETE_SWEEP_MS = 60_000
  let autoDeleteTimer: ReturnType<typeof setInterval> | null = null

  /** Re-reads the setting live (never cached) so a mid-session change takes effect on the next tick. */
  function sweepAutoDelete(): void {
    const hours = getSettings().shelf.autoDeleteHours
    if (hours <= 0) return
    const removed = store.clearOlderThan(hours * 3_600_000, true)
    if (removed.length) {
      watcher.resyncSignature()
      broadcast()
    }
  }

  function startAutoDeleteSweep(): void {
    stopAutoDeleteSweep()
    sweepAutoDelete() // catch up on whatever aged out while the app was closed
    autoDeleteTimer = setInterval(sweepAutoDelete, AUTO_DELETE_SWEEP_MS)
    // Never keep the process alive just for the housekeeping sweep.
    ;(autoDeleteTimer as unknown as { unref?: () => void }).unref?.()
  }

  function stopAutoDeleteSweep(): void {
    if (autoDeleteTimer) {
      clearInterval(autoDeleteTimer)
      autoDeleteTimer = null
    }
  }

  function start(): void {
    ensureDirs()
    store.load()
    // Opt-in "wipe unpinned on every launch" runs before the temp reconcile
    // sweep below, so that sweep sees the post-clear truth (no live item keeps
    // a just-cleared item's staged drag file alive).
    if (getSettings().shelf.clearUnpinnedOnRestart) {
      store.clear(true)
      broadcast()
    }
    // Sweep temp once against living history (crash orphans, deleted-item junk).
    reconcileTempOnStartup(store.list())
    prewarmDragIcons()

    watcher.start((data, imagePng) => {
      // Respect incognito even if a race let a capture through.
      if (data.kind === 'image' && imagePng) {
        store.stageImageBytes(data.imageId, imagePng)
      }
      if (store.add(data)) broadcast()
    })

    startAutoDeleteSweep()
  }

  function stop(): void {
    stopAutoDeleteSweep()
    watcher.stop()
    store.persistSync()
    flushStagedTempRegistry()
  }

  function pause(paused: boolean): void {
    watcher.setPaused(paused)
  }

  /* -------------------------------- reads --------------------------------- */

  function list(): ClipboardItem[] {
    return store.list()
  }

  function fullText(id: string): string {
    return store.getFullText(id)
  }

  /* ------------------------------ mutations ------------------------------- */

  function setPinned(id: string, pinned: boolean): ClipboardItem[] {
    store.setPinned(id, pinned)
    broadcast()
    return store.list()
  }

  function remove(ids: string[]): ClipboardItem[] {
    store.delete(ids)
    // Deleted content may still sit on the OS clipboard; resync so the next poll
    // does not re-add it (a genuine later re-copy is still detected as a change).
    watcher.resyncSignature()
    broadcast()
    return store.list()
  }

  function clear(keepPinned: boolean): ClipboardItem[] {
    store.clear(keepPinned)
    watcher.resyncSignature()
    broadcast()
    return store.list()
  }

  function clearQuery(query: ClearQuery): ClipboardItem[] {
    const { keepPinned, withinMs, ids } = query
    // The renderer owns filter/search and hands us the ids it can see; main
    // narrows further by age. Neither `store.clearIds` nor `store.clearOlderThan`
    // alone can express "these ids AND older than N ms" together, so the
    // intersection is computed here and handed to `clearIds`, which still
    // re-checks `keepPinned` itself as the final guard.
    // `withinMs` is a floor, not a ceiling: the timed rows clear what was
    // captured recently. Reaping things once they are OLD is the auto-delete
    // sweep's separate job (`sweepAutoDelete`), and reading this field the
    // other way round would make "Clear last hour" wipe everything else.
    const floor = withinMs === null ? null : Date.now() - withinMs
    const idSet = ids === null ? null : new Set(ids)
    const targets = store
      .list()
      .filter((it) => (idSet === null || idSet.has(it.id)) && (floor === null || it.createdAt >= floor))
      .map((it) => it.id)
    store.clearIds(targets, keepPinned)
    watcher.resyncSignature()
    broadcast()
    return store.list()
  }

  function addData(data: ItemData): ClipboardItem[] {
    if (store.add(data)) broadcast()
    return store.list()
  }

  function merge(sourceId: string, targetId: string): MergeResult {
    const result = store.merge(sourceId, targetId)
    if (result.ok) broadcast()
    return result
  }

  function mergeMany(ids: string[]): MergeResult {
    const result = store.mergeMany(ids)
    if (result.ok) broadcast()
    return result
  }

  function split(req: DragRequest): boolean {
    const ok = store.split(req)
    if (ok) broadcast()
    return ok
  }

  function reveal(path: string): boolean {
    if (!path || !existsSync(path)) return false
    try {
      shell.showItemInFolder(path)
      return true
    } catch {
      return false
    }
  }

  /* --------------------------------- drag --------------------------------- */

  function startDrag(webContents: WebContents, req: DragRequest): void {
    dragStart(store, webContents, req)
    // A whole-item drag-out counts as a use; a sub-item drag does not reorder.
    if (req.memberIndex === null) store.recordHit(req.itemId)
  }

  function prestageDrag(req: DragRequest): void {
    dragPrestage(store, req)
  }

  /* --------------------------- copy / paste ------------------------------- */

  function copy(req: DragRequest): boolean {
    const resolved = resolveWrite(req)
    if (!resolved) return false
    // The clipboard API is async on this Electron line, so a truly synchronous
    // write is impossible: we validate the payload, launch the write, and report
    // acceptance. Callers that must observe completion use `paste` (awaited).
    if (!canWrite(resolved.data)) return false
    void writeItem(store, resolved.data, resolved.fullText, platform).catch((err) =>
      console.error('[clipboard] copy write failed', err)
    )
    return true
  }

  async function paste(req: DragRequest): Promise<boolean> {
    const resolved = resolveWrite(req)
    if (!resolved) return false

    const wrote = await writeItem(store, resolved.data, resolved.fullText, platform)
    if (!wrote) return false

    // Bump usage and move an unpinned item to the top (movePastedToTop parity).
    store.touch(req.itemId)
    broadcast()

    // Give the OS a beat to settle the clipboard, then synthesize the paste key
    // into whatever window had focus. Best-effort: a machine without the shell
    // tool just leaves the content on the clipboard for a manual Ctrl/Cmd+V.
    await delay(60)
    await synthesizePaste(platform)

    // The next genuine Ctrl+C — even of this same content — must be detected.
    watcher.invalidateSignature()
    return true
  }

  /** Resolve a request to the payload + full text to write. */
  function resolveWrite(req: DragRequest): { data: ItemData; fullText?: string } | null {
    const item = store.get(req.itemId)
    if (!item) return null
    if (req.memberIndex !== null) {
      if (item.data.kind !== 'stack') return null
      const member = item.data.members[req.memberIndex]
      return member ? { data: member } : null
    }
    if (item.data.kind === 'text') return { data: item.data, fullText: store.getFullText(item.id) }
    return { data: item.data }
  }

  /* --------------------------- clipboard writes --------------------------- */

  /** Whether a payload has something writable on disk right now. */
  function canWrite(data: ItemData): boolean {
    switch (data.kind) {
      case 'text':
      case 'link':
        return true
      case 'image':
        return store.resolveStoredImagePath(data.imageId) !== null
      case 'file':
        return existsSync(data.path)
      case 'stack':
        return data.members.some((m) => canWrite(m))
    }
  }

  return {
    start,
    stop,
    pause,
    list,
    setPinned,
    remove,
    clear,
    clearQuery,
    fullText,
    copy,
    paste,
    addData,
    merge,
    mergeMany,
    split,
    reveal,
    startDrag,
    prestageDrag
  }
}

/* ------------------------------- free helpers ----------------------------- */

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Write any payload onto the system clipboard. text/link/image go through the
 * async clipboard API; file/stack payloads write REAL file references on Windows
 * via `Clipboard.SetFileDropList` (the async API cannot place CF_HDROP), and
 * degrade to newline-joined paths elsewhere.
 */
async function writeItem(
  store: ItemStore,
  data: ItemData,
  fullText: string | undefined,
  platform: PlatformAdapter
): Promise<boolean> {
  if (data.kind === 'text') {
    const formatted = formatTabularDataForClipboard(fullText ?? data.preview, data.html ?? undefined)
    await writeTextHtml(formatted.text, formatted.html ?? null)
    return true
  }
  if (data.kind === 'link') {
    await writeTextHtml(data.url)
    return true
  }
  if (data.kind === 'image') {
    const src = store.resolveStoredImagePath(data.imageId)
    if (!src) return false
    try {
      const png = readFileSync(src)
      // Re-encode through nativeImage so a jpg/webp source becomes valid PNG bytes.
      const img = nativeImage.createFromBuffer(png)
      await writeImagePng(img.isEmpty() ? png : img.toPNG())
      return true
    } catch {
      return false
    }
  }

  // file / stack -> real OS file references where the platform can do it.
  const paths: string[] = []
  const collect = (m: Exclude<ItemData, { kind: 'stack' }>): void => {
    if (m.kind === 'file' && existsSync(m.path)) paths.push(m.path)
    else if (m.kind === 'image') {
      const p = store.resolveStoredImagePath(m.imageId)
      if (p) paths.push(p)
    }
  }
  if (data.kind === 'stack') data.members.forEach(collect)
  else collect(data)
  if (!paths.length) return false

  if (platform.id === 'win32') {
    const ok = await writeFileDropListWin(paths, platform)
    if (ok) return true
  }
  await writeTextHtml(paths.join(platform.id === 'win32' ? '\r\n' : '\n'))
  return true
}

/**
 * Place a CF_HDROP file list on the Windows clipboard atomically via PowerShell.
 * Paths are base64-encoded into the script and the whole script is passed as a
 * UTF-16LE `-EncodedCommand`, so no quoting/escaping can break on `cmd.exe`.
 */
async function writeFileDropListWin(paths: string[], platform: PlatformAdapter): Promise<boolean> {
  try {
    const addLines = paths
      .map((p) => `$c.Add([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(p, 'utf8').toString('base64')}')))|Out-Null`)
      .join(';')
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$c=New-Object System.Collections.Specialized.StringCollection',
      addLines,
      '[Windows.Forms.Clipboard]::SetFileDropList($c)'
    ].join(';')
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    const result = await platform.runCommand(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, { timeoutMs: 3000 })
    return result.ok
  } catch {
    return false
  }
}

/** Synthesize Ctrl/Cmd+V into the previously focused window. Degrades to no-op. */
async function synthesizePaste(platform: PlatformAdapter): Promise<void> {
  try {
    if (platform.id === 'win32') {
      const script = "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"
      const encoded = Buffer.from(script, 'utf16le').toString('base64')
      await platform.runCommand(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, { timeoutMs: 2000 })
    } else if (platform.id === 'darwin') {
      await platform.runCommand(
        `osascript -e 'tell application "System Events" to keystroke "v" using command down'`,
        { timeoutMs: 2000 }
      )
    } else {
      // Linux: xdotool is the common tool but not guaranteed present. Best-effort.
      await platform.runCommand('xdotool key --clearmodifiers ctrl+v', { timeoutMs: 2000 })
    }
  } catch {
    // No synth tool — the content is already on the clipboard for a manual paste.
  }
}
