/**
 * EmptyState.
 *
 * An empty panel has to say which kind of empty it is. "Nothing on the shelf"
 * and "nothing matches that search" look identical if you only draw a blank
 * area, and the second one is the user's own doing while the first is the
 * app's normal resting state.
 *
 * No illustration. A drawing large enough to be charming would be larger than
 * the 320 px panel can spare, and this surface is a tool the user opens dozens
 * of times a day — a mascot gets old by Wednesday.
 */
import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import './styles/empty-state.css'

export interface EmptyStateProps {
  icon?: IconName
  title: string
  /** One sentence. If it needs two, the state is not empty, it is broken. */
  body?: string
  /** A single recovery action — "Clear search", "Retry". */
  action?: ReactNode
}

export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="bz-empty">
      {icon && <Icon name={icon} size={20} className="bz-empty-icon" />}
      <p className="bz-empty-title">{title}</p>
      {body && <p className="bz-empty-body">{body}</p>}
      {action && <div className="bz-empty-action">{action}</div>}
    </div>
  )
}
