/**
 * The shared primitive set.
 *
 * Both panels and the settings window import from here and nowhere else in
 * `src/ui`. One entry point is what makes "these two apps became one product"
 * enforceable rather than aspirational — a panel reaching past this barrel to
 * restyle a primitive privately is visible in a diff.
 */
export { Panel, type PanelProps } from './Panel'
export { PanelHeader, type PanelHeaderProps } from './PanelHeader'
export { Ring, type RingProps } from './Ring'
export { Chip, type ChipProps, type ChipTone } from './Chip'
export { Button, type ButtonProps, type ButtonVariant } from './Button'
export { Sheet, type SheetProps } from './Sheet'
export { Icon, KIND_ICON, type IconName, type IconProps } from './Icon'
export { EmptyState, type EmptyStateProps } from './EmptyState'
export { Lightbox, type LightboxProps } from './Lightbox'
export { Toast, ToastStack, type ToastItem } from './Toast'
