/**
 * The single koffi entry point for the Windows adapter.
 *
 * koffi is an `optionalDependency`. It ships a prebuilt native binary per
 * (platform, arch, node ABI), and any of installs-without-a-binary, an ABI
 * mismatch after an Electron major bump, or a locked-down machine that blocks
 * loading unsigned native modules leaves it unusable. Edge-Drop imported it
 * statically at the top of `window.ts` and `fullscreen.ts`; here it is loaded
 * through `tryRequire` on first use so a broken install degrades to "the two
 * Win32 niceties are off" instead of a startup crash.
 *
 * Loading is also what decides two capability flags. `noActivate` and
 * `fullscreenDetection` are reported `true` on Windows only when the DLL
 * functions below actually bound, so the Settings window hides toggles that
 * would silently do nothing on this particular machine.
 */
import { tryRequire } from '../shared/nativeRequire'

/** Minimal structural type for the bit of koffi's API used here. */
interface KoffiLib {
  func: (signature: string) => unknown
}
interface KoffiModule {
  load: (name: string) => KoffiLib
}

export type SetWindowLongPtrFn = (
  hWnd: number | bigint,
  nIndex: number,
  dwNewLong: number | bigint
) => number | bigint
export type GetWindowLongPtrFn = (hWnd: number | bigint, nIndex: number) => number | bigint
export type ShQueryUserNotificationStateFn = (pquns: [number]) => number
export type GetForegroundWindowFn = () => number | bigint
export type GetClassNameAFn = (
  hWnd: number | bigint,
  lpClassName: Buffer,
  nMaxCount: number
) => number

export interface Win32Natives {
  getWindowLongPtr: GetWindowLongPtrFn | null
  setWindowLongPtr: SetWindowLongPtrFn | null
  shQueryUserNotificationState: ShQueryUserNotificationStateFn | null
  getForegroundWindow: GetForegroundWindowFn | null
  getClassNameA: GetClassNameAFn | null
}

const EMPTY: Win32Natives = {
  getWindowLongPtr: null,
  setWindowLongPtr: null,
  shQueryUserNotificationState: null,
  getForegroundWindow: null,
  getClassNameA: null
}

let cached: Win32Natives | null = null

/**
 * Bind the Win32 functions the adapter needs. Memoised, and never throws.
 *
 * Each binding is independent: a machine where `shell32` loads but `user32`
 * does not still gets fullscreen detection, and vice versa. That is why the
 * result is a record of nullable function pointers rather than one
 * all-or-nothing object.
 */
export function loadWin32Natives(): Win32Natives {
  if (cached) return cached

  const koffi = tryRequire<KoffiModule>('koffi')
  if (!koffi || typeof koffi.load !== 'function') {
    console.warn('[platform/win32] koffi unavailable — WS_EX_NOACTIVATE and fullscreen detection are off')
    cached = EMPTY
    return cached
  }

  const natives: Win32Natives = { ...EMPTY }

  try {
    const user32 = koffi.load('user32.dll')
    // SetWindowLongPtrW only exists on 64-bit; on 32-bit Windows the export is
    // SetWindowLongW and koffi throws when the symbol is missing. Both are
    // declared with intptr_t so the same call site works either way.
    try {
      natives.setWindowLongPtr = user32.func(
        'intptr_t SetWindowLongPtrW(uintptr_t hWnd, int nIndex, intptr_t dwNewLong)'
      ) as SetWindowLongPtrFn
    } catch {
      natives.setWindowLongPtr = user32.func(
        'intptr_t SetWindowLongW(uintptr_t hWnd, int nIndex, intptr_t dwNewLong)'
      ) as SetWindowLongPtrFn
    }
    try {
      natives.getWindowLongPtr = user32.func(
        'intptr_t GetWindowLongPtrW(uintptr_t hWnd, int nIndex)'
      ) as GetWindowLongPtrFn
    } catch {
      natives.getWindowLongPtr = user32.func(
        'intptr_t GetWindowLongW(uintptr_t hWnd, int nIndex)'
      ) as GetWindowLongPtrFn
    }
    natives.getForegroundWindow = user32.func(
      'uintptr_t GetForegroundWindow()'
    ) as GetForegroundWindowFn
    natives.getClassNameA = user32.func(
      'int GetClassNameA(uintptr_t hWnd, _Out_ char *lpClassName, int nMaxCount)'
    ) as GetClassNameAFn
  } catch (err) {
    console.error('[platform/win32] user32.dll bindings failed:', err)
  }

  try {
    const shell32 = koffi.load('shell32.dll')
    natives.shQueryUserNotificationState = shell32.func(
      'int SHQueryUserNotificationState(_Out_ int *pquns)'
    ) as ShQueryUserNotificationStateFn
  } catch (err) {
    console.error('[platform/win32] shell32.dll bindings failed:', err)
  }

  cached = natives
  return cached
}

/** Test seam: force the next `loadWin32Natives()` to bind again. */
export function resetWin32Natives(): void {
  cached = null
}
