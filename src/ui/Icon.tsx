/**
 * The icon set.
 *
 * Hand-drawn inline SVG rather than an icon package: the whole set is under a
 * kilobyte, and an off-the-shelf library would bring its own stroke weight and
 * corner radius into a design language built around one hairline. Every path
 * is drawn on a 16-unit grid with a 1.25 stroke, so an icon sits on the same
 * optical weight as the 1 px rules around it.
 *
 * Icons inherit `currentColor` and never carry their own colour — chrome is
 * achromatic, and the only coloured marks in the product are the quota rings.
 */
import type { CSSProperties } from 'react'
import './styles/icon.css'

export type IconName =
  | 'search'
  | 'close'
  | 'pin'
  | 'pin-filled'
  | 'trash'
  | 'copy'
  | 'refresh'
  | 'settings'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'check'
  | 'alert'
  | 'info'
  | 'text'
  | 'link'
  | 'image'
  | 'file'
  | 'folder'
  | 'stack'
  | 'grip'
  | 'plus'
  | 'minus'
  | 'external'
  | 'lock'
  | 'quit'

/**
 * Path data only. Stroke, size and colour come from the wrapper so a caller
 * cannot desynchronise one icon from the rest.
 */
const PATHS: Record<IconName, string> = {
  search: 'M7.2 2.6a4.6 4.6 0 1 0 0 9.2 4.6 4.6 0 0 0 0-9.2ZM10.6 10.6 13.6 13.6',
  close: 'M4 4 12 12M12 4 4 12',
  pin: 'M9.6 2.4 13.6 6.4M10.9 3.7 8.2 6.4 4.6 7.6 8.4 11.4 9.6 7.8 12.3 5.1M6.4 9.6 2.9 13.1',
  'pin-filled': 'M9.6 2.4 13.6 6.4M10.9 3.7 8.2 6.4 4.6 7.6 8.4 11.4 9.6 7.8 12.3 5.1ZM6.4 9.6 2.9 13.1',
  trash: 'M3.2 4.4h9.6M6.4 4.4V2.8h3.2v1.6M4.6 4.4l.6 8.2h5.6l.6-8.2M6.7 6.6v3.8M9.3 6.6v3.8',
  copy: 'M5.6 5.6h6.8v6.8H5.6zM10.4 5.6V3.6H3.6v6.8h2',
  refresh: 'M13 8a5 5 0 1 1-1.6-3.7M13 2.6v2.9h-2.9',
  settings:
    'M8 5.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8ZM8 1.6l.5 1.6 1.6.4 1.3-1 1.1 1.1-1 1.3.4 1.6 1.6.5v1.5l-1.6.5-.4 1.6 1 1.3-1.1 1.1-1.3-1-1.6.4-.5 1.6H7.2l-.5-1.6-1.6-.4-1.3 1-1.1-1.1 1-1.3-.4-1.6-1.6-.5V7.2l1.6-.5.4-1.6-1-1.3 1.1-1.1 1.3 1 1.6-.4.5-1.6Z',
  'chevron-left': 'M10 3.4 5.4 8 10 12.6',
  'chevron-right': 'M6 3.4 10.6 8 6 12.6',
  'chevron-down': 'M3.4 6 8 10.6 12.6 6',
  check: 'M3.2 8.4 6.4 11.6 12.8 4.8',
  alert: 'M8 2.4 14.4 13.2H1.6ZM8 6.6v3M8 11.3v.1',
  info: 'M8 2.2a5.8 5.8 0 1 0 0 11.6A5.8 5.8 0 0 0 8 2.2ZM8 7.2v4M8 4.8v.1',
  text: 'M3.2 4.4h9.6M3.2 8h9.6M3.2 11.6h5.6',
  link: 'M6.6 9.4 9.4 6.6M6.9 4.6 8.4 3.1a2.7 2.7 0 0 1 3.8 3.8L10.7 8.4M9.1 11.4l-1.5 1.5a2.7 2.7 0 0 1-3.8-3.8L5.3 7.6',
  image: 'M2.4 3.2h11.2v9.6H2.4zM2.4 10.4 5.8 7.2l2.6 2.4 2.2-1.8 3 2.6M10.4 5.8v.1',
  file: 'M4 1.8h5l3 3v9.4H4zM9 1.8V5h3',
  folder: 'M2 3.6h4.2l1.4 1.8h6.4v8.2H2z',
  stack: 'M2.6 5.4 8 2.6l5.4 2.8L8 8.2ZM2.6 8.4 8 11.2l5.4-2.8M2.6 11 8 13.8 13.4 11',
  grip: 'M6 3.4v.1M6 7.4v.1M6 11.4v.1M10 3.4v.1M10 7.4v.1M10 11.4v.1',
  plus: 'M8 3.4v9.2M3.4 8h9.2',
  minus: 'M3.4 8h9.2',
  external: 'M9 3.2h3.8V7M12.4 3.6 7.6 8.4M11.4 9.4v3.4H3.2V4.6h3.4',
  lock: 'M4 7.2h8v6H4zM5.8 7.2V5.4a2.2 2.2 0 0 1 4.4 0v1.8',
  quit: 'M8 2.4v6M11.6 4a5 5 0 1 1-7.2 0'
}

export interface IconProps {
  name: IconName
  /** In px. 14 is the panel default; the header uses 12. */
  size?: number
  /**
   * A label makes the icon a standalone image for assistive tech. Leave it out
   * — the default — when the icon sits next to text or inside a labelled
   * button, where announcing it twice is noise.
   */
  label?: string
  className?: string
  style?: CSSProperties
}

export function Icon({ name, size = 14, label, className, style }: IconProps) {
  return (
    <svg
      className={className ? `bz-icon ${className}` : 'bz-icon'}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      style={style}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

/** Kind glyphs, so shelf cards and the preview sheet never disagree. */
export const KIND_ICON = {
  text: 'text',
  link: 'link',
  image: 'image',
  file: 'file',
  stack: 'stack'
} as const satisfies Record<string, IconName>
