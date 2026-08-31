/**
 * The renderer's only door to the main process.
 *
 * `shared/ipc.ts` already types every channel, so this file adds no schema of
 * its own. What it adds is the two things every component would otherwise
 * reimplement: a bridge accessor that fails loudly instead of throwing
 * `undefined is not a function` deep inside a render, and React hooks that get
 * subscription teardown and stale-response ordering right.
 *
 * Nothing here retries or caches beyond one in-flight bootstrap. Main owns
 * freshness; the renderer just asks.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type {
  LedgeBridge,
  DeepPartial,
  InvokeArgs,
  InvokeChannel,
  InvokeResult,
  PanelId,
  PushArgs,
  PushChannel,
  SendArgs,
  SendChannel
} from '../../shared/ipc'
import type { Settings } from '../../shared/types/settings'
import type { PlatformCapabilities } from '../../shared/types/platform'
import { setLocale } from '../i18n'

declare global {
  interface Window {
    ledge?: LedgeBridge
  }
}

/** True when preload ran. False in a plain browser tab. */
export function hasBridge(): boolean {
  return typeof window !== 'undefined' && typeof window.ledge === 'object'
}

function bridge(): LedgeBridge {
  const b = typeof window === 'undefined' ? undefined : window.ledge
  if (!b) {
    throw new Error(
      'window.ledge is missing. The preload script did not run for this window.'
    )
  }
  return b
}

export function invoke<C extends InvokeChannel>(
  channel: C,
  ...args: InvokeArgs<C>
): Promise<InvokeResult<C>> {
  return bridge().invoke(channel, ...args)
}

/**
 * Fire-and-forget. Synchronous by contract — `shelf:start-drag` must reach main
 * inside the same tick as the `dragstart` event, so this must never be made
 * async, awaited, or wrapped in a microtask.
 */
export function send<C extends SendChannel>(channel: C, ...args: SendArgs<C>): void {
  bridge().send(channel, ...args)
}

export function on<C extends PushChannel>(
  channel: C,
  listener: (...args: PushArgs<C>) => void
): () => void {
  return bridge().on(channel, listener)
}

// ── Hooks ──────────────────────────────────────────────────────────────────

export interface InvokeResultState<T> {
  data: T | undefined
  error: Error | undefined
  /** True on the first load and on every explicit `reload()`. */
  loading: boolean
  reload: () => void
}

/**
 * Invoke a channel and track the answer.
 *
 * `args` is captured by identity on purpose: pass a literal for a no-arg
 * channel and it stays referentially stable across renders, and pass a memo
 * when there are real arguments. A structural compare here would hide the cost
 * of re-invoking from the caller.
 */
export function useInvoke<C extends InvokeChannel>(
  channel: C,
  args: InvokeArgs<C> = [] as unknown as InvokeArgs<C>
): InvokeResultState<InvokeResult<C>> {
  const [state, setState] = useState<{
    data: InvokeResult<C> | undefined
    error: Error | undefined
    loading: boolean
  }>({ data: undefined, error: undefined, loading: true })

  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    // A generation counter rather than AbortController: `invoke` has no abort,
    // so the best we can do is refuse to apply an answer we no longer want.
    let live = true
    setState((s) => ({ ...s, loading: true }))
    invoke(channel, ...args)
      .then((data) => {
        if (live) setState({ data, error: undefined, loading: false })
      })
      .catch((cause: unknown) => {
        if (live) setState({ data: undefined, error: asError(cause), loading: false })
      })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, args, nonce])

  return { ...state, reload }
}

/**
 * Subscribe to a push channel for the lifetime of the component.
 *
 * The listener is held in a ref so a caller passing an inline arrow does not
 * tear down and re-register the IPC subscription on every render — which would
 * drop pushes that land in the gap.
 */
export function usePush<C extends PushChannel>(
  channel: C,
  listener: (...args: PushArgs<C>) => void
): void {
  const ref = useRef(listener)
  ref.current = listener

  useEffect(() => {
    if (!hasBridge()) return
    return on(channel, ((...args: PushArgs<C>) => {
      ref.current(...args)
    }) as (...args: PushArgs<C>) => void)
  }, [channel])
}

export interface Bootstrap {
  panelId: PanelId
  settings: Settings
  capabilities: PlatformCapabilities
  version: string
}

/**
 * Bootstrap is invoked once per window and shared by every consumer.
 *
 * Three components mounting at once must not produce three round trips, and
 * the capabilities object must be identical across them or `hide this control`
 * decisions could disagree mid-render.
 */
let bootstrapPromise: Promise<Bootstrap> | null = null

export function bootstrap(): Promise<Bootstrap> {
  bootstrapPromise ??= invoke('app:bootstrap')
  return bootstrapPromise
}

export interface SettingsState {
  /** Undefined until bootstrap resolves. Render a skeleton, not defaults. */
  settings: Settings | undefined
  capabilities: PlatformCapabilities | undefined
  panelId: PanelId | undefined
  version: string | undefined
  ready: boolean
  error: Error | undefined
  /** Persists a patch and adopts whatever main says it actually stored. */
  update: (patch: DeepPartial<Settings>) => Promise<void>
  /** True while a write is in flight. */
  saving: boolean
}

/**
 * The settings a window is running under, kept live.
 *
 * Reads come from bootstrap; changes arrive on `settings:changed`, which is
 * also how one window sees an edit made in another. `update` adopts the
 * returned object rather than the patch it sent, because main may clamp a
 * value (height ratio, thresholds) and the UI must show the stored truth.
 */
export function useSettings(): SettingsState {
  const [settings, setSettings] = useState<Settings | undefined>(undefined)
  const [capabilities, setCapabilities] = useState<PlatformCapabilities | undefined>(undefined)
  const [panelId, setPanelId] = useState<PanelId | undefined>(undefined)
  const [version, setVersion] = useState<string | undefined>(undefined)
  const [error, setError] = useState<Error | undefined>(undefined)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let live = true
    bootstrap()
      .then((b) => {
        if (!live) return
        setSettings(b.settings)
        setCapabilities(b.capabilities)
        setPanelId(b.panelId)
        setVersion(b.version)
      })
      .catch((cause: unknown) => {
        if (live) setError(asError(cause))
      })
    return () => {
      live = false
    }
  }, [])

  usePush('settings:changed', (next) => setSettings(next))

  const update = useCallback(async (patch: DeepPartial<Settings>) => {
    setSaving(true)
    try {
      const stored = await invoke('settings:update', patch)
      setSettings(stored)
    } catch (cause: unknown) {
      setError(asError(cause))
      throw cause
    } finally {
      setSaving(false)
    }
  }, [])

  return {
    settings,
    capabilities,
    panelId,
    version,
    ready: settings !== undefined,
    error,
    update,
    saving
  }
}

/**
 * Whether this panel is currently open.
 *
 * Open/close is driven by main (hover, hotkey, focus loss), so the renderer
 * only listens. Used to skip work while hidden and to run the entrance
 * transition. `useSyncExternalStore` keeps it correct if React ever tears.
 */
export function usePanelOpen(initial = true): boolean {
  const openRef = useRef(initial)
  return useSyncExternalStore(
    useCallback((notify: () => void) => {
      if (!hasBridge()) return () => {}
      return on('panel:toggle', (open) => {
        openRef.current = open
        notify()
      })
    }, []),
    () => openRef.current,
    () => initial
  )
}

/**
 * Apply theme and motion preferences to <html>.
 *
 * tokens.css resolves all three theme states from `data-theme` plus
 * `prefers-color-scheme`, and zeroes the durations under
 * `[data-reduce-motion]`. Stamping those two attributes is the whole job — no
 * component reads the theme itself.
 */
export function useThemeAttributes(settings: Settings | undefined): void {
  useEffect(() => {
    if (!settings) return
    const root = document.documentElement
    if (settings.theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', settings.theme)
    root.setAttribute('data-reduce-motion', String(settings.reduceMotion))
    root.lang = settings.language === 'system' ? navigator.language : settings.language
  }, [settings])
}

/**
 * Resolve and apply the user's language.
 *
 * Called during render rather than from an effect, on purpose: `t()` reads a
 * module-level locale, so switching it in an effect would leave the render
 * that triggered the switch showing the previous language until something else
 * happened to re-render. The assignment is idempotent and memoised on the
 * code, so repeating it costs nothing.
 */
export function useLocale(settings: Settings | undefined): string {
  const code = settings?.language ?? 'system'
  return useMemo(() => setLocale(code), [code])
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause))
}
