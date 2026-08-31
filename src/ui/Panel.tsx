/**
 * The panel shell.
 *
 * Both panels are this component with a different `side`. Everything that
 * differs between Shelf and Gauge is content; everything that makes them read
 * as one product — the glass ground, the rim hairline, the header height, the
 * scroll behaviour — lives here and is not overridable by a caller.
 *
 * `data-side` is the only mirroring switch. tokens.css already flips the
 * corner radius, the rim edge and the text alignment from it; layouts inside
 * the panel key off the same attribute rather than inventing their own.
 */
import type { ReactNode, Ref } from 'react'
import type { PanelSide } from '../../shared/types/settings'
import './styles/panel.css'

export interface PanelProps {
  /** Which screen edge this window is docked to. */
  side: PanelSide
  /** Rendered above the scroll area, in the fixed 28 px header band. */
  header?: ReactNode
  /** Pinned below the header and above the body — search, filters. */
  toolbar?: ReactNode
  /** Pinned to the bottom, outside the scroll area — the action bar. */
  footer?: ReactNode
  /**
   * Layers that sit above the whole panel: the sheet, the toast stack. Kept
   * out of the body so they neither scroll with it nor get clipped by it, but
   * still inside `.bz-panel` so the `[data-side]` mirroring rules reach them.
   */
  overlay?: ReactNode
  children: ReactNode
  /**
   * True while main has the panel open. Drives the entrance transition; the
   * durations come from tokens, so reduced motion is already handled.
   */
  open?: boolean
  /** The scrolling element, for virtualisation and scroll restoration. */
  bodyRef?: Ref<HTMLDivElement>
  /** Names the panel for screen readers. */
  label: string
  className?: string
}

export function Panel({
  side,
  header,
  toolbar,
  footer,
  overlay,
  children,
  open = true,
  bodyRef,
  label,
  className
}: PanelProps) {
  return (
    <section
      className={className ? `bz-panel ${className}` : 'bz-panel'}
      data-side={side}
      data-open={open || undefined}
      aria-label={label}
    >
      {header}
      {toolbar && <div className="bz-panel-toolbar">{toolbar}</div>}
      {/*
        tabIndex={-1} rather than 0: the body must be focusable so keyboard
        scrolling works after a click, but putting it in the tab order would
        add a stop between the toolbar and the first card for no gain.
      */}
      <div className="bz-panel-body" ref={bodyRef} tabIndex={-1}>
        {children}
      </div>
      {footer && <div className="bz-panel-footer">{footer}</div>}
      {overlay}
    </section>
  )
}
