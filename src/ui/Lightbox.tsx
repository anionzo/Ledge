/**
 * Lightbox — full-window overlay for inspecting an image at full resolution.
 *
 * The preview sheet caps images at 40vh inside a 320 px panel; this is where
 * the user goes to actually look at one. Dismissible by backdrop click, Esc,
 * or the close button, and focus is trapped and restored the same way Sheet
 * does it.
 *
 * Zoom and pan, because "full resolution" is a promise the fit-to-window view
 * cannot keep: a 4K screenshot scaled into a 900 px box is not the pixels the
 * user copied. The wheel zooms about the pointer rather than the centre — the
 * thing under the cursor is the thing being looked at, so it is the thing that
 * should stay put — and a drag pans once there is anything to pan to.
 *
 * Deliberately no zoom animation. A transition on `transform` fights a wheel
 * that emits ten events a second: each one restarts the tween, so the image
 * lags the pointer and arrives somewhere the user did not aim. Direct
 * manipulation should track the input exactly.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from './Button'
import './styles/lightbox.css'

export interface LightboxProps {
  /** Image src to show. Null closes the lightbox. */
  src: string | null
  /** Accessible name / alt for the image. */
  alt: string
  onClose: () => void
  closeLabel: string
}

/** Fit-to-window. Below this the image is scaled down to fit its box by CSS. */
const FIT = 1
/** Far enough in to read a screenshot's smallest text; further is pointless. */
const MAX_SCALE = 8
/** Below fit is a shrink nobody asked for, so this is the floor. */
const MIN_SCALE = FIT
/** One wheel notch. Multiplicative, so each step feels the same at any zoom. */
const WHEEL_STEP = 1.15

interface View {
  scale: number
  x: number
  y: number
}

const RESET: View = { scale: FIT, x: 0, y: 0 }

export function Lightbox({ src, alt, onClose, closeLabel }: LightboxProps) {
  const ref = useRef<HTMLDivElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)
  const [view, setView] = useState<View>(RESET)
  /** Pointer origin and the view it started from, while a pan is in progress. */
  const drag = useRef<{ x: number; y: number; from: View } | null>(null)

  useEffect(() => {
    if (!src) return
    restoreTo.current = document.activeElement as HTMLElement | null
    ref.current?.focus()
    // A new image starts fitted. Carrying the previous one's zoom over would
    // open the next picture already halfway into a corner of it.
    setView(RESET)
    drag.current = null
    return () => {
      restoreTo.current?.focus?.()
    }
  }, [src])

  const zoomed = view.scale > FIT

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        // Esc backs out one step: a zoomed image returns to fit before the
        // overlay closes, so a stray press cannot lose the picture entirely.
        if (zoomed) setView(RESET)
        else onClose()
        return
      }
      if (event.key === '0') setView(RESET)
    },
    [onClose, zoomed]
  )

  /**
   * Zoom about the pointer.
   *
   * The point under the cursor must not move, which fixes the translation:
   * with `p` the pointer in the box's own coordinates, the content offset has
   * to satisfy `p = (p - x) * (next / prev) + xNext`.
   */
  const onWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const box = event.currentTarget.getBoundingClientRect()
    const px = event.clientX - box.left - box.width / 2
    const py = event.clientY - box.top - box.height / 2

    setView((prev) => {
      const factor = event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * factor))
      if (scale === prev.scale) return prev
      // Back at fit there is nothing to be off-centre about, so recentre
      // rather than leaving the image parked where the last pan left it.
      if (scale === FIT) return RESET
      const ratio = scale / prev.scale
      return { scale, x: px - (px - prev.x) * ratio, y: py - (py - prev.y) * ratio }
    })
  }, [])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!zoomed || event.button !== 0) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { x: event.clientX, y: event.clientY, from: view }
    },
    [zoomed, view]
  )

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const start = drag.current
    if (!start) return
    setView({
      scale: start.from.scale,
      x: start.from.x + (event.clientX - start.x),
      y: start.from.y + (event.clientY - start.y)
    })
  }, [])

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  if (!src) return null

  return (
    <div
      className="bz-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      tabIndex={-1}
      ref={ref}
      data-zoomed={zoomed || undefined}
      onKeyDown={onKeyDown}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      // A click that ended a pan is not a dismissal — releasing the drag a few
      // pixels from where it started would otherwise close the picture the
      // user was in the middle of examining.
      onClick={() => {
        if (!zoomed) onClose()
      }}
    >
      <Button
        className="bz-lightbox-close"
        icon="close"
        size="sm"
        label={closeLabel}
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
      />
      {zoomed && (
        <span className="bz-lightbox-scale bz-num" aria-hidden="true">
          {Math.round(view.scale * 100)}%
        </span>
      )}
      {/* Clicking the image itself must not dismiss; only the backdrop does. */}
      <img
        className="bz-lightbox-img"
        src={src}
        alt={alt}
        draggable={false}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => {
          e.stopPropagation()
          // A double-click is the shortcut between the two states people
          // actually want: the whole picture, or a proper look at it.
          setView((prev) => (prev.scale > FIT ? RESET : { scale: 2, x: 0, y: 0 }))
        }}
      />
    </div>
  )
}
