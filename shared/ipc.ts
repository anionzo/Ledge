/**
 * The IPC contract.
 *
 * Every channel name and payload shape is declared here once, and both the
 * preload bridge and the main-process handlers are typed against it. Adding a
 * channel means adding a line to one of these three maps — a handler with no
 * entry, or an entry with no handler, is a compile error.
 *
 * Three kinds of channel:
 *   Invoke — renderer asks, main answers (`ipcRenderer.invoke`).
 *   Push   — main tells every interested renderer (`webContents.send`).
 *   Send   — renderer tells main, no answer. Used where a round trip would
 *            break something: `startDrag` must be called inside the same tick
 *            as the `dragstart` event or the OS drops the drag.
 */
import type { ClipboardItem, DragRequest, ItemData, MergeResult } from './types/clipboard'
import type { QuotaSnapshot } from './types/quota'
import type { Settings } from './types/settings'
import type { PlatformCapabilities } from './types/platform'

/** Which panel a renderer belongs to. Sent by preload at handshake. */
export type PanelId = 'shelf' | 'gauge' | 'settings'

export interface EdgeCursorEvent {
  /** Distance from the docked edge, in px. */
  distancePx: number
  /** Cursor position along the edge, 0 at the top of the work area. */
  offsetPx: number
  /** True while the cursor is inside the panel's trigger strip. */
  inTriggerZone: boolean
  /**
   * True the moment the cursor presses the docked edge but sits OUTSIDE the
   * trigger strip, so the panel will not open from here. Main only emits the
   * transition, which makes this a once-per-approach signal the renderer can
   * flash a proximity beacon from rather than a 60 Hz strobe.
   */
  edgeMiss: boolean
}

/**
 * A toast raised by the main process.
 *
 * `message` is English, assembled in main where `t()` does not exist. `key`
 * and `params` are what the renderer actually shows when it can — main knows
 * *which* sentence it wants long before it knows what language the user reads
 * it in, so it sends the key and keeps the English as the fallback for a key
 * the running build has no string for.
 */
export interface ToastPush {
  id: string
  message: string
  tone: 'info' | 'error'
  /** An `en` dictionary key. The renderer prefers this over `message`. */
  key?: string
  /** `{placeholder}` values for `key`. */
  params?: Record<string, string | number>
}

/** One scoped clear request. Every field narrows; `null` means "do not narrow". */
export interface ClearQuery {
  /** Pinned items survive. Always true except for the explicit "clear all". */
  keepPinned: boolean
  /**
   * Only items captured within this many ms of now — "clear the last hour"
   * means the hour just gone, not everything before it. `null` is any age.
   *
   * Deliberately the opposite window from `ShelfSettings.autoDeleteHours`,
   * which reaps things once they are OLD. Both exist; they are different
   * jobs, and collapsing them into one field is how "Clear last hour" ends up
   * deleting the entire shelf except the last hour.
   */
  withinMs: number | null
  /** Only these ids — the current filter + search result. `null` is everything. */
  ids: string[] | null
}

/** One display the hub could dock to, as the Settings picker needs it. */
export interface DisplayOption {
  id: number
  /** "Primary · 3840×2160" — already localized-ish, assembled in main. */
  label: string
  /** Work-area size in real pixels, i.e. DIP × scaleFactor. */
  physicalWidth: number
  physicalHeight: number
  scaleFactor: number
  isPrimary: boolean
  workArea: { x: number; y: number; width: number; height: number }
}

/** What the Settings window knows about the update state. */
export interface UpdaterStatus {
  /** Store/MSIX build: updates belong to the store, so Ledge never checks. */
  storeBuild: boolean
  /** Unpackaged dev run: also never checks. */
  supported: boolean
  checking: boolean
  downloading: boolean
  availableVersion: string | null
  downloadedVersion: string | null
  error: string | null
}

export interface InvokeMap {
  /** Everything a renderer needs on first paint. */
  'app:bootstrap': {
    args: []
    result: {
      panelId: PanelId
      settings: Settings
      capabilities: PlatformCapabilities
      version: string
    }
  }

  'settings:get': { args: []; result: Settings }
  /** Partial update; returns the settings as they were actually persisted. */
  'settings:update': { args: [patch: DeepPartial<Settings>]; result: Settings }

  // ── Shelf ────────────────────────────────────────────────────────────────
  'shelf:list': { args: []; result: ClipboardItem[] }
  'shelf:pin': { args: [id: string, pinned: boolean]; result: ClipboardItem[] }
  'shelf:delete': { args: [ids: string[]]; result: ClipboardItem[] }
  'shelf:clear': { args: [keepPinned: boolean]; result: ClipboardItem[] }
  /**
   * Scoped clear. The renderer owns the filter and the search box, so it is the
   * only side that knows what "this view" means — it passes the ids it can see.
   * Main still re-checks `pinned` itself: a pinned item is never deleted by a
   * clear, whatever ids arrive.
   */
  'shelf:clear-query': { args: [query: ClearQuery]; result: ClipboardItem[] }
  /** Full text for an item whose preview was truncated. */
  'shelf:full-text': { args: [id: string]; result: string }
  'shelf:copy': { args: [req: DragRequest]; result: boolean }
  'shelf:paste': { args: [req: DragRequest]; result: boolean }
  'shelf:add': { args: [data: ItemData]; result: ClipboardItem[] }
  'shelf:merge': { args: [sourceId: string, targetId: string]; result: MergeResult }
  /**
   * Gather a multi-selection into one stack. Separate from `shelf:merge`
   * rather than a loop over it: main forms the whole stack or none of it, so a
   * selection that cannot fit never leaves a half-built one behind.
   */
  'shelf:merge-many': { args: [ids: string[]]; result: MergeResult }
  'shelf:split': { args: [req: DragRequest]; result: boolean }
  'shelf:reveal': { args: [path: string]; result: boolean }

  // ── Gauge ────────────────────────────────────────────────────────────────
  'gauge:snapshot': { args: []; result: QuotaSnapshot }
  /** Force a refresh, bypassing per-provider TTL. */
  'gauge:refresh': { args: []; result: QuotaSnapshot }
  /** Probe whether a command exists and returns parseable JSON. */
  'gauge:probe-command': {
    args: [command: string]
    result: { ok: boolean; message: string }
  }
  /**
   * Recent usage samples for one provider, oldest first — the sparkline data.
   * Fetched on demand (opening the detail sheet) rather than pushed, so the
   * per-minute snapshot stream never bloats the live IPC traffic.
   */
  'gauge:history': {
    args: [providerId: string]
    result: import('./types/quota').UsageSample[]
  }

  // ── Windows ──────────────────────────────────────────────────────────────
  /** Take or release mouse input. Ignored where click-through is unsupported. */
  'panel:set-interactive': { args: [interactive: boolean]; result: void }
  /**
   * Grow the panel's window inward by `px`, so a preview can sit BESIDE the
   * blade instead of covering it. `0` restores the plain width.
   */
  'panel:set-extra-width': { args: [px: number]; result: void }
  'panel:open': { args: [panel: PanelId]; result: void }
  'panel:close': { args: [panel: PanelId]; result: void }
  /** Every display the hub could dock to. Read by the Settings picker. */
  'displays:list': { args: []; result: DisplayOption[] }
  'app:quit': { args: []; result: void }

  // ── Updates ──────────────────────────────────────────────────────────────
  'updater:status': { args: []; result: UpdaterStatus }
  /** Explicit "check now". Resolves with the state after the check. */
  'updater:check': { args: []; result: UpdaterStatus }
  'updater:download': { args: []; result: UpdaterStatus }
  /** Quit and install what has been downloaded. Does not return. */
  'updater:quit-and-install': { args: []; result: void }
}

export interface PushMap {
  'shelf:items': [items: ClipboardItem[]]
  'gauge:snapshot': [snapshot: QuotaSnapshot]
  'settings:changed': [settings: Settings]
  'panel:cursor-edge': [event: EdgeCursorEvent]
  'panel:toggle': [open: boolean]
  'ui:toast': [toast: ToastPush]
  /**
   * The updater moved. One channel rather than available/downloaded/error
   * three ways: the Settings banner renders the whole status object anyway, and
   * a single push means it can never show two halves of two different states.
   */
  'updater:status': [status: UpdaterStatus]
}

export interface SendMap {
  /**
   * Begin a native drag. Must run synchronously inside the renderer's
   * `dragstart` handler — an `invoke` round trip loses the OS drag session.
   */
  'shelf:start-drag': { args: [req: DragRequest] }
  /** Warm the temp file and drag icon while the pointer hovers, before drag. */
  'shelf:prestage-drag': { args: [req: DragRequest] }
}

export type InvokeChannel = keyof InvokeMap
export type PushChannel = keyof PushMap
export type SendChannel = keyof SendMap

export type InvokeArgs<C extends InvokeChannel> = InvokeMap[C]['args']
export type InvokeResult<C extends InvokeChannel> = InvokeMap[C]['result']
export type PushArgs<C extends PushChannel> = PushMap[C]
export type SendArgs<C extends SendChannel> = SendMap[C]['args']

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

/** Shape exposed on `window.ledge` by the preload script. */
export interface LedgeBridge {
  invoke<C extends InvokeChannel>(
    channel: C,
    ...args: InvokeArgs<C>
  ): Promise<InvokeResult<C>>
  send<C extends SendChannel>(channel: C, ...args: SendArgs<C>): void
  /** Returns an unsubscribe function. */
  on<C extends PushChannel>(
    channel: C,
    listener: (...args: PushArgs<C>) => void
  ): () => void
  /**
   * The OS path of a dropped File. Electron 44 removed the non-standard
   * `File.path`; `webUtils.getPathForFile` is the replacement and can only be
   * reached from the preload, so the bridge exposes it. Returns '' when the
   * drop carries no real file (a browser drag, a synthetic File).
   */
  getPathForFile(file: File): string
}
