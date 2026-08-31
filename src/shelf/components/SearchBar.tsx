/**
 * Search.
 *
 * Filtering happens locally on an array main already sent us, so there is no
 * debounce and no spinner: the answer is available in the same frame as the
 * keystroke, and adding latency to make it feel like a search would be a lie.
 *
 * The field takes focus when the panel opens. On a panel summoned by a hotkey
 * that is almost always what was wanted, and it costs nothing when it was not
 * — the arrow keys hand focus straight to the list.
 */
import { useEffect, useRef, type KeyboardEvent } from 'react'
import { t } from '../../i18n'
import { Icon } from '../../ui'
import '../styles/search-bar.css'

export interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  /** Called when the user presses Down, to hand focus to the list. */
  onEnterList: () => void
  /** Focus on mount. The panel does this when it opens. */
  autoFocus?: boolean
}

export function SearchBar({ value, onChange, onEnterList, autoFocus }: SearchBarProps) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      onEnterList()
      return
    }
    // Escape clears before it closes: the first press undoes the filter, and
    // main's global handler closes the panel on the second, once there is
    // nothing left to undo.
    if (event.key === 'Escape' && value) {
      event.stopPropagation()
      onChange('')
    }
  }

  return (
    <div className="bz-search bz-row">
      <Icon name="search" size={12} className="bz-search-icon" />
      <input
        ref={ref}
        className="bz-search-input bz-row-fill"
        type="search"
        value={value}
        placeholder={t('shelf.search.placeholder')}
        aria-label={t('common.search')}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {value && (
        <button
          type="button"
          className="bz-search-clear"
          onClick={() => {
            onChange('')
            ref.current?.focus()
          }}
          aria-label={t('shelf.search.clear')}
          title={t('shelf.search.clear')}
        >
          <Icon name="close" size={10} />
        </button>
      )}
    </div>
  )
}
