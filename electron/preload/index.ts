/**
 * The bridge. Everything a renderer can reach lives on `window.ledge`.
 *
 * This file is the security boundary: the windows run with `sandbox: true` and
 * `contextIsolation: true`, so a renderer has no `require`, no `process` and no
 * `ipcRenderer` — only the three functions exposed below. That is worth keeping
 * narrow, because the Shelf renders text the user copied from anywhere.
 *
 * The channel maps in `shared/ipc.ts` are types, and types are gone at runtime.
 * So the allowlists below restate them as values, and the `Missing*` assertions
 * underneath make the compiler reject a channel that was added to a map but not
 * to its list. Forgetting a line here fails the build rather than failing
 * silently at 2am with "no handler registered".
 *
 * Emitted as CommonJS (`out/preload/index.cjs`) — a sandboxed preload is loaded
 * by Electron's own CJS loader and cannot be an ES module.
 */
import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type {
  LedgeBridge,
  InvokeArgs,
  InvokeChannel,
  InvokeResult,
  PushArgs,
  PushChannel,
  SendArgs,
  SendChannel
} from '../../shared/ipc'

const INVOKE_CHANNELS = [
  'app:bootstrap',
  'settings:get',
  'settings:update',
  'shelf:list',
  'shelf:pin',
  'shelf:delete',
  'shelf:clear',
  'shelf:full-text',
  'shelf:copy',
  'shelf:paste',
  'shelf:add',
  'shelf:merge',
  'shelf:split',
  'shelf:reveal',
  'gauge:snapshot',
  'gauge:refresh',
  'gauge:probe-command',
  'gauge:history',
  'panel:set-interactive',
  'panel:open',
  'panel:close',
  'app:quit'
] as const satisfies readonly InvokeChannel[]

const PUSH_CHANNELS = [
  'shelf:items',
  'gauge:snapshot',
  'settings:changed',
  'panel:cursor-edge',
  'panel:toggle',
  'ui:toast'
] as const satisfies readonly PushChannel[]

const SEND_CHANNELS = [
  'shelf:start-drag',
  'shelf:prestage-drag'
] as const satisfies readonly SendChannel[]

/**
 * Exhaustiveness. `satisfies` above proves every listed name is real; these
 * prove the reverse — that every name in the map is listed. Both directions are
 * needed, and a missing entry surfaces as "Type 'shelf:whatever' does not
 * satisfy the constraint 'never'".
 */
type AssertNone<T extends never> = T
type _NoMissingInvoke = AssertNone<Exclude<InvokeChannel, (typeof INVOKE_CHANNELS)[number]>>
type _NoMissingPush = AssertNone<Exclude<PushChannel, (typeof PUSH_CHANNELS)[number]>>
type _NoMissingSend = AssertNone<Exclude<SendChannel, (typeof SEND_CHANNELS)[number]>>

const invokeSet: ReadonlySet<string> = new Set(INVOKE_CHANNELS)
const pushSet: ReadonlySet<string> = new Set(PUSH_CHANNELS)
const sendSet: ReadonlySet<string> = new Set(SEND_CHANNELS)

function reject(kind: string, channel: string): never {
  // Throwing rather than returning undefined: a renderer asking for a channel
  // that does not exist is a bug in this repo, and a silent no-op turns it into
  // a hang somewhere far away from the cause.
  throw new Error(`[ledge] "${channel}" is not a known ${kind} channel`)
}

const ledge: LedgeBridge = {
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeResult<C>> {
    if (!invokeSet.has(channel)) reject('invoke', channel)
    return ipcRenderer.invoke(channel, ...args) as Promise<InvokeResult<C>>
  },

  send<C extends SendChannel>(channel: C, ...args: SendArgs<C>): void {
    if (!sendSet.has(channel)) reject('send', channel)
    ipcRenderer.send(channel, ...args)
  },

  on<C extends PushChannel>(channel: C, listener: (...args: PushArgs<C>) => void): () => void {
    if (!pushSet.has(channel)) reject('push', channel)

    // The IpcRendererEvent is deliberately not forwarded. It carries `sender`
    // and `ports`, which would hand the renderer a way back across the bridge
    // and undo the isolation this file exists to enforce.
    const wrapped = (_event: IpcRendererEvent, ...args: unknown[]): void => {
      listener(...(args as PushArgs<C>))
    }

    ipcRenderer.on(channel, wrapped)
    return () => {
      ipcRenderer.removeListener(channel, wrapped)
    }
  },

  getPathForFile(file: File): string {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  }
}

contextBridge.exposeInMainWorld('ledge', ledge)

declare global {
  interface Window {
    ledge: LedgeBridge
  }
}
