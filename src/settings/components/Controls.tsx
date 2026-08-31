/**
 * Settings controls.
 *
 * The settings window is the one surface where Ledge is an ordinary
 * application rather than an instrument at the screen edge, so it gets
 * ordinary controls — but built from the same tokens, so it is recognisably
 * the same product and not a preferences dialog someone bolted on.
 *
 * Every control here is label-first: the visible label is the accessible name
 * via a real `<label for>`, never an `aria-label` duplicating text that is
 * already on screen.
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from 'react'
import { Icon, type IconName } from '../../ui'
import { t } from '../../i18n'
import '../styles/controls.css'

// ── Layout ─────────────────────────────────────────────────────────────────

export function Section({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="bz-section">
      <h2 className="bz-section-title">{title}</h2>
      {description && <p className="bz-section-description">{description}</p>}
      <div className="bz-section-body">{children}</div>
    </section>
  )
}

export function Field({
  label,
  help,
  htmlFor,
  control,
  /** Puts the control under the label instead of beside it. For wide inputs. */
  stacked
}: {
  label: string
  help?: string
  htmlFor?: string
  control: ReactNode
  stacked?: boolean
}) {
  return (
    <div className="bz-field" data-stacked={stacked || undefined}>
      <div className="bz-field-text">
        <label className="bz-field-label" htmlFor={htmlFor}>
          {label}
        </label>
        {help && <p className="bz-field-help">{help}</p>}
      </div>
      <div className="bz-field-control">{control}</div>
    </div>
  )
}

// ── Switch ─────────────────────────────────────────────────────────────────

/**
 * A checkbox styled as a switch.
 *
 * A real `<input type="checkbox">` rather than a div with `role="switch"`:
 * form controls come with keyboard behaviour, focus, and label association
 * already correct, and reimplementing those is how a settings window ends up
 * unusable without a mouse.
 */
export function Switch({
  id,
  checked,
  onChange,
  label
}: {
  id: string
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <span className="bz-switch">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        aria-label={label}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="bz-switch-track" aria-hidden="true">
        <span className="bz-switch-thumb" />
      </span>
    </span>
  )
}

// ── Segmented ──────────────────────────────────────────────────────────────

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: IconName
}

/**
 * A radio group drawn as a segment bar.
 *
 * Used for the small closed sets — theme, dock side, trigger alignment — where
 * a dropdown hides the options behind a click and there are never more than
 * four. Arrow keys move between segments because that is what a radio group
 * does, and the roving tabindex keeps the group one tab stop.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label
}: {
  value: T
  options: SegmentedOption<T>[]
  onChange: (next: T) => void
  label: string
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = options.findIndex((option) => option.value === value)
    if (index < 0) return
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (delta === 0) return
    event.preventDefault()
    const next = options[(index + delta + options.length) % options.length]
    if (next) onChange(next.value)
  }

  return (
    <div className="bz-segmented" role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            className="bz-segment"
            onClick={() => onChange(option.value)}
          >
            {option.icon && <Icon name={option.icon} size={12} />}
            <span>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Slider ─────────────────────────────────────────────────────────────────

/**
 * A range input that commits on release.
 *
 * Dragging a slider fires `change` on every pixel. Committing each one writes
 * the settings file dozens of times and pushes `settings:changed` to both
 * panels for values the user is only passing through on the way to the one
 * they want. So the draft is local and only the released value is persisted —
 * with a keyboard commit on blur, since arrow keys never fire a pointer-up.
 *
 * `snap`, when given, makes the drag magnetic: the thumb still tracks the
 * pointer 1:1 while held (fine positioning, live readout), but on release the
 * committed value rounds to the nearest multiple of `snap` — e.g. the nearest
 * 5% of a 0–100 range. Controls that omit it commit the raw draft, unchanged
 * from before this existed.
 */
export function Slider({
  id,
  value,
  min,
  max,
  step = 1,
  snap,
  onCommit,
  format,
  label
}: {
  id: string
  value: number
  min: number
  max: number
  step?: number
  /** Commit increment for magnetic snapping, e.g. 5% of (max - min). */
  snap?: number
  onCommit: (next: number) => void
  format: (value: number) => string
  label: string
}) {
  const [draft, setDraft] = useState(value)
  const dirty = useRef(false)
  // Toggled on a snapped commit so the readout can pulse — the thumb settling
  // into place is felt, not just seen.
  const [settling, setSettling] = useState(false)

  // An edit made in another window must land here, but not while the user has
  // hold of the handle.
  useEffect(() => {
    if (!dirty.current) setDraft(value)
  }, [value])

  const commit = () => {
    dirty.current = false
    const next = snap
      ? Math.min(max, Math.max(min, min + Math.round((draft - min) / snap) * snap))
      : draft
    if (next !== draft) setDraft(next)
    if (next !== value) onCommit(next)
    if (snap) setSettling(true)
  }

  return (
    <span className="bz-slider">
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        aria-label={label}
        aria-valuetext={format(draft)}
        onChange={(event) => {
          dirty.current = true
          setDraft(Number(event.target.value))
        }}
        onPointerUp={commit}
        onBlur={commit}
        onKeyUp={commit}
      />
      <span
        className="bz-slider-value bz-num"
        data-settling={settling || undefined}
        onAnimationEnd={() => setSettling(false)}
      >
        {format(draft)}
      </span>
    </span>
  )
}

// ── Text ───────────────────────────────────────────────────────────────────

/** Commits on blur and on Enter, for the same reason the slider does. */
export function TextField({
  id,
  value,
  onCommit,
  placeholder,
  label,
  mono,
  /** Masks input for secrets such as a Bearer token. */
  password
}: {
  id: string
  value: string
  onCommit: (next: string) => void
  placeholder?: string
  label: string
  mono?: boolean
  password?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setDraft(value)
  }, [value])

  return (
    <input
      id={id}
      className="bz-text-field"
      data-mono={mono || undefined}
      type={password ? 'password' : 'text'}
      value={draft}
      placeholder={placeholder}
      aria-label={label}
      spellCheck={false}
      autoComplete={password ? 'new-password' : 'off'}
      onFocus={() => {
        focused.current = true
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        focused.current = false
        if (draft !== value) onCommit(draft)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(value)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

// ── Select ─────────────────────────────────────────────────────────────────

export function Select<T extends string>({
  id,
  value,
  options,
  onChange,
  label
}: {
  id: string
  value: T
  options: { value: T; label: string }[]
  onChange: (next: T) => void
  label: string
}) {
  return (
    <span className="bz-select">
      <select
        id={id}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon name="chevron-down" size={12} />
    </span>
  )
}

// ── Hotkey ─────────────────────────────────────────────────────────────────

/** Keys that are only ever modifiers, never the accelerator's final key. */
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'OS', 'AltGraph'])

/**
 * Records a shortcut.
 *
 * Emits Electron accelerator syntax, and always `CommandOrControl` rather than
 * `Control` or `Command`: the settings file is portable between machines, and
 * a shortcut recorded on a Mac should still work on the user's Windows box.
 */
export function HotkeyField({
  id,
  value,
  onCommit,
  label,
  defaultValue
}: {
  id: string
  value: string
  onCommit: (next: string) => void
  label: string
  /** When given, a reset control appears whenever `value` has drifted from it. */
  defaultValue?: string
}) {
  const [recording, setRecording] = useState(false)

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return
    event.preventDefault()
    event.stopPropagation()

    if (event.key === 'Escape') {
      setRecording(false)
      return
    }
    // Wait for a real key. Showing "Ctrl+" while a modifier is held would be a
    // shortcut that cannot be registered.
    if (MODIFIER_KEYS.has(event.key)) return

    const parts: string[] = []
    if (event.ctrlKey || event.metaKey) parts.push('CommandOrControl')
    if (event.altKey) parts.push('Alt')
    if (event.shiftKey) parts.push('Shift')
    parts.push(normaliseKey(event.key))

    setRecording(false)
    onCommit(parts.join('+'))
  }

  const canReset = defaultValue !== undefined && value !== defaultValue

  return (
    <span className="bz-hotkey-wrap">
      <button
        id={id}
        type="button"
        className="bz-hotkey"
        data-recording={recording || undefined}
        aria-label={label}
        onClick={() => setRecording((on) => !on)}
        onBlur={() => setRecording(false)}
        onKeyDown={onKeyDown}
      >
        {recording ? (
          <span className="bz-hotkey-recording">
            <span className="bz-hotkey-pulse" aria-hidden="true" />
            {t('settings.behaviour.hotkey.recording')}
          </span>
        ) : (
          <>
            <span className="bz-hotkey-keys">
              {keyBadges(value).map((badge, i) => (
                <span key={i} className="bz-hotkey-cap-item">
                  {i > 0 && <span className="bz-hotkey-plus">+</span>}
                  <kbd className="bz-hotkey-cap">{badge}</kbd>
                </span>
              ))}
            </span>
            <span className="bz-hotkey-edit">{t('settings.behaviour.hotkey.edit')}</span>
          </>
        )}
      </button>
      {canReset && !recording && (
        <button
          type="button"
          className="bz-hotkey-reset"
          aria-label={t('settings.behaviour.hotkey.reset')}
          title={t('settings.behaviour.hotkey.reset')}
          onClick={() => onCommit(defaultValue as string)}
        >
          <Icon name="refresh" size={12} />
        </button>
      )}
    </span>
  )
}

/** Split an accelerator into display badges: `CommandOrControl+Shift+V`. */
function keyBadges(accelerator: string): string[] {
  if (!accelerator) return ['—']
  return accelerator.split('+').map((raw) => {
    const key = raw.trim()
    if (key === 'CommandOrControl') return 'Ctrl'
    if (key === 'Meta' || key === 'Super' || key === 'Command') return 'Win'
    // The one non-modifier whose accelerator token is an English word rather
    // than a symbol the user types. Localised on display only — the stored
    // accelerator stays 'Space' (see normaliseKey) so Electron can bind it.
    if (key === 'Space') return t('keys.space')
    return key.length === 1 ? key.toUpperCase() : key
  })
}

function normaliseKey(key: string): string {
  // 'Space' is the literal Electron accelerator token and must NOT be
  // localised here: this string is committed and handed to
  // globalShortcut.register in main. The on-screen label is translated in
  // keyBadges instead.
  if (key === ' ') return 'Space'
  if (key.length === 1) return key.toUpperCase()
  // Arrow keys and the rest already match Electron's accelerator names.
  return key
}

// ── Misc ───────────────────────────────────────────────────────────────────

/** A stable id for a control and its label. Thin wrapper for readability. */
export function useFieldId(prefix: string): string {
  const id = useId()
  return `${prefix}${id}`
}
