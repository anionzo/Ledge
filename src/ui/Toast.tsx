/**
 * Toast.
 *
 * Presentational only — the queue, the dwell timers and the `ui:toast`
 * subscription live in `src/lib/toasts.ts`, so this primitive stays free of
 * IPC and can be rendered in a test or a settings preview with a literal
 * array.
 *
 * Toasts stack against the inner edge of the panel, above the footer. They
 * never appear at the screen edge side: that is where the panel meets the
 * display border, and a message sliding out of the physical edge of the screen
 * looks like a rendering fault.
 */
import type { PanelSide } from '../../shared/types/settings'
import { Icon } from './Icon'
import './styles/toast.css'

export interface ToastItem {
  id: string
  message: string
  tone: 'info' | 'error'
}

export interface ToastProps {
  toast: ToastItem
  onDismiss: (id: string) => void
  dismissLabel: string
}

export function Toast({ toast, onDismiss, dismissLabel }: ToastProps) {
  return (
    <div className="bz-toast bz-row" data-tone={toast.tone}>
      <Icon name={toast.tone === 'error' ? 'alert' : 'info'} size={12} />
      <span className="bz-toast-message bz-row-fill">{toast.message}</span>
      <button
        type="button"
        className="bz-toast-dismiss"
        onClick={() => onDismiss(toast.id)}
        aria-label={dismissLabel}
        title={dismissLabel}
      >
        <Icon name="close" size={10} />
      </button>
    </div>
  )
}

export interface ToastStackProps {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
  dismissLabel: string
  side: PanelSide
}

export function ToastStack({ toasts, onDismiss, dismissLabel, side }: ToastStackProps) {
  return (
    /*
      `polite` and `atomic=false`: a copy confirmation must not interrupt what
      a screen reader is already saying about the item the user just acted on.
      The region stays mounted even when empty so additions are announced —
      mounting the live region with its first message is a well-known way to
      have that message never read.
    */
    <div
      className="bz-toast-stack"
      data-side={side}
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} dismissLabel={dismissLabel} />
      ))}
    </div>
  )
}
