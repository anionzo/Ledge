/**
 * Toast queue.
 *
 * Lives in `lib` rather than in the Toast primitive so `src/ui` stays free of
 * IPC: the component renders a list it is handed, and this hook is what feeds
 * it. Both panels and the settings window use it, and all three receive the
 * same `ui:toast` push from main.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ToastPush } from '../../shared/ipc'
import { t } from '../i18n'
import { usePush } from './bridge'

export interface ToastRecord {
  id: string
  message: string
  tone: 'info' | 'error'
}

/** How long a toast stays. Errors linger; confirmations are a glance. */
const DWELL_MS: Record<ToastRecord['tone'], number> = {
  info: 2400,
  error: 6000
}

/** More than this on screen at once is a log, not a notification. */
const MAX_VISIBLE = 3

export interface ToastQueue {
  toasts: ToastRecord[]
  /** Raise a toast locally, without a main-process round trip. */
  push: (message: string, tone?: ToastRecord['tone']) => void
  dismiss: (id: string) => void
}

export function useToastQueue(): ToastQueue {
  const [toasts, setToasts] = useState<ToastRecord[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const add = useCallback(
    (toast: ToastRecord) => {
      setToasts((current) => [...current, toast].slice(-MAX_VISIBLE))
      const timer = setTimeout(() => dismiss(toast.id), DWELL_MS[toast.tone])
      timers.current.set(toast.id, timer)
    },
    [dismiss]
  )

  const push = useCallback(
    (message: string, tone: ToastRecord['tone'] = 'info') => {
      add({ id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, message, tone })
    },
    [add]
  )

  // Main sends the sentence it wants plus an English rendering of it. Prefer
  // the key: main cannot reach `t()`, so the string it built is always English
  // no matter what language the rest of the window is in — which is how a
  // fully-translated app ends up popping an English toast.
  usePush('ui:toast', (toast: ToastPush) =>
    add({
      id: toast.id,
      tone: toast.tone,
      message: toast.key ? t(toast.key, toast.params) : toast.message
    })
  )

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      pending.clear()
    }
  }, [])

  return { toasts, push, dismiss }
}
