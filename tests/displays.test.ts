/**
 * Display resolution tests.
 *
 * `resolveStickDisplay` is exercised as a pure function against hand-built
 * `DisplayOption[]` — no `electron` import anywhere in this file, which is the
 * whole point of keeping the resolve logic free of `screen` calls. See the
 * header comment in `electron/main/panels/displays.ts` for the tier ladder
 * this is testing.
 */
import { describe, expect, it } from 'vitest'

import { resolveStickDisplay } from '../electron/main/panels/displays'
import type { DisplayOption } from '../shared/ipc'
import type { StickDisplayPrefs } from '../shared/types/settings'

/** A blank prefs object — nothing saved yet. */
const EMPTY_PREFS: StickDisplayPrefs = {
  displayId: null,
  savedWorkArea: null,
  savedScaleFactor: null
}

function makeOption(overrides: Partial<DisplayOption> & { id: number }): DisplayOption {
  return {
    label: `Display ${overrides.id}`,
    physicalWidth: 1920,
    physicalHeight: 1080,
    scaleFactor: 1,
    isPrimary: false,
    workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    ...overrides
  }
}

describe('resolveStickDisplay', () => {
  it('returns null for an empty display list, whatever the prefs say', () => {
    expect(resolveStickDisplay([], EMPTY_PREFS)).toBeNull()
    expect(
      resolveStickDisplay([], { displayId: 7, savedWorkArea: { x: 0, y: 0, width: 100, height: 100 }, savedScaleFactor: 1 })
    ).toBeNull()
  })

  it('falls back to the primary display when prefs are empty', () => {
    const secondary = makeOption({ id: 1, isPrimary: false, workArea: { x: 1920, y: 0, width: 1920, height: 1080 } })
    const primary = makeOption({ id: 2, isPrimary: true, workArea: { x: 0, y: 0, width: 1920, height: 1080 } })

    expect(resolveStickDisplay([secondary, primary], EMPTY_PREFS)).toBe(primary)
  })

  it('falls back to the first display when nothing is primary and nothing else matches', () => {
    const first = makeOption({ id: 1 })
    const second = makeOption({ id: 2 })

    expect(resolveStickDisplay([first, second], EMPTY_PREFS)).toBe(first)
  })

  // ── Tier 1 — exact displayId ──────────────────────────────────────────────

  it('tier 1: an exact displayId match wins outright, even over a closer work area', () => {
    const wanted = makeOption({ id: 5, workArea: { x: 5000, y: 5000, width: 1920, height: 1080 } })
    const primary = makeOption({ id: 1, isPrimary: true, workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
    const prefs: StickDisplayPrefs = { displayId: 5, savedWorkArea: null, savedScaleFactor: null }

    expect(resolveStickDisplay([primary, wanted], prefs)).toBe(wanted)
  })

  // ── Tier 2 — fuzzy work-area match ─────────────────────────────────────────

  it('tier 2: falls through to a fuzzy work-area match when the id is gone', () => {
    const survivor = makeOption({ id: 99, workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
    const prefs: StickDisplayPrefs = {
      // This id no longer exists — Windows reassigned it after a reboot.
      displayId: 3,
      // Within the ±8 px tolerance on every edge.
      savedWorkArea: { x: 4, y: -3, width: 1917, height: 1085 },
      savedScaleFactor: 1
    }

    expect(resolveStickDisplay([survivor], prefs)).toBe(survivor)
  })

  it('tier 2: a work area outside the ±8 px tolerance does not match', () => {
    const notClose = makeOption({ id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
    const prefs: StickDisplayPrefs = {
      displayId: null,
      savedWorkArea: { x: 20, y: 0, width: 1920, height: 1080 },
      savedScaleFactor: 1
    }

    // No match anywhere, no currentBounds either — falls all the way to tier 4.
    expect(resolveStickDisplay([notClose], prefs)).toBe(notClose)
  })

  it('tier 2: identical twins are disambiguated by saved scale factor first', () => {
    const workArea = { x: 0, y: 0, width: 1920, height: 1080 }
    const twinA = makeOption({ id: 1, workArea, scaleFactor: 1 })
    const twinB = makeOption({ id: 2, workArea, scaleFactor: 2 })
    const prefs: StickDisplayPrefs = { displayId: null, savedWorkArea: workArea, savedScaleFactor: 2 }

    expect(resolveStickDisplay([twinA, twinB], prefs)).toBe(twinB)
  })

  it('tier 2: twins tied on scale factor too are disambiguated by primary', () => {
    const workArea = { x: 0, y: 0, width: 1920, height: 1080 }
    const twinA = makeOption({ id: 1, workArea, scaleFactor: 1, isPrimary: false })
    const twinB = makeOption({ id: 2, workArea, scaleFactor: 1, isPrimary: true })
    const prefs: StickDisplayPrefs = { displayId: null, savedWorkArea: workArea, savedScaleFactor: 1 }

    expect(resolveStickDisplay([twinA, twinB], prefs)).toBe(twinB)
  })

  // ── Tier 3 — nearest to current bounds ────────────────────────────────────

  it('tier 3: nearest display to currentBounds wins when nothing else matches', () => {
    const far = makeOption({ id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
    const near = makeOption({ id: 2, workArea: { x: 5000, y: 0, width: 1920, height: 1080 } })
    // No displayId, no savedWorkArea — nothing for tiers 1/2 to grab onto.
    const prefs: StickDisplayPrefs = EMPTY_PREFS
    const currentBounds = { x: 5100, y: 100, width: 400, height: 300 }

    expect(resolveStickDisplay([far, near], prefs, currentBounds)).toBe(near)
  })
})
