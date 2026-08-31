/**
 * Copy indicator flare.
 *
 * When a new clip is captured, a flourish blooms out of the docked edge — the
 * one confirmation that Ledge caught something while it was collapsed and out
 * of sight. Ported from Edge-Drop's `CopyIndicatorCurve`, but framer-motion and
 * GSAP are gone: the sweep and the burst are plain CSS keyframes keyed off a
 * counter, so there is no runtime dependency and reduced-motion simply skips
 * the whole thing.
 *
 * Two styles, matching `settings.shelf.indicatorStyle`:
 *   `curve`  a sine-curve bulge that pushes out from the edge with a tick
 *   `flare`  a short particle burst
 *
 * `off` is handled by the caller, which does not mount this at all.
 */
import { useEffect, useRef, useState } from 'react'
import type { IndicatorStyle, PanelSide } from '../../../shared/types/settings'
import '../styles/copy-indicator.css'

export interface CopyIndicatorCurveProps {
  /** Bumped by the caller on every capture. A change re-arms the flare. */
  flareKey: number
  side: PanelSide
  /** `off` is never passed — the caller skips mounting instead. */
  style: Exclude<IndicatorStyle, 'off'>
  /** When true the flare is suppressed entirely; motion is its whole point. */
  reduceMotion: boolean
}

/** How long the flare stays on screen before it clears itself. */
const FLARE_MS = 1100

export function CopyIndicatorCurve({ flareKey, side, style, reduceMotion }: CopyIndicatorCurveProps) {
  const [active, setActive] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The flare must fire only on a NEW capture, never on a settings change.
  // Tracking the last-fired key lets us bail when the effect re-runs for any
  // other reason — e.g. the user toggling "Reduce motion" off while flareKey is
  // already > 0, which would otherwise replay a stale flare.
  const firedKey = useRef(0)

  useEffect(() => {
    // flareKey starts at 0 and the first real capture bumps it; never fire on
    // the initial mount, and never while the user has motion turned off.
    if (flareKey <= 0 || reduceMotion) return
    if (flareKey === firedKey.current) return // not a new capture — ignore
    firedKey.current = flareKey
    setActive(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setActive(false), FLARE_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [flareKey, reduceMotion])

  if (!active || reduceMotion) return null

  return (
    <div className="bz-flare" data-side={side} data-style={style} aria-hidden="true">
      {/* key restarts the CSS animation on every capture even if one is still
          on screen — the sweep should replay, not freeze. */}
      <div className="bz-flare-inner" key={flareKey}>
        {style === 'curve' ? <CurveFlare /> : <ParticleFlare />}
      </div>
    </div>
  )
}

function CurveFlare() {
  return (
    <div className="bz-flare-curve">
      <svg className="bz-flare-bulge" viewBox="0 0 60 160" fill="none" preserveAspectRatio="none">
        <path d="M0,0 C42,44 42,116 0,160 L0,0 Z" fill="var(--bz-rim)" />
      </svg>
      <svg className="bz-flare-tick" width="20" height="20" viewBox="0 0 16 16" fill="none">
        <path
          d="M3.2 8.4 6.4 11.6 12.8 4.8"
          stroke="var(--bz-panel)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

function ParticleFlare() {
  // Six sparks fanned across the trigger band. Angles are fixed so the burst
  // reads the same every time rather than looking random and glitchy.
  const sparks = [-40, -22, -7, 7, 22, 40]
  return (
    <div className="bz-flare-particles">
      {sparks.map((angle, i) => (
        <span
          key={i}
          className="bz-flare-spark"
          style={{ ['--bz-spark-angle' as string]: `${angle}deg`, ['--bz-spark-i' as string]: i }}
        />
      ))}
      <span className="bz-flare-core" />
    </div>
  )
}
