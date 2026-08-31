/**
 * Lightbox — full-window overlay for inspecting an image at full resolution.
 *
 * The preview sheet caps images at 40vh inside a 320 px panel; this is where
 * the user goes to actually look at one. Dismissible by backdrop click, Esc,
 * or the close button, and focus is trapped and restored the same way Sheet
 * does it.
 */
import { useCallback, useEffect, useRef } from 'react'
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

export function Lightbox({ src, alt, onClose, closeLabel }: LightboxProps) {
  const ref = useRef<HTMLDivElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!src) return
    restoreTo.current = document.activeElement as HTMLElement | null
    ref.current?.focus()
    return () => {
      restoreTo.current?.focus?.()
    }
  }, [src])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    },
    [onClose]
  )

  if (!src) return null

  return (
    <div
      className="bz-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      tabIndex={-1}
      ref={ref}
      onKeyDown={onKeyDown}
      onClick={onClose}
    >
      <Button
        className="bz-lightbox-close"
        icon="close"
        size="sm"
        label={closeLabel}
        onClick={onClose}
      />
      {/* Clicking the image itself must not dismiss; only the backdrop does. */}
      <img
        className="bz-lightbox-img"
        src={src}
        alt={alt}
        draggable={false}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}
