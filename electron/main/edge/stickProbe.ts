/**
 * Adapted from Edge-Drop electron/main/stickProbe.ts (Apache-2.0).
 *
 * The seam-aware edge probe: the part of edge detection that decides whether
 * the cursor has *arrived* at a docked edge, as opposed to merely sailing
 * through it on the way to a neighbouring display.
 *
 * On a single-monitor desktop "at the edge" is unambiguous. On a multi-monitor
 * one it is not: the inner edge of a display is not a wall, it is a seam, and
 * the cursor crosses it dozens of times a day without ever intending to open
 * anything docked there. Ledge's previous approach — a flat speed threshold
 * with a fixed-duration lockout — could not tell "flicked through the seam"
 * from "rested right next to it", because a clock-based lockout expires
 * whether or not the cursor ever actually stopped moving.
 *
 * This module replaces that with three pillars, applied together:
 *
 *   1. Own-pixel arming. Only a cursor whose signed distance from the edge is
 *      `>= 0` — i.e. still standing on the panel's own display — can newly
 *      arm the trigger. A short band just past the edge (`OVERSHOOT_PX`) is
 *      tracked too, but only to *keep* an already-armed trigger open (a
 *      panel that hangs slightly over the seam should not snap shut on a
 *      one-pixel jitter); it can never arm on its own.
 *   2. Intent speed. Above `MAX_INTENT_SPEED_PX_PER_MS` the cursor is
 *      travelling, not arriving, regardless of where it currently sits.
 *   3. Rest-as-intent. Re-entering the own-side band after having left it —
 *      the seam equivalent of a "boundary crossing" — requires
 *      `REST_FRAMES_REQUIRED` consecutive slow frames before it can arm
 *      again. A single slow sample the instant the cursor lands back on its
 *      own display is exactly what a fast flick that merely grazes the edge
 *      looks like; three in a row is what a hand coming to rest looks like.
 *
 * Zero imports from `electron` on purpose: this is the one piece of edge
 * detection worth unit-testing against synthetic multi-monitor topologies,
 * and pulling in `electron` would mean every test needs a running app.
 *
 * State is threaded rather than kept as module globals — `probeSeamAware`
 * takes a `SeamTickState` in and hands a new one back — so a test (or
 * `cursorPoll`, which keeps one per docked panel) can run several independent
 * seams side by side without them stepping on each other.
 */
import type { PanelSide, ScreenRect } from '../../../shared/types/settings'

/** A point in the same coordinate space as `ScreenRect` — DIP screen coords. */
export interface Point {
  x: number
  y: number
}

/**
 * A raw cursor sample is only trustworthy inside this range, translated into
 * work-area-local coordinates. Outside it, the sample is almost certainly a
 * transient glitch — a remote-desktop hiccup, or a value read mid-way through
 * a display topology change — rather than a real position anywhere on a real
 * desktop. Matches Edge-Drop's own bound.
 */
const GARBAGE_MIN_PX = -5000
const GARBAGE_MAX_PX = 15000

/**
 * How far past the docked edge, in px, the cursor may sit and still count as
 * "at the edge" for keep-open purposes. This is the sliver Windows leaves
 * before the neighbouring display's own edge takes over; it is generous
 * enough to absorb OS-level rounding at the seam without being wide enough
 * to read as "the cursor is now doing something on the other monitor".
 */
const OVERSHOOT_PX = 30

/**
 * Above this speed the cursor is travelling somewhere else, not arriving.
 * Chosen upstream by Edge-Drop; kept byte-equivalent here because it is a
 * property of human pointer motion, not of any one app's geometry.
 */
export const MAX_INTENT_SPEED_PX_PER_MS = 1.5

/**
 * Consecutive slow frames required, after re-entering the own-side band,
 * before the trigger is allowed to arm. Three frames at the fast 16 ms poll
 * tier is ~48 ms — long enough to reject a flick, short enough that a
 * deliberate approach never feels like it is waiting on the app.
 */
export const REST_FRAMES_REQUIRED = 3

/**
 * Distance, in px, inside which the poll is worth running at its fast tier.
 * Exported so `cursorPoll` can drive its tier switch off the same probe
 * result instead of re-deriving distance semantics of its own. See the
 * FAST_BAND_PX comment in cursorPoll.ts for why Ledge keeps its own narrower
 * value instead of this one.
 */
export const FAST_POLL_PROXIMITY_PX = 450

export interface StickProbeInput {
  /** Raw cursor position, in the same DIP coordinate space as `workArea`. */
  cursor: Point
  /** Work area of the display the probed panel is docked to. */
  workArea: ScreenRect
  /** Which edge of that work area the panel sticks to. */
  stickPosition: PanelSide
  /** Cursor must come within this many px of the edge to arm. From Settings. */
  hotZoneWidth: number
}

export interface StickProbeResult {
  /** Cursor position translated into work-area-local coordinates. */
  client: Point
  /**
   * Signed distance from the docked edge, in px. Non-negative while the
   * cursor is still on the panel's own display; negative once it has crossed
   * onto the neighbour, with the magnitude being how far past the seam it
   * has travelled.
   */
  distFromEdge: number
  /**
   * True while the cursor sits inside the full hot zone, i.e.
   * `[-OVERSHOOT_PX, hotZoneWidth]`. This is the keep-open band: on its own
   * it says nothing about whether the trigger may *newly* arm — see
   * `probeSeamAware`'s own-pixel-arming pillar for that.
   */
  inEdge: boolean
  /**
   * True if the raw sample translates to work-area-local coordinates outside
   * the sane desktop range. A garbage sample must never be trusted for a
   * speed calculation, so callers must not fold it into `lastPoint`.
   */
  isGarbage: boolean
}

/**
 * State threaded between ticks for one seam. Owned by the caller (one per
 * docked panel in `cursorPoll`, one per synthetic topology in tests) — this
 * module keeps no state of its own.
 */
export interface SeamTickState {
  /** Last trusted cursor sample, for the speed calculation. Null before the first sample. */
  lastPoint: Point | null
  /** Timestamp of `lastPoint`, in the same clock as the `now` passed to `probeSeamAware`. */
  lastSampleAt: number | null
  /** Consecutive slow frames observed while resting inside the own-side band. */
  restFrames: number
  /** Whether the trigger is currently armed. Persists across overshoot-band frames (pillar 1's keep-open). */
  armed: boolean
}

export interface SeamAwareProbe extends StickProbeResult {
  /** Whether the seam policy allows the trigger to be considered armed this tick. */
  armedInEdge: boolean
  /** State to hand back into the next call for this seam. */
  nextState: SeamTickState
}

/** A fresh, unarmed state for a seam that has not been probed yet. */
export function createSeamTickState(): SeamTickState {
  return { lastPoint: null, lastSampleAt: null, restFrames: 0, armed: false }
}

/**
 * Pure geometry and garbage-guarding: no notion of time, speed, or history.
 * Exported on its own because tests (and `probeSeamAware`) need the raw
 * distance without paying for the stateful seam policy on top of it.
 */
export function probeStickEdge(input: StickProbeInput): StickProbeResult {
  const { cursor, workArea, stickPosition, hotZoneWidth } = input

  // Client coordinates: the cursor's position with the work area's own
  // origin subtracted out. This is what makes the same maths work for any
  // display in a multi-monitor arrangement without the caller normalising
  // anything first.
  const client: Point = { x: cursor.x - workArea.x, y: cursor.y - workArea.y }

  const isGarbage =
    client.x < GARBAGE_MIN_PX ||
    client.x > GARBAGE_MAX_PX ||
    client.y < GARBAGE_MIN_PX ||
    client.y > GARBAGE_MAX_PX

  // Positive means "this many px inside the work area, measured from the
  // docked edge"; negative means "this many px past the edge, on whatever
  // lies beyond it".
  const distFromEdge =
    stickPosition === 'left' ? client.x : workArea.width - 1 - client.x

  const inEdge = distFromEdge >= -OVERSHOOT_PX && distFromEdge <= hotZoneWidth

  return { client, distFromEdge, inEdge, isGarbage }
}

/**
 * Whether a distance from the edge is close enough to be worth polling fast
 * for. Uses the absolute distance rather than the raw signed one: a cursor
 * deep on the far side of a neighbouring display (a large negative
 * `distFromEdge`) is not "near" in any useful sense, even though it is
 * numerically less than a positive threshold. Named rather than inlined so
 * the "what counts as near" decision lives in one place instead of being
 * duplicated at every call site.
 */
export function isNearProximity(distFromEdge: number, thresholdPx: number): boolean {
  return Math.abs(distFromEdge) <= thresholdPx
}

/**
 * The stateful seam policy. Combines `probeStickEdge` with the three pillars
 * described at the top of this file and returns both the outcome and the
 * state to persist for next tick.
 *
 * `input.now` is a caller-supplied timestamp (matches `cursorPoll`'s
 * `Date.now()`) rather than read internally, so tests can drive exact
 * frame timings without a fake clock.
 */
export function probeSeamAware(
  input: StickProbeInput & { now: number },
  state: SeamTickState
): SeamAwareProbe {
  const probe = probeStickEdge(input)

  // Garbage guard: a bad sample decides nothing and, critically, must not
  // become `lastPoint` — otherwise the *next* real sample computes its speed
  // against nonsense and could be rejected (or wrongly accepted) for a
  // reason that has nothing to do with how the cursor actually moved.
  if (probe.isGarbage) {
    return { ...probe, armedInEdge: state.armed, nextState: state }
  }

  const ownSide = probe.distFromEdge >= 0

  let speedPxPerMs = 0
  if (state.lastPoint !== null && state.lastSampleAt !== null) {
    const elapsedMs = Math.max(1, input.now - state.lastSampleAt)
    const travelledPx = Math.hypot(
      input.cursor.x - state.lastPoint.x,
      input.cursor.y - state.lastPoint.y
    )
    speedPxPerMs = travelledPx / elapsedMs
  }
  // No prior sample: nothing to compare against, so this frame reads as
  // stationary rather than fast. The alternative — treating the first ever
  // sample as infinitely fast — would make a panel unable to arm the moment
  // the poll (re)starts with the cursor already resting at the edge.

  let restFrames = state.restFrames
  let armed = state.armed

  if (!probe.inEdge) {
    // Nowhere near the edge on either side of the seam: there is nothing
    // seam-specific to preserve, so this is a full reset, matching how the
    // old distance-based gate treated "far from the edge".
    restFrames = 0
    armed = false
  } else if (ownSide) {
    if (speedPxPerMs > MAX_INTENT_SPEED_PX_PER_MS) {
      // Pillar 2: still on the panel's own pixels, but travelling through
      // them rather than arriving. A flick across the band must not arm, and
      // must not leave behind a partial rest count that a much later, truly
      // resting sample could cash in.
      restFrames = 0
      armed = false
    } else {
      // Pillar 3: only counts once the cursor is both on its own side and
      // slow. Capped at the requirement so a long rest does not need to be
      // undone frame-by-frame if speed briefly spikes again later.
      restFrames = Math.min(REST_FRAMES_REQUIRED, restFrames + 1)
      armed = restFrames >= REST_FRAMES_REQUIRED
    }
  } else {
    // Pillar 1's keep-open half: past the edge, inside the overshoot band.
    // This can never *newly* arm — `armed` is left exactly as it was — but
    // it does reset the rest counter. That reset is what makes "rest-as-
    // intent" mean anything: coming back from the neighbour's side of the
    // seam always has to earn a fresh REST_FRAMES_REQUIRED, never reuse a
    // count banked before the crossing.
    restFrames = 0
  }

  const nextState: SeamTickState = {
    lastPoint: input.cursor,
    lastSampleAt: input.now,
    restFrames,
    armed
  }

  return { ...probe, armedInEdge: armed, nextState }
}
