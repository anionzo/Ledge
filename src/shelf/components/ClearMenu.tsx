/**
 * Clear menu.
 *
 * The header carries one destructive control, and clearing history has two
 * shapes: drop everything unpinned (the everyday tidy) or wipe the lot. Both
 * behind one button so the header stays a single affordance, and "Clear all"
 * arms a confirm before it fires — a two hundred item history is not something
 * to lose to a stray click.
 *
 * Ported from Edge-Drop's `ClearMenu`, adapted to Ledge tokens and the
 * `shelf:clear(keepPinned)` contract.
 */
import { useEffect, useRef, useState } from 'react'
import { t } from '../../i18n'
import { Button, Icon } from '../../ui'
import { playButtonClickSound } from '../../lib/soundEffects'
import '../styles/clear-menu.css'

export interface ClearMenuProps {
  disabled: boolean
  /** Closes the menu whenever the panel itself closes. */
  panelOpen: boolean
  /** `keepPinned` — true drops only unpinned, false wipes everything. */
  onClear: (keepPinned: boolean) => void
}

export function ClearMenu({ disabled, panelOpen, onClear }: ClearMenuProps) {
  const [open, setOpen] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!panelOpen) {
      setOpen(false)
      setConfirmAll(false)
    }
  }, [panelOpen])

  useEffect(() => {
    if (!open) {
      setConfirmAll(false)
      return
    }
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const clearUnpinned = () => {
    playButtonClickSound()
    setOpen(false)
    onClear(true)
  }

  const clearAll = () => {
    if (!confirmAll) {
      playButtonClickSound()
      setConfirmAll(true)
      return
    }
    playButtonClickSound()
    setOpen(false)
    onClear(false)
  }

  return (
    <div ref={ref} className="bz-clear-menu">
      <Button
        size="sm"
        icon="trash"
        label={t('shelf.clear.menu')}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          playButtonClickSound()
          setOpen((v) => !v)
        }}
      />

      {open && (
        <div className="bz-clear-pop" role="menu" aria-label={t('shelf.clear.menu')}>
          <button type="button" role="menuitem" className="bz-clear-item" onClick={clearUnpinned}>
            <Icon name="trash" size={12} />
            <span>{t('shelf.clear.unpinned')}</span>
          </button>
          <div className="bz-clear-sep" />
          <button
            type="button"
            role="menuitem"
            className="bz-clear-item"
            data-danger
            data-armed={confirmAll || undefined}
            onClick={clearAll}
          >
            <Icon name="alert" size={12} />
            <span>{confirmAll ? t('shelf.clear.all_confirm') : t('shelf.clear.all')}</span>
          </button>
        </div>
      )}
    </div>
  )
}
