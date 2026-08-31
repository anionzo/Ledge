/**
 * Guarded runtime module loading.
 *
 * The platform layer never *statically* imports `electron` or `koffi` for
 * their values — only for their types, which erase at compile time. Two
 * reasons, both load-bearing:
 *
 *  1. Degradation. `koffi` is an optionalDependency; on a machine where its
 *     prebuilt binary did not install, a static import is a hard crash at
 *     startup. Going through here turns that into `null`, which every caller
 *     already has to handle because a non-Windows OS produces `null` too.
 *
 *  2. Testability. `tests/platform.test.ts` has to construct all three
 *     adapters on whatever machine CI happens to be, including one where
 *     Electron is not resolvable from a plain Node process. A guarded lookup
 *     returns `null` there and the adapters fall back to their no-op paths,
 *     so the interface-conformance test needs no mocking at all.
 *
 * `createRequire` is used rather than `await import()` because the adapter
 * methods it feeds (`applyNoActivate`, `isFullscreenAppActive`) are
 * synchronous by contract — see `PlatformAdapter` in `../types`.
 */
import { createRequire } from 'node:module'

/**
 * Resolved against this file's own URL so lookups walk up from
 * `electron/platform/shared/` and find the app's `node_modules`, both in the
 * electron-vite dev server and in a packaged asar.
 */
const nativeRequire = createRequire(import.meta.url)

const cache = new Map<string, unknown>()

/**
 * `require(id)`, or `null` if the module is missing or throws while loading.
 * The result — including the `null` — is memoised, so a missing optional
 * dependency costs one failed resolution for the life of the process instead
 * of one per call on a polling path.
 */
export function tryRequire<T>(id: string): T | null {
  if (cache.has(id)) return cache.get(id) as T | null
  let loaded: T | null = null
  try {
    loaded = nativeRequire(id) as T
  } catch {
    // Missing optional dependency, wrong ABI, or not running under Electron.
    // All three are the same thing to a caller: the capability is absent.
    loaded = null
  }
  cache.set(id, loaded)
  return loaded
}

type ElectronModule = typeof import('electron')

/** The Electron main-process module, or `null` outside Electron. */
export function getElectron(): ElectronModule | null {
  return tryRequire<ElectronModule>('electron')
}
