/**
 * The 28 px header band.
 *
 * One uppercase micro-label and one action. The restraint is the point: this
 * strip is the first thing that appears when a panel slides out, and a row of
 * icon buttons at the top of a floating window over someone's editor reads as
 * a toolbar demanding attention rather than an instrument reporting a state.
 *
 * Mirroring: the label always sits against the screen edge and the action
 * against the inner edge, so the two panels are reflections rather than
 * copies. tokens.css reverses the flex direction for `data-side="right"`; the
 * spacer below is what pushes the action to the correct end in both.
 */
import type { ReactNode } from 'react'
import './styles/panel.css'

export interface PanelHeaderProps {
  /** The micro-label. Uppercased and tracked by CSS, not by the caller. */
  title: string
  /**
   * A secondary figure shown next to the title — an item count, a timestamp.
   * Kept in the header so the body never has to spend a row on it.
   */
  meta?: ReactNode
  /** The single header action. More than one belongs in the toolbar. */
  action?: ReactNode
}

export function PanelHeader({ title, meta, action }: PanelHeaderProps) {
  return (
    <header className="bz-panel-header">
      <span className="bz-panel-header-title">{title}</span>
      {meta && <span className="bz-panel-header-meta bz-num">{meta}</span>}
      <span className="bz-panel-header-spacer" />
      {action}
    </header>
  )
}
