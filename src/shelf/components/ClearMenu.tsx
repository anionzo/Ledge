/**
 * Clear menu.
 *
 * The header carries one destructive control, and clearing history is not
 * just "unpinned vs all" — a filtered or searched view narrows what "clear"
 * should mean, and a stale clip from an hour ago is a different problem from
 * one from last week. So the menu offers three timed sweeps scoped to
 * whatever is currently visible, a scope-only unpinned sweep, and the
 * confirmed wipe-everything at the bottom. All five go through
 * `shelf:clear-query`; the plain `shelf:clear(keepPinned)` channel stays for
 * other callers but this menu no longer uses it.
 *
 * Ported from Edge-Drop's `ClearMenu`, adapted to Ledge tokens and query.
 */
import { useEffect, useRef, useState } from 'react'
import type { ClearQuery } from '../../../shared/ipc'
import { t } from '../../i18n'
import { Button, Chip, Icon } from '../../ui'
import { playButtonClickSound } from '../../lib/soundEffects'
import '../styles/clear-menu.css'

/** One hour in ms, the unit the three timed rows are built from. */
const HOUR_MS = 60 * 60 * 1000

export interface ClearMenuProps {
  disabled: boolean
  /** Closes the menu whenever the panel itself closes. */
  panelOpen: boolean
  /**
   * Ids of the unpinned items visible under the active filter and search, or
   * `null` when that view is the whole shelf (filter All, search empty) —
   * `null` lets main do the O(1) whole-store sweep instead of walking a list
   * that would just be every id anyway.
   */
  visibleUnpinnedIds: string[] | null
  onClearQuery: (query: ClearQuery) => void
}

export function ClearMenu({ disabled, panelOpen, visibleUnpinnedIds, onClearQuery }: ClearMenuProps) {
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

  // The three timed sweeps and the unpinned-in-view sweep all keep pinned
  // items and scope to whatever `visibleUnpinnedIds` currently is — the
  // caller has already reduced that to `null` when the view is the whole
  // shelf, so this component never has to know or care which case it is.
  const clearWindow = (hours: number) => {
    playButtonClickSound()
    setOpen(false)
    onClearQuery({ keepPinned: true, withinMs: hours * HOUR_MS, ids: visibleUnpinnedIds })
  }

  const clearViewUnpinned = () => {
    playButtonClickSound()
    setOpen(false)
    onClearQuery({ keepPinned: true, withinMs: null, ids: visibleUnpinnedIds })
  }

  const clearAll = () => {
    if (!confirmAll) {
      playButtonClickSound()
      setConfirmAll(true)
      return
    }
    playButtonClickSound()
    setOpen(false)
    onClearQuery({ keepPinned: false, withinMs: null, ids: null })
  }

  // What the timed rows are actually about to touch. `visibleUnpinnedIds` is
  // `null` exactly when nothing is narrowing the list, so a chip reading "in
  // this view" there would be technically true and practically misleading —
  // the row would sweep the whole shelf while claiming a narrower reach.
  const scopeLabel = visibleUnpinnedIds === null
    ? t('shelf.clear.scope_all')
    : t('shelf.clear.scope_view')

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
        // A labelled group of real <button>s, not an ARIA menu: buttons are
        // already Tab-reachable and Enter/Space-activatable, and Escape closes
        // (handled in the effect below). role="menu" would promise a
        // roving-arrow keyboard model this popover doesn't implement, so the
        // honest role is a plain group.
        <div className="bz-clear-pop" role="group" aria-label={t('shelf.clear.menu')}>
          {/* The three timed rows are one family — same scope, same shape,
              only the age differs — so they sit together with a shared scope
              chip rather than each spelling out "in this view" in its own
              label. */}
          <button type="button" className="bz-clear-item" onClick={() => clearWindow(1)}>
            <Icon name="trash" size={12} />
            <span className="bz-row-fill">{t('shelf.clear.last_hour')}</span>
            <Chip quiet>{scopeLabel}</Chip>
          </button>
          <button type="button" className="bz-clear-item" onClick={() => clearWindow(6)}>
            <Icon name="trash" size={12} />
            <span className="bz-row-fill">{t('shelf.clear.last_6h')}</span>
            <Chip quiet>{scopeLabel}</Chip>
          </button>
          <button type="button" className="bz-clear-item" onClick={() => clearWindow(24)}>
            <Icon name="trash" size={12} />
            <span className="bz-row-fill">{t('shelf.clear.last_24h')}</span>
            <Chip quiet>{scopeLabel}</Chip>
          </button>
          <div className="bz-clear-sep" />
          <button type="button" className="bz-clear-item" onClick={clearViewUnpinned}>
            <Icon name="trash" size={12} />
            <span>{t('shelf.clear.view_unpinned')}</span>
          </button>
          <div className="bz-clear-sep" />
          {/* The one row that reaches past pinned items and past the current
              view — set apart by its own separator and, once armed, an
              explicit "everywhere" so the scope of the confirm step is never
              in doubt. */}
          <button
            type="button"
            className="bz-clear-item"
            data-danger
            data-armed={confirmAll || undefined}
            onClick={clearAll}
          >
            <Icon name="alert" size={12} />
            <span className="bz-row-fill">
              {confirmAll ? t('shelf.clear.all_confirm') : t('shelf.clear.all')}
            </span>
            {!confirmAll && <Chip quiet>{t('shelf.clear.scope_all')}</Chip>}
          </button>
        </div>
      )}
    </div>
  )
}
