/**
 * Adapted from Edge-Drop electron/main/workAreaCache.ts (Apache-2.0).
 *
 * `screen.getAllDisplays()` and `Display.workArea` are cheap in isolation,
 * but `cursorPoll`'s fast tier calls into geometry once per target every
 * 16 ms, and Ledge can have two docked panels live at once. That is a lot of
 * repeated IPC into the browser process for a value that changes only when
 * the display topology actually does — a monitor plugged in, unplugged, or
 * DPI-rescaled. This cache holds the last known work area per display id and
 * only re-reads Electron when one of those change events fires.
 *
 * `version` is exposed alongside the cache so a caller that wants to memoise
 * its *own* derived geometry (a panel's computed bounds, say) can tell "the
 * desktop changed shape" apart from "nothing changed, ask again next tick"
 * without diffing rectangles by hand.
 *
 * This file is the one piece of the seam-probe port allowed to import
 * `electron` — `stickProbe.ts` stays pure so it can be unit-tested against
 * synthetic topologies without a running app.
 */
import { screen, type Rectangle } from 'electron'

export class WorkAreaCache {
  #cache = new Map<number, Rectangle>()
  #primary: Rectangle | null = null
  #version = 0

  #onTopologyChange = (): void => {
    this.invalidate()
  }

  constructor() {
    screen.on('display-added', this.#onTopologyChange)
    screen.on('display-removed', this.#onTopologyChange)
    screen.on('display-metrics-changed', this.#onTopologyChange)
  }

  /**
   * Monotonic counter, bumped every time the display topology changes.
   * Callers that memoise their own geometry can key that memo off this
   * instead of re-deriving it from a rectangle-by-rectangle diff.
   */
  get version(): number {
    return this.#version
  }

  /**
   * Work area for a display id, read from Electron at most once per
   * topology version. Returns `null` if the id no longer resolves to a live
   * display — the caller decides how to fall back (Ledge's panels fall
   * through to the primary display; see `PanelHost.#display`).
   */
  get(displayId: number): Rectangle | null {
    const cached = this.#cache.get(displayId)
    if (cached) return cached

    const display = screen.getAllDisplays().find((d) => d.id === displayId)
    if (!display) return null

    this.#cache.set(displayId, display.workArea)
    return display.workArea
  }

  /**
   * Work area of the primary display — the fallback every panel lands on when
   * the monitor it wanted is gone. Cached on the same topology version as the
   * per-id entries, because it is read just as often: a panel with no display
   * preference asks for it on every single tick.
   */
  primary(): Rectangle {
    if (this.#primary) return this.#primary
    const area = screen.getPrimaryDisplay().workArea
    this.#primary = area
    return area
  }

  /**
   * Drop every cached entry and bump `version`. Called automatically on a
   * topology change event; exposed too, for a caller that has its own reason
   * to distrust the cache (e.g. right after `screen.getAllDisplays()` was
   * already re-read for an unrelated purpose).
   */
  invalidate(): void {
    this.#cache.clear()
    this.#primary = null
    this.#version += 1
  }

  /**
   * Remove the `screen` listeners this cache installed. Without this, every
   * cache instance leaks a permanent Electron listener — fine for the one
   * that lives for the app's lifetime, not fine for one created per test or
   * per short-lived window.
   */
  dispose(): void {
    screen.removeListener('display-added', this.#onTopologyChange)
    screen.removeListener('display-removed', this.#onTopologyChange)
    screen.removeListener('display-metrics-changed', this.#onTopologyChange)
    this.#cache.clear()
    this.#primary = null
  }
}

/**
 * The app-lifetime cache.
 *
 * One instance, not one per panel: the entries are keyed by display id, so a
 * second panel asking about the same monitor should get the answer the first
 * one already paid for. Created lazily because the constructor subscribes to
 * `screen`, which is only available after the app is ready.
 */
let shared: WorkAreaCache | null = null

export function sharedWorkAreaCache(): WorkAreaCache {
  shared ??= new WorkAreaCache()
  return shared
}

/** Release the shared cache's `screen` listeners. Called from app teardown. */
export function disposeSharedWorkAreaCache(): void {
  shared?.dispose()
  shared = null
}
