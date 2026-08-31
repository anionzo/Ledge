/**
 * First-run onboarding.
 *
 * A light overlay that names the three gestures a new user cannot discover by
 * looking — hover to open, drag out, and the quota strip — then gets out of the
 * way for good. Adapted from Edge-Drop's `Onboarding`, shrunk to fit inside the
 * 320 px hub rather than filling a window of its own.
 *
 * Gated on a `localStorage` flag wrapped in try/catch, because a private window
 * or a locked-down profile throws on access and a first run must never crash
 * the panel. It is skippable at every step and never blocks the shelf behind
 * it — the backdrop is inert and only the card takes the pointer.
 */
import { useState } from 'react'
import { t } from '../../i18n'
import { Button } from '../../ui'
import { playButtonClickSound } from '../../lib/soundEffects'
import '../styles/onboarding.css'

const FLAG = 'ledge.onboarded'

/** Read the first-run flag, treating any storage failure as "not yet seen". */
function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(FLAG) === '1'
  } catch {
    return false
  }
}

function markOnboarded(): void {
  try {
    localStorage.setItem(FLAG, '1')
  } catch {
    /* Private window or blocked storage — the overlay simply reappears next
       run, which is a far smaller sin than throwing on first paint. */
  }
}

interface Step {
  icon: 'grip' | 'external' | 'stack'
  title: string
  body: string
}

const STEPS: Step[] = [
  { icon: 'grip', title: 'onboarding.hover.title', body: 'onboarding.hover.body' },
  { icon: 'external', title: 'onboarding.drag.title', body: 'onboarding.drag.body' },
  { icon: 'stack', title: 'onboarding.quota.title', body: 'onboarding.quota.body' }
]

export interface OnboardingProps {
  /** Only shown while the panel is open, so it never floats over a closed hub. */
  active: boolean
}

export function Onboarding({ active }: OnboardingProps) {
  const [dismissed, setDismissed] = useState(() => hasOnboarded())
  const [index, setIndex] = useState(0)

  if (dismissed || !active) return null

  const step = STEPS[index]
  if (!step) return null
  const last = index === STEPS.length - 1

  const finish = () => {
    markOnboarded()
    setDismissed(true)
  }

  const next = () => {
    playButtonClickSound()
    if (last) finish()
    else setIndex((i) => i + 1)
  }

  const skip = () => {
    playButtonClickSound()
    finish()
  }

  return (
    <div className="bz-onboard" role="dialog" aria-modal="false" aria-label={step && t(step.title)}>
      <div className="bz-onboard-card">
        <span className="bz-onboard-icon">
          <OnboardIcon name={step.icon} />
        </span>
        <p className="bz-onboard-step bz-num">
          {t('onboarding.step', { n: index + 1, total: STEPS.length })}
        </p>
        <h2 className="bz-onboard-title">{t(step.title)}</h2>
        <p className="bz-onboard-body">{t(step.body)}</p>

        <div className="bz-onboard-dots" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} className="bz-onboard-dot" data-active={i === index || undefined} />
          ))}
        </div>

        <div className="bz-onboard-actions bz-row">
          <Button size="sm" onClick={skip}>
            {t('onboarding.skip')}
          </Button>
          <span className="bz-row-fill" />
          <Button size="sm" variant="primary" onClick={next}>
            {last ? t('onboarding.done') : t('onboarding.next')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** The three onboarding glyphs, drawn inline to match the 16-grid icon set. */
function OnboardIcon({ name }: { name: Step['icon'] }) {
  const paths: Record<Step['icon'], string> = {
    grip: 'M6 3.4v.1M6 7.4v.1M6 11.4v.1M10 3.4v.1M10 7.4v.1M10 11.4v.1',
    external: 'M9 3.2h3.8V7M12.4 3.6 7.6 8.4M11.4 9.4v3.4H3.2V4.6h3.4',
    stack: 'M2.6 5.4 8 2.6l5.4 2.8L8 8.2ZM2.6 8.4 8 11.2l5.4-2.8M2.6 11 8 13.8 13.4 11'
  }
  return (
    <svg width={22} height={22} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}
