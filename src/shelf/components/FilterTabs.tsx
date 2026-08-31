/**
 * Kind filter tabs.
 *
 * A row of achromatic pills above the list — All / Text / Links / Images /
 * Files — ported from Edge-Drop's `filters.*`. The active pill is the one place
 * on this strip the rim accent is allowed, so the current filter reads at a
 * glance without a second colour entering the panel.
 *
 * It is a real `radiogroup`: arrow keys move between pills and a roving
 * tabindex keeps the whole row one tab stop, so the filter is reachable from
 * the keyboard without landing on five separate stops between search and list.
 */
import type { KeyboardEvent } from 'react'
import type { ItemFilter } from '../describe'
import { t } from '../../i18n'
import { playButtonClickSound } from '../../lib/soundEffects'
import '../styles/filter-tabs.css'

export interface FilterTabsProps {
  value: ItemFilter
  onChange: (next: ItemFilter) => void
}

const FILTERS: ItemFilter[] = ['all', 'text', 'links', 'images', 'files']

export function FilterTabs({ value, onChange }: FilterTabsProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = FILTERS.indexOf(value)
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0
    if (delta === 0) return
    event.preventDefault()
    const next = FILTERS[(index + delta + FILTERS.length) % FILTERS.length]
    if (next) {
      playButtonClickSound()
      onChange(next)
    }
  }

  return (
    <div
      className="bz-filters bz-row"
      role="radiogroup"
      aria-label={t('shelf.filter.label')}
      onKeyDown={onKeyDown}
    >
      {FILTERS.map((filter) => {
        const active = filter === value
        return (
          <button
            key={filter}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            className="bz-filter"
            data-active={active || undefined}
            onClick={() => {
              if (!active) playButtonClickSound()
              onChange(filter)
            }}
          >
            {t(`shelf.filter.${filter}`)}
          </button>
        )
      })}
    </div>
  )
}
