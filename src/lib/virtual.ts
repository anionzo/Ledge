/**
 * A small vertical windowing hook.
 *
 * The shelf holds up to `maxItems` (default 200, user-raisable) cards, several
 * of which decode an image. Mounting all of them costs a visible hitch on the
 * first open, which is exactly the moment the panel is being judged. So we
 * mount a window and pad it with spacers.
 *
 * No dependency: a virtualiser library is ~15 kB to solve a problem that is
 * one prefix-sum over a heights array, and pulling one in would be the only
 * runtime dependency in the renderer beyond React and Zustand.
 *
 * Heights are estimates per row, corrected by measurement as rows mount — a
 * text card and an image card differ by 40 px, and guessing one number for
 * both makes the scrollbar lie.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export interface VirtualWindowOptions {
  count: number
  /** Best guess for row `index` before it has ever been measured. */
  estimateHeight: (index: number) => number
  /** Rows kept mounted beyond the viewport, so a fast scroll is not blank. */
  overscan?: number
}

export interface VirtualWindow {
  /** Attach to the scrolling element. */
  scrollRef: (node: HTMLElement | null) => void
  /** Index of the first mounted row. */
  start: number
  /** Index after the last mounted row. */
  end: number
  /** Total scrollable height, so the scrollbar is honest. */
  totalHeight: number
  /** Distance from the top of the content to row `start`. */
  offsetTop: number
  /** Attach to each mounted row so its real height replaces the estimate. */
  measureRef: (index: number) => (node: HTMLElement | null) => void
  /** Scroll a row into view. Used by keyboard navigation. */
  scrollToIndex: (index: number) => void
}

export function useVirtualWindow(options: VirtualWindowOptions): VirtualWindow {
  const { count, estimateHeight, overscan = 6 } = options

  const nodeRef = useRef<HTMLElement | null>(null)
  const measured = useRef<Map<number, number>>(new Map())
  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState(0)
  // Bumped whenever a measurement changes a height, to recompute offsets.
  const [revision, setRevision] = useState(0)

  const scrollRef = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node
    if (node) {
      setScrollTop(node.scrollTop)
      setViewport(node.clientHeight)
    }
  }, [])

  useEffect(() => {
    const node = nodeRef.current
    if (!node) return

    const onScroll = () => setScrollTop(node.scrollTop)
    node.addEventListener('scroll', onScroll, { passive: true })

    const observer = new ResizeObserver(() => setViewport(node.clientHeight))
    observer.observe(node)
    setViewport(node.clientHeight)

    return () => {
      node.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [count])

  /** Prefix sums. O(n) per revision, and n is a few hundred. */
  const offsets = useMemo(() => {
    const acc = new Float64Array(count + 1)
    for (let i = 0; i < count; i += 1) {
      acc[i + 1] = (acc[i] ?? 0) + (measured.current.get(i) ?? estimateHeight(i))
    }
    return acc
    // `revision` is the dependency that matters; it changes on measurement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, revision, estimateHeight])

  const totalHeight = offsets[count] ?? 0

  const findIndex = useCallback(
    (y: number) => {
      let lo = 0
      let hi = count
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if ((offsets[mid + 1] ?? 0) <= y) lo = mid + 1
        else hi = mid
      }
      return Math.min(lo, Math.max(0, count - 1))
    },
    [count, offsets]
  )

  const start = Math.max(0, findIndex(scrollTop) - overscan)
  const end = Math.min(count, findIndex(scrollTop + viewport) + overscan + 1)

  /**
   * One ref callback per index, cached.
   *
   * Handing a fresh closure to every row on every render would defeat the
   * `memo` on the cards — the prop would change identity each time — and would
   * make React detach and reattach every ref, which fires the measurement
   * again for rows that did not move.
   */
  const refCache = useRef<Map<number, (node: HTMLElement | null) => void>>(new Map())

  const measureRef = useCallback((index: number) => {
    const cached = refCache.current.get(index)
    if (cached) return cached

    const fn = (node: HTMLElement | null) => {
      if (!node) return
      const height = node.getBoundingClientRect().height
      if (height <= 0) return
      const previous = measured.current.get(index)
      // A 1 px tolerance: sub-pixel layout jitter must not loop us forever.
      if (previous !== undefined && Math.abs(previous - height) < 1) return
      measured.current.set(index, height)
      setRevision((r) => r + 1)
    }
    refCache.current.set(index, fn)
    return fn
  }, [])

  const scrollToIndex = useCallback(
    (index: number) => {
      const node = nodeRef.current
      if (!node || index < 0 || index >= count) return
      const top = offsets[index] ?? 0
      const bottom = offsets[index + 1] ?? top
      if (top < node.scrollTop) node.scrollTop = top
      else if (bottom > node.scrollTop + node.clientHeight) {
        node.scrollTop = bottom - node.clientHeight
      }
    },
    [count, offsets]
  )

  // Measurements keyed by index go stale when the list reorders. Dropping them
  // costs one frame of estimated heights, which is cheaper than rows drawn at
  // the wrong offset.
  useEffect(() => {
    measured.current.clear()
    setRevision((r) => r + 1)
  }, [count])

  return {
    scrollRef,
    start,
    end,
    totalHeight,
    offsetTop: offsets[start] ?? 0,
    measureRef,
    scrollToIndex
  }
}
