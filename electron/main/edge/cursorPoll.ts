/**
 * Adaptive cursor polling.
 *
 * Why poll at all, when a transparent window could just listen for DOM pointer
 * events: because the panel must also open while the OS is running a native
 * file drag. During a drag the desktop stops delivering ordinary mouse events
 * to windows, but `screen.getCursorScreenPoint()` keeps answering. Edge-Drop
 * learned this the hard way; the poll is the reason "drag a file to the edge"
 * works at all.
 *
 * Why two speeds, ported from Edge-Drop's `electron/main/window.ts`: a fixed
 * 16 ms interval fires 60× a second forever, which on modern Intel parts is
 * enough to keep the CPU out of its deep C-states (C6/C7/C8, worth 2–3 W each).
 * While the panels are closed and the cursor is nowhere near an edge, none of
 * those wake-ups do any work. So the poll idles at 75–100 ms and accelerates to
 * 16 ms only inside FAST_BAND_PX of a docked edge, falling back after a
 * cooldown. Human reaction time is ~150 ms, so the slow tier is imperceptible —
 * by the time a hand can move to the edge, the fast tier is already running.
 *
 * What is new here versus Edge-Drop: there are two panels, they can be on
 * either side, and they can be on different displays. Distance is therefore
 * computed per target against that target's own work area, never against a
 * single global "stick display".
 */
import { powerMonitor, screen, type Rectangle } from 'electron'
import type { EdgeCursorEvent } from '../../../shared/ipc'
import type { PanelSide } from '../../../shared/types/settings'
import type { EdgePanelId } from '../panels/PanelHost'

/** Full-speed poll, used only while the cursor is near a docked edge. */
const POLL_FAST_MS = 16
/** Idle poll on battery. */
const POLL_SLOW_BATTERY_MS = 100
/** Idle poll on AC — a little tighter, since wake-ups are cheap when plugged in. */
const POLL_SLOW_AC_MS = 75
/** Stay fast for this long after leaving proximity, so a jitter does not flap tiers. */
const SLOW_COOLDOWN_MS = 1500
/** Distance from an edge at which the fast tier engages. */
const FAST_BAND_PX = 160
/** Suppress emits for sub-pixel jitter while the cursor sits near the edge. */
const EMIT_MIN_DELTA_PX = 3

/**
 * Seam policy, in spirit rather than in full.
 *
 * On a multi-monitor desktop the inner edge of a display is not a wall — the
 * cursor sails straight through it onto the neighbour. Edge-Drop's stickProbe
 * models this properly; the part worth keeping cheaply is the observation that
 * a *traversal* is fast and an *intent* is slow. Above this speed the cursor is
 * on its way somewhere else, so the trigger stays disarmed, and a short lockout
 * keeps it disarmed until the movement actually settles.
 */
const TRAVERSAL_SPEED_PX_PER_MS = 2.2
const TRAVERSAL_LOCKOUT_MS = 250

/** One panel the poll watches. Implemented by PanelHost in main/index.ts. */
export interface EdgeTarget {
  id: EdgePanelId
  side: PanelSide
  /** Work area of the display this panel is docked to, re-read every tick. */
  workArea(): Rectangle
  /** Vertical strip along the edge that arms the opener. */
  triggerRect(): Rectangle
  isOpen(): boolean
  /** Cursor must come within this many px of the edge. From Settings. */
  proximityPx(): number
}

export interface CursorPollOptions {
  /** Re-read every tick: panels are created, destroyed and re-sided at runtime. */
  targets: () => EdgeTarget[]
  emit: (id: EdgePanelId, event: EdgeCursorEvent) => void
  /**
   * True while the poll should do nothing at all — a fullscreen game is in
   * front, or the app is quitting. Checked before any work.
   */
  suppress?: () => boolean
}

export interface CursorPoll {
  start(): void
  stop(): void
  isRunning(): boolean
}

interface TargetState {
  lastInZone: boolean
  /** Last emitted edge-miss, so the beacon fires once per approach. */
  lastEdgeMiss: boolean
  lastEmittedDistance: number
  lastEmittedOffset: number
}

/**
 * Signed distance from the cursor to a panel's docked edge, in px.
 *
 * Positive means "inside the work area, this far from the edge". The cursor
 * being on a different display is reported as `null` rather than a huge number,
 * so callers can tell "far away on this screen" from "not on this screen".
 */
function distanceToEdge(
  point: { x: number; y: number },
  workArea: Rectangle,
  side: PanelSide
): number | null {
  const insideX = point.x >= workArea.x && point.x < workArea.x + workArea.width
  const insideY = point.y >= workArea.y && point.y < workArea.y + workArea.height
  if (!insideX || !insideY) return null

  return side === 'left'
    ? point.x - workArea.x
    : workArea.x + workArea.width - 1 - point.x
}

export function createCursorPoll(options: CursorPollOptions): CursorPoll {
  let timer: ReturnType<typeof setInterval> | null = null
  let fast = false
  /** When the cursor left every fast band; 0 means "still in one". */
  let proximityExitAt = 0
  let lastPoint: { x: number; y: number } | null = null
  let lastTickAt = 0
  let lockoutUntil = 0

  const states = new Map<EdgePanelId, TargetState>()

  function stateFor(id: EdgePanelId): TargetState {
    let state = states.get(id)
    if (!state) {
      state = {
        lastInZone: false,
        lastEdgeMiss: false,
        lastEmittedDistance: Number.NaN,
        lastEmittedOffset: Number.NaN
      }
      states.set(id, state)
    }
    return state
  }

  function slowIntervalMs(): number {
    return powerMonitor.isOnBatteryPower() ? POLL_SLOW_BATTERY_MS : POLL_SLOW_AC_MS
  }

  function restart(intervalMs: number): void {
    if (timer !== null) clearInterval(timer)
    timer = setInterval(tick, intervalMs)
  }

  function tick(): void {
    if (options.suppress?.()) return

    const targets = options.targets()
    if (targets.length === 0) return

    const now = Date.now()
    const point = screen.getCursorScreenPoint()

    // ── Speed gate ───────────────────────────────────────────────────────
    // Normalised per ms so it means the same thing on a 16 ms fast tick and a
    // 100 ms slow tick.
    if (lastPoint !== null && lastTickAt !== 0) {
      const elapsed = Math.max(1, now - lastTickAt)
      const travelled = Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y)
      if (travelled / elapsed > TRAVERSAL_SPEED_PX_PER_MS) {
        lockoutUntil = now + TRAVERSAL_LOCKOUT_MS
      }
    }
    lastPoint = point
    lastTickAt = now
    const armed = now >= lockoutUntil

    let wantFast = false

    for (const target of targets) {
      const workArea = target.workArea()
      const distance = distanceToEdge(point, workArea, target.side)
      const state = stateFor(target.id)
      const open = target.isOpen()

      if (distance === null) {
        // Cursor is on another display. Report the leave once, then go quiet.
        if (state.lastInZone || state.lastEdgeMiss) {
          state.lastInZone = false
          state.lastEdgeMiss = false
          options.emit(target.id, {
            distancePx: Number.MAX_SAFE_INTEGER,
            offsetPx: 0,
            inTriggerZone: false,
            edgeMiss: false
          })
        }
        // An open panel still wants position updates so it can decide to close.
        if (open) wantFast = true
        continue
      }

      if (distance <= FAST_BAND_PX || open) wantFast = true

      const strip = target.triggerRect()
      const withinStrip = point.y >= strip.y && point.y < strip.y + strip.height
      const atEdge = distance <= target.proximityPx()
      const inTriggerZone = armed && withinStrip && atEdge
      // The cursor reached the edge but along the wrong stretch of it: nothing
      // will open from here, so the renderer flashes a beacon that says where
      // it would. Gated on `armed` for the same reason the opener is — a cursor
      // sailing past to the next display is travel, not intent.
      const edgeMiss = armed && !withinStrip && atEdge

      const offsetPx = point.y - workArea.y

      // Emit gating. Without it the renderer takes a full IPC message on every
      // fast tick — 60 messages a second while the hand merely rests near the
      // edge, which is the cost the poll was meant to avoid in the first place.
      const movedEnough =
        !Number.isFinite(state.lastEmittedDistance) ||
        Math.abs(distance - state.lastEmittedDistance) >= EMIT_MIN_DELTA_PX ||
        Math.abs(offsetPx - state.lastEmittedOffset) >= EMIT_MIN_DELTA_PX

      const near = distance <= FAST_BAND_PX
      const shouldEmit =
        inTriggerZone !== state.lastInZone ||
        edgeMiss !== state.lastEdgeMiss ||
        open ||
        (near && movedEnough)

      if (shouldEmit) {
        state.lastInZone = inTriggerZone
        state.lastEdgeMiss = edgeMiss
        state.lastEmittedDistance = distance
        state.lastEmittedOffset = offsetPx
        options.emit(target.id, { distancePx: distance, offsetPx, inTriggerZone, edgeMiss })
      }
    }

    // ── Tier switch ──────────────────────────────────────────────────────
    if (wantFast) {
      proximityExitAt = 0
      if (!fast) {
        fast = true
        restart(POLL_FAST_MS)
      }
      return
    }

    if (fast) {
      if (proximityExitAt === 0) proximityExitAt = now
      if (now - proximityExitAt >= SLOW_COOLDOWN_MS) {
        fast = false
        proximityExitAt = 0
        restart(slowIntervalMs())
      }
    }
  }

  /**
   * Suspend takes the machine away mid-tick and resume comes back with a
   * possibly different display layout and power source; restarting the timer is
   * cheaper and more correct than trying to reason about a stale one.
   */
  const onSuspend = (): void => {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
  const onResume = (): void => {
    if (timer === null) {
      fast = false
      lastPoint = null
      lastTickAt = 0
      restart(slowIntervalMs())
    }
  }

  return {
    start(): void {
      if (timer !== null) return
      fast = false
      proximityExitAt = 0
      lastPoint = null
      lastTickAt = 0
      // Always start slow; the first approach to an edge accelerates it.
      restart(slowIntervalMs())
      powerMonitor.on('suspend', onSuspend)
      powerMonitor.on('resume', onResume)
    },

    stop(): void {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
      powerMonitor.removeListener('suspend', onSuspend)
      powerMonitor.removeListener('resume', onResume)
      states.clear()
    },

    isRunning(): boolean {
      return timer !== null
    }
  }
}
