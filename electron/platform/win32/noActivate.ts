/**
 * `WS_EX_NOACTIVATE` — the reason Ledge can be clicked without stealing focus.
 *
 * Ported from Edge-Drop's `electron/main/window.ts`.
 *
 * Electron has no API for this. `BrowserWindow({ focusable: false })` is close
 * but is set at construction, disables keyboard input to the window entirely,
 * and on Windows also drops the window out of the alt-tab list in a way that
 * breaks click handling on some shells. What the panel actually wants is the
 * extended window style `WS_EX_NOACTIVATE`: the window still receives mouse
 * messages, but clicking it does not make it the foreground window — so the
 * user's caret stays in the editor they were typing in while they pick a
 * clipboard item off the shelf.
 *
 * That has to go through `SetWindowLongPtrW`, which means FFI, which means
 * koffi. When koffi is not there the function is a no-op and
 * `capabilities.noActivate` is `false`, so the Settings window does not offer
 * the toggle. See `./koffi.ts`.
 */
import type { BrowserWindow } from 'electron'
import { isLiveWindow } from '../shared/window'
import { loadWin32Natives } from './koffi'

/** `GetWindowLongPtr` index for the extended style word. */
const GWL_EXSTYLE = -20
/** Clicking the window does not activate it. */
const WS_EX_NOACTIVATE = 0x08000000

/**
 * Read the HWND out of Electron's native handle buffer.
 *
 * The buffer is pointer-sized, so it is 8 bytes on x64/arm64 and 4 on ia32.
 * Reading the wrong width yields a garbage handle that `SetWindowLongPtrW`
 * then rejects, which is why the width is chosen from the buffer's own length
 * rather than from `process.arch`.
 */
function getHwnd(win: BrowserWindow): number | bigint {
  const handle = win.getNativeWindowHandle()
  if (!handle || handle.length < 4) return 0
  return handle.length >= 8 ? handle.readBigUInt64LE(0) : handle.readUInt32LE(0)
}

/**
 * Add or remove `WS_EX_NOACTIVATE` on `win`. Silent no-op on any failure.
 */
export function applyNoActivate(win: BrowserWindow | null, enabled: boolean): void {
  if (!isLiveWindow(win)) return

  const { getWindowLongPtr, setWindowLongPtr } = loadWin32Natives()
  if (!getWindowLongPtr || !setWindowLongPtr) return

  try {
    const hwnd = getHwnd(win)
    if (!hwnd) return

    const current = Number(getWindowLongPtr(hwnd, GWL_EXSTYLE))
    const next = enabled ? current | WS_EX_NOACTIVATE : current & ~WS_EX_NOACTIVATE
    // Skip the write when nothing changes: SetWindowLongPtr on the ex-style
    // word can trigger a non-client repaint, and this runs on show/hide.
    if (next !== current) {
      setWindowLongPtr(hwnd, GWL_EXSTYLE, next)
    }
  } catch (err) {
    console.error('[platform/win32] WS_EX_NOACTIVATE failed:', err)
  }
}
