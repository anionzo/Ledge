/**
 * Chip — a compact fact, or a compact toggle.
 *
 * Chips carry the small true things that would otherwise need a sentence: a
 * kind, a count, a "Last known" marker. They default to achromatic, because a
 * chip is chrome. `tone` exists only for the handful that are genuinely
 * carrying status — a stale reading, a critical quota — and reaches for the
 * same severity tokens the rings use so the two never disagree.
 */
import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import './styles/chip.css'

export type ChipTone = 'neutral' | 'ok' | 'warn' | 'critical' | 'accent'

interface ChipCommon {
  children?: ReactNode
  icon?: IconName
  tone?: ChipTone
  /** Removes the border and padding, leaving just the mark and the text. */
  quiet?: boolean
  className?: string
}

interface StaticChip extends ChipCommon {
  onClick?: undefined
  pressed?: undefined
  label?: undefined
}

interface ToggleChip extends ChipCommon {
  onClick: () => void
  /** Present makes it a toggle and announces its state. */
  pressed?: boolean
  /** Required once a chip is interactive — an icon-only chip needs a name. */
  label: string
}

export type ChipProps = StaticChip | ToggleChip

export function Chip(props: ChipProps) {
  const { children, icon, tone = 'neutral', quiet, className } = props
  const classes = ['bz-chip', quiet && 'bz-chip-quiet', className].filter(Boolean).join(' ')

  const content = (
    <>
      {icon && <Icon name={icon} size={11} />}
      {children != null && <span className="bz-chip-text">{children}</span>}
    </>
  )

  if (props.onClick) {
    return (
      <button
        type="button"
        className={classes}
        data-tone={tone}
        onClick={props.onClick}
        aria-pressed={props.pressed}
        aria-label={props.label}
        title={props.label}
      >
        {content}
      </button>
    )
  }

  return (
    <span className={classes} data-tone={tone}>
      {content}
    </span>
  )
}
