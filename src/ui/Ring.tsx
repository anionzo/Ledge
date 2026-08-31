/**
 * The quota ring.
 *
 * This is the one place in Ledge where colour is allowed to mean something, so
 * it has to be built like an instrument face rather than a progress bar:
 *
 *  - A faint track ring sits behind the value arc at all times. Without it a
 *    12% reading is a lonely stub and the user cannot tell whether the ring is
 *    nearly empty or nearly broken.
 *  - The arc starts at twelve o'clock and sweeps clockwise, because that is
 *    the direction every dial the user has ever read moves.
 *  - The endpoint is emphasised with a dot. On a 34 px ring the difference
 *    between 78% and 82% is under two degrees; the dot is what makes the
 *    reading land, and it is the part that visibly moves when the number
 *    changes.
 *  - A null percentage draws the track and an em dash. Never a zero arc — a
 *    provider we could not read must not look like a provider with nothing
 *    used.
 *
 * Geometry is in user units equal to CSS pixels (`viewBox="0 0 size size"`) so
 * the stroke lands on the pixel grid instead of being scaled into softness.
 */
import type { QuotaSeverity } from '../../shared/types/quota'
import { EM_DASH } from '../lib/format'
import './styles/ring.css'

export interface RingProps {
  /** 0–100, or null when genuinely unknown. */
  percent: number | null
  severity?: QuotaSeverity
  /** Outer diameter in px. 34 in the gauge rows, 56 in the settings preview. */
  size?: number
  /** Stroke width. Defaults to a tenth of the diameter, minimum 3. */
  thickness?: number
  /**
   * Announced to assistive tech. Required — a ring with no label is an
   * unlabelled number in a list of unlabelled numbers.
   */
  label: string
  /** A retained previous reading: drawn dimmed. */
  stale?: boolean
  /** Show the per-cent sign. Off below ~44 px, where it crowds the digits. */
  showUnit?: boolean
  className?: string
}

export function Ring({
  percent,
  severity = 'ok',
  size = 34,
  thickness,
  label,
  stale = false,
  showUnit,
  className
}: RingProps) {
  const stroke = thickness ?? Math.max(3, Math.round(size * 0.1))
  const centre = size / 2
  // Half a stroke of inset keeps the outer edge of the stroke inside the box;
  // one more pixel gives the endpoint dot, which is fatter than the arc, room
  // to sit without being clipped.
  const radius = centre - stroke / 2 - 1

  const known = percent !== null && Number.isFinite(percent)
  const value = known ? clamp(percent as number) : 0
  const rounded = Math.round(value)
  const unit = showUnit ?? size >= 44

  return (
    <div
      className={className ? `bz-ring ${className}` : 'bz-ring'}
      data-severity={severity}
      data-stale={stale || undefined}
      data-unknown={known ? undefined : true}
      style={{ width: size, height: size, ['--bz-ring-size' as string]: `${size}px` }}
      // A meter needs a number. Without one it is an image of a dial, and
      // saying so is more honest than reporting a value of zero.
      {...(known
        ? {
            role: 'meter',
            'aria-valuemin': 0,
            'aria-valuemax': 100,
            'aria-valuenow': rounded,
            'aria-valuetext': `${rounded}%`
          }
        : { role: 'img' })}
      aria-label={label}
    >
      <svg
        className="bz-ring-svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        focusable="false"
        shapeRendering="geometricPrecision"
      >
        {/* Rotating the whole drawing puts 0% at twelve o'clock without
            recomputing every angle by hand. */}
        <g transform={`rotate(-90 ${centre} ${centre})`}>
          <circle
            className="bz-ring-track"
            cx={centre}
            cy={centre}
            r={radius}
            fill="none"
            strokeWidth={stroke}
          />
          {known && (
            <circle
              className="bz-ring-value"
              cx={centre}
              cy={centre}
              r={radius}
              fill="none"
              strokeWidth={stroke}
              /* pathLength normalises the circumference to 100, so the dash
                 maths is literally the percentage — no 2*pi*r rounding error
                 to leave a hairline gap at 100%. */
              pathLength={100}
              strokeDasharray="100 100"
              strokeDashoffset={100 - value}
              strokeLinecap="butt"
            />
          )}
        </g>

        {known && (
          /* The endpoint. Rotated rather than repositioned so the browser can
             interpolate one transform when the reading changes, instead of
             jumping cx/cy. Origin is the ring centre, in user units. */
          <g
            className="bz-ring-endpoint"
            style={{
              transformOrigin: `${centre}px ${centre}px`,
              transform: `rotate(${value * 3.6}deg)`
            }}
          >
            <circle
              className="bz-ring-endpoint-halo"
              cx={centre}
              cy={centre - radius}
              r={stroke * 0.72}
            />
            {/* Hollowing the needle out is how a stale reading announces
                itself on the instrument itself, not just in the row beside
                it. */}
            <circle
              className="bz-ring-endpoint-dot"
              cx={centre}
              cy={centre - radius}
              r={stroke * (stale ? 0.5 : 0.34)}
            />
          </g>
        )}
      </svg>

      <span className="bz-ring-face" aria-hidden="true">
        {known ? (
          <>
            <span className="bz-num bz-ring-value-text">{rounded}</span>
            {unit && <span className="bz-ring-unit">%</span>}
          </>
        ) : (
          <span className="bz-ring-dash">{EM_DASH}</span>
        )}
      </span>
    </div>
  )
}

function clamp(n: number): number {
  return Math.min(100, Math.max(0, n))
}
