/**
 * Button.
 *
 * Not in the original primitive list, but every panel needs one and three
 * private implementations is how two windows stop looking like one product.
 *
 * Three variants, no more. `ghost` is the default and covers almost
 * everything — an instrument's controls should be legible without being
 * furniture. `primary` uses the rim accent and is allowed once per surface.
 * `danger` uses the critical token and exists only for destructive actions,
 * where the colour genuinely is the information.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import './styles/button.css'

export type ButtonVariant = 'ghost' | 'primary' | 'danger'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: IconName
  children?: ReactNode
  /**
   * Required when there is no visible text. `title` gets it too, because an
   * icon-only control in a 28 px strip needs a tooltip as much as it needs an
   * accessible name.
   */
  label?: string
}

export function Button({
  variant = 'ghost',
  size = 'md',
  icon,
  children,
  label,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const iconOnly = children == null && icon != null
  const classes = ['bz-btn', iconOnly && 'bz-btn-icon', className].filter(Boolean).join(' ')

  return (
    <button
      {...rest}
      type={type}
      className={classes}
      data-variant={variant}
      data-size={size}
      aria-label={label}
      title={label}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 12 : 14} />}
      {children != null && <span className="bz-btn-text">{children}</span>}
    </button>
  )
}
