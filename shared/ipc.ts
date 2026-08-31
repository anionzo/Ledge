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
  /** Full text for an item whose preview was truncated. */
  'shelf:full-text': { args: [id: string]; result: string }
  'shelf:copy': { args: [req: DragRequest]; result: boolean }
  'shelf:paste': { args: [req: DragRequest]; result: boolean }
  'shelf:add': { args: [data: ItemData]; result: ClipboardItem[] }
  'shelf:merge': { args: [sourceId: string, targetId: string]; result: MergeResult }
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
  'panel:open': { args: [panel: PanelId]; result: void }
  'panel:close': { args: [panel: PanelId]; result: void }
  'app:quit': { args: []; result: void }
}

export interface PushMap {
  'shelf:items': [items: ClipboardItem[]]
  'gauge:snapshot': [snapshot: QuotaSnapshot]
  'settings:changed': [settings: Settings]
  'panel:cursor-edge': [event: EdgeCursorEvent]
  'panel:toggle': [open: boolean]
  'ui:toast': [toast: { id: string; message: string; tone: 'info' | 'error' }]
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
}
