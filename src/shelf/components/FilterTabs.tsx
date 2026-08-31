/**
 * Kind filter tabs.
 *
 * A row of achromatic marks above the list — All / Text / Links / Images /
 * Files. The active one is the one place on this strip the rim accent is
 * allowed, so the current filter reads at a glance without a second colour
 * entering the panel.
 *
 * Icons rather than words. Five translated labels do not fit across a 360 px
 * panel in a wordier language than English — Vietnamese pushed one filter off
 * the edge entirely — and a glyph is a bigger, squarer target for a pointer
 * than a 3 px-tall strip of text. The word survives as `aria-label` and as the
 * hover tooltip, so nothing is actually lost; only the row's width is.
 *
 * It is a real `radiogroup`: arrow keys move between pills and a roving
 * tabindex keeps the whole row one tab stop, so the filter is reachable from
 * the keyboard without landing on five separate stops between search and list.
 */
import type { KeyboardEvent } from 'react'
import type { ItemFilter } from '../describe'
import { Icon, type IconName } from '../../ui'
import { t } from '../../i18n'
import { playButtonClickSound } from '../../lib/soundEffects'
import '../styles/filter-tabs.css'

export interface FilterTabsProps {
  value: ItemFilter
  onChange: (next: ItemFilter) => void
}

const FILTERS: ItemFilter[] = ['all', 'text', 'links', 'images', 'files']

/** One conventional glyph per kind; `all` is the four-pane "unfiltered" mark. */
const FILTER_ICONS: Record<ItemFilter, IconName> = {
  all: 'grid',
  text: 'text',
  links: 'link',
  images: 'image',
  files: 'file'
}

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
            // The label is gone from the surface but not from the control:
            // `aria-label` carries it for assistive tech and `title` brings it
            // back on hover for anyone who has not learned the glyph yet.
            aria-label={t(`shelf.filter.${filter}`)}
            title={t(`shelf.filter.${filter}`)}
            onClick={() => {
              if (!active) playButtonClickSound()
              onChange(filter)
            }}
          >
            <Icon name={FILTER_ICONS[filter]} size={14} />
          </button>
        )
      })}
    </div>
  )
}
