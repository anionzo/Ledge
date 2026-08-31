/**
 * A shared coarse clock.
 *
 * Every reset countdown in the Gauge has to re-render as time passes, but a
 * per-row `setInterval` would wake the renderer once per provider per tick.
 * One timer, one subscriber list, one re-render for all of them.
 *
 * Thirty seconds, not one: the countdowns are rendered to the minute, so a
 * faster tick would burn wakeups to redraw identical text — and on a panel
 * that is usually hidden behind a screen edge, wakeups are the whole cost.
 */
import { useSyncExternalStore } from 'react'

const TICK_MS = 30_000

const subscribers = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null
let now = Date.now()

function subscribe(callback: () => void): () => void {
  subscribers.add(callback)
  if (timer === null) {
    timer = setInterval(() => {
      now = Date.now()
      subscribers.forEach((notify) => notify())
    }, TICK_MS)
  }
  return () => {
    subscribers.delete(callback)
    if (subscribers.size === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
}

/**
 * Epoch ms, updated every 30 s.
 *
 * The snapshot is a module-level value rather than a fresh `Date.now()` per
 * call: `useSyncExternalStore` compares snapshots by identity, and a value
 * that changes on every read would loop forever.
 */
export function useCoarseNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => now
  )
}
