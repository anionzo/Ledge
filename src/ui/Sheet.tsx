/**
 * Sheet — the slide-over both panels use for detail.
 *
 * The panel is 320 px wide, which is too narrow to hold a master list and a
 * detail view side by side, and a separate window would break the illusion
 * that the panel is part of the screen edge. So detail arrives as a layer over
 * the panel and leaves the same way.
 *
 * Direction is mirrored: it enters from the inner edge, the same edge the
 * panel itself opens towards. Shelf's sheet slides in from the right, Gauge's
 * from the left. The back affordance points the way out.
 *
 * Focus is trapped while open and restored on close, because dismissing a
 * layer and finding the focus ring on <body> is how a keyboard user loses
 * their place in a list of two hundred items.
 */
import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react'
import type { PanelSide } from '../../shared/types/settings'
import { Button } from './Button'
import './styles/sheet.css'

export interface SheetProps {
  open: boolean
  onClose: () => void
  /** The panel's dock edge. The sheet mirrors off it. */
  side: PanelSide
  title: string
  /** Actions pinned to the bottom of the sheet. */
  footer?: ReactNode
  /** Localised name for the close control. */
  closeLabel: string
  children: ReactNode
}

/** Everything that can hold focus inside the sheet, in document order. */
const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export function Sheet({ open, onClose, side, title, footer, closeLabel, children }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return

    restoreTo.current = document.activeElement as HTMLElement | null
    // Focus the container, not the first control: the first control is often
    // "delete", and landing on it is an invitation to press space.
    ref.current?.focus()

    return () => {
      restoreTo.current?.focus?.()
    }
  }, [open])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const nodes = ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (!nodes || nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (!first || !last) return
      const active = document.activeElement

      // Wrap by hand. The sheet covers the panel, so tabbing past its last
      // control must not reach the list underneath it.
      if (event.shiftKey && (active === first || active === ref.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    },
    [onClose]
  )

  if (!open) return null

  return (
    <div
      className="bz-sheet"
      data-side={side}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      ref={ref}
      onKeyDown={onKeyDown}
    >
      <header className="bz-sheet-header bz-row">
        <Button
          icon={side === 'left' ? 'chevron-right' : 'chevron-left'}
          label={closeLabel}
          size="sm"
          onClick={onClose}
        />
        <span className="bz-sheet-title bz-row-fill bz-truncate" id={titleId}>
          {title}
        </span>
      </header>

      <div className="bz-sheet-body">{children}</div>

      {footer && <div className="bz-sheet-footer">{footer}</div>}
    </div>
  )
}
