/**
 * Seam-aware edge probe tests.
 *
 * `stickProbe.ts` is the one piece of edge detection with zero Electron
 * imports, specifically so multi-monitor seams can be exercised here as
 * plain data — two `ScreenRect`s and a sequence of cursor samples — without
 * a running app or any mocking. Two topologies come up repeatedly:
 *
 *  - An **inner seam**: two 1920×1080 displays side by side, with the panel
 *    stuck to the RIGHT edge of the LEFT display. The client-space geometry
 *    for that panel is entirely local — it never needs to know the right
 *    display exists — which is exactly the property that makes the seam
 *    pillars work without any cross-display bookkeeping.
 *  - An **outer edge**: a single display with nothing beyond it. The seam
 *    pillars must be provably inert here, since there is no seam to be aware
 *    of.
 */
import { describe, expect, it } from 'vitest'

import {
  createSeamTickState,
  isNearProximity,
  probeSeamAware,
  probeStickEdge,
  type SeamTickState,
  MAX_INTENT_SPEED_PX_PER_MS,
  REST_FRAMES_REQUIRED
} from '../electron/main/edge/stickProbe'
import type { ScreenRect } from '../shared/types/settings'

/** Left half of a 3840×1080 two-monitor desktop. */
const LEFT_DISPLAY: ScreenRect = { x: 0, y: 0, width: 1920, height: 1080 }

/** A single, lone display — the outer-edge topology. */
const SOLO_DISPLAY: ScreenRect = { x: 0, y: 0, width: 1920, height: 1080 }

const HOT_ZONE_PX = 40

describe('probeStickEdge', () => {
  it('reports zero distance exactly at a left-docked edge', () => {
    const probe = probeStickEdge({
      cursor: { x: 0, y: 500 },
      workArea: LEFT_DISPLAY,
      stickPosition: 'left',
      hotZoneWidth: HOT_ZONE_PX
    })
    expect(probe.distFromEdge).toBe(0)
    expect(probe.inEdge).toBe(true)
    expect(probe.isGarbage).toBe(false)
  })

  it('reports a negative distance once the cursor overshoots a right-docked edge', () => {
    // The inner seam: LEFT_DISPLAY sticks right, so its right edge sits at
    // world x = 1919. Ten pixels onto the neighbour is world x = 1930.
    const probe = probeStickEdge({
      cursor: { x: 1930, y: 500 },
      workArea: LEFT_DISPLAY,
      stickPosition: 'right',
      hotZoneWidth: HOT_ZONE_PX
    })
    expect(probe.distFromEdge).toBe(-11)
    // Inside the keep-open overshoot band (30 px), so still "in edge".
    expect(probe.inEdge).toBe(true)
  })

  it('flags a sample outside the sane desktop range as garbage', () => {
    const probe = probeStickEdge({
      cursor: { x: -9000, y: 500 },
      workArea: LEFT_DISPLAY,
      stickPosition: 'left',
      hotZoneWidth: HOT_ZONE_PX
    })
    expect(probe.isGarbage).toBe(true)
  })
})

describe('isNearProximity', () => {
  it('is symmetric around the edge', () => {
    expect(isNearProximity(50, 100)).toBe(true)
    expect(isNearProximity(-50, 100)).toBe(true)
    expect(isNearProximity(150, 100)).toBe(false)
    expect(isNearProximity(-150, 100)).toBe(false)
  })
})

/** A right-docked probe input against LEFT_DISPLAY, at a given world x/time. */
function seamInput(x: number, now: number): Parameters<typeof probeSeamAware>[0] {
  return {
    cursor: { x, y: 500 },
    workArea: LEFT_DISPLAY,
    stickPosition: 'right',
    hotZoneWidth: HOT_ZONE_PX,
    now
  }
}

/** A left-docked probe input against SOLO_DISPLAY — the outer-edge topology. */
function outerEdgeInput(x: number, now: number): Parameters<typeof probeSeamAware>[0] {
  return {
    cursor: { x, y: 500 },
    workArea: SOLO_DISPLAY,
    stickPosition: 'left',
    hotZoneWidth: HOT_ZONE_PX,
    now
  }
}

describe('probeSeamAware — inner seam (two displays side by side)', () => {
  it('does not arm when the cursor flicks through the band faster than intent speed', () => {
    // Right edge of LEFT_DISPLAY is at world x = 1919 (distFromEdge 0).
    // 10 px every 4 ms is 2.5 px/ms, comfortably above the 1.5 px/ms cutoff,
    // and stays inside the hot zone the whole way through.
    let state: SeamTickState = createSeamTickState()
    let now = 0
    const xs = [1900, 1910, 1920, 1930, 1940]
    let armedInEdge = false

    for (const x of xs) {
      const result = probeSeamAware(seamInput(x, now), state)
      state = result.nextState
      armedInEdge = result.armedInEdge
      now += 4
    }

    expect(armedInEdge).toBe(false)
  })

  it('arms after three consecutive slow frames resting in the own-side band', () => {
    let state: SeamTickState = createSeamTickState()
    let now = 0
    let last: ReturnType<typeof probeSeamAware> | null = null

    // Rest at distances 3, 2, 1 px from the edge — well within the hot zone,
    // moving 1 px per 100 ms, far under the intent-speed cutoff.
    for (const x of [1916, 1917, 1918]) {
      last = probeSeamAware(seamInput(x, now), state)
      state = last.nextState
      now += 100
    }

    expect(last?.armedInEdge).toBe(true)
    expect(state.restFrames).toBeGreaterThanOrEqual(REST_FRAMES_REQUIRED)
  })

  it('does not arm on only two slow frames — three is the requirement, not a suggestion', () => {
    let state: SeamTickState = createSeamTickState()
    let now = 0
    let last: ReturnType<typeof probeSeamAware> | null = null

    for (const x of [1917, 1918]) {
      last = probeSeamAware(seamInput(x, now), state)
      state = last.nextState
      now += 100
    }

    expect(last?.armedInEdge).toBe(false)
  })

  it('a garbage sample does not update lastPoint and cannot poison the next speed calculation', () => {
    let state: SeamTickState = createSeamTickState()

    // Two real, slow samples to build up some rest history.
    let r1 = probeSeamAware(seamInput(1917, 0), state)
    state = r1.nextState
    let r2 = probeSeamAware(seamInput(1918, 100), state)
    state = r2.nextState
    const beforeGarbage = state

    // A garbage sample: clientX (x - workArea.x) far outside [-5000, 15000].
    const garbageResult = probeSeamAware(seamInput(-9000, 200), state)
    expect(garbageResult.isGarbage).toBe(true)
    // State must be untouched — the same object handed back, not a copy with
    // lastPoint quietly replaced.
    expect(garbageResult.nextState).toBe(beforeGarbage)
    state = garbageResult.nextState

    // The next real sample must compute its speed against the last *real*
    // point (world x 1918 at t=100), not the garbage one — so a further slow
    // step still counts as the third consecutive rest frame and arms.
    const r3 = probeSeamAware(seamInput(1919, 300), state)
    expect(r3.armedInEdge).toBe(true)
  })

  it('crossing onto the neighbour keeps an already-armed trigger open (overshoot is keep-open only)', () => {
    let state: SeamTickState = createSeamTickState()
    let now = 0
    let last: ReturnType<typeof probeSeamAware> | null = null

    for (const x of [1916, 1917, 1918]) {
      last = probeSeamAware(seamInput(x, now), state)
      state = last.nextState
      now += 100
    }
    expect(last?.armedInEdge).toBe(true)

    // One pixel past the seam, onto the neighbour, well inside the 30 px
    // overshoot band.
    const overshoot = probeSeamAware(seamInput(1920, now), state)
    expect(overshoot.distFromEdge).toBeLessThan(0)
    expect(overshoot.armedInEdge).toBe(true)
  })

  it('requires a fresh three-frame rest after actually crossing the seam and coming back', () => {
    let state: SeamTickState = createSeamTickState()
    let now = 0
    let last: ReturnType<typeof probeSeamAware> | null = null

    // Arm by resting on the own side.
    for (const x of [1916, 1917, 1918]) {
      last = probeSeamAware(seamInput(x, now), state)
      state = last.nextState
      now += 100
    }
    expect(last?.armedInEdge).toBe(true)

    // Cross deep into the neighbour, well past the keep-open overshoot band —
    // this is a real departure, not a jitter.
    const departed = probeSeamAware(seamInput(2200, now), state)
    state = departed.nextState
    now += 100
    expect(departed.armedInEdge).toBe(false)

    // Come back to rest for one slow frame — a large elapsed time keeps the
    // speed well under the intent cutoff, isolating the rest-count pillar
    // from the speed pillar: one slow frame must still not be enough on its
    // own, because the boundary crossing reset the count to zero.
    now += 100_000
    const backOnce = probeSeamAware(seamInput(1918, now), state)
    expect(backOnce.armedInEdge).toBe(false)
  })
})

describe('probeSeamAware — outer physical edge (no neighbouring display)', () => {
  it('still arms after a slow approach, exactly as an inner seam would', () => {
    let state: SeamTickState = createSeamTickState()
    let now = 0
    let last: ReturnType<typeof probeSeamAware> | null = null

    for (const x of [3, 2, 1]) {
      last = probeSeamAware(outerEdgeInput(x, now), state)
      state = last.nextState
      now += 100
    }

    expect(last?.armedInEdge).toBe(true)
  })

  it('does not arm on a fast flick across the same band', () => {
    let state: SeamTickState = createSeamTickState()
    let now = 0
    let last: ReturnType<typeof probeSeamAware> | null = null

    for (const x of [20, 10, 0]) {
      last = probeSeamAware(outerEdgeInput(x, now), state)
      state = last.nextState
      now += 4 // 10 px / 4 ms, above MAX_INTENT_SPEED_PX_PER_MS
    }

    expect(last?.armedInEdge).toBe(false)
  })
})

describe('constants', () => {
  it('keep the values the brief documents', () => {
    expect(REST_FRAMES_REQUIRED).toBe(3)
    expect(MAX_INTENT_SPEED_PX_PER_MS).toBe(1.5)
  })
})
