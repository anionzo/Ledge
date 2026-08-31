/**
 * Which physical monitor the hub sticks to.
 *
 * Adapted from Edge-Drop electron/main/geometry.ts (Apache-2.0).
 *
 * Windows re-numbers displays freely: unplug a dock, wake from sleep, or let
 * Windows Update reboot the box, and the numeric `Display.id` the user picked
 * yesterday can belong to a different monitor today — or to none. Edge-Drop's
 * answer is a 4-tier resolve that degrades gracefully from "exact" to
 * "good enough" to "give up gracefully", and this is the same ladder:
 *
 *   1. Exact `displayId` match — trustworthy only within the current session,
 *      since Electron reassigns ids on every topology change.
 *   2. Fuzzy `savedWorkArea` match (±8 px on every edge) — survives a reboot,
 *      because a monitor's physical position and size do not change even when
 *      its id does. Twin monitors (matched pairs, mirrored, or an identical
 *      model on both sides of a dock) can tie on work area alone, so ties are
 *      broken first by saved scale factor, then by preferring the primary.
 *   3. Nearest display to the window's current bounds — used when nothing was
 *      ever saved, or the saved monitor is simply gone. Keeps the panel on
 *      whichever screen it was already closest to, rather than teleporting it.
 *   4. Primary display, or failing that the first one Electron reports.
 *
 * Every tier is a fallthrough, never a throw: a monitor can be unplugged at
 * any moment, mid-drag, mid-reboot, mid-anything, and the hub must still land
 * somewhere reachable.
 */
import { screen, type Display } from 'electron'
import type { DisplayOption } from '../../../shared/ipc'
import type { ScreenRect, StickDisplayPrefs } from '../../../shared/types/settings'

/** Tolerance for the fuzzy work-area match in tier 2, in DIP. */
const WORK_AREA_TOLERANCE_PX = 8

/**
 * Turn Electron's raw `Display` list into what the Settings picker and the
 * resolver both need. Takes the array rather than calling `screen` itself so
 * it stays testable without an Electron instance — see `listDisplayOptions`
 * for the real entry point.
 */
export function describeDisplays(
  displays: readonly Display[],
  primaryId?: number
): DisplayOption[] {
  return displays.map((display, index) => {
    // Electron's `Display` carries no `isPrimary` flag, so the caller passes
    // the id from `screen.getPrimaryDisplay()` where it has one. Without it,
    // fall back to the desktop origin: on Windows and macOS the primary
    // monitor is the one anchored at (0, 0) and every other monitor's bounds
    // are offset from it. That is a good heuristic rather than a guarantee —
    // which is why the real entry point below does not rely on it.
    const isPrimary =
      primaryId !== undefined
        ? display.id === primaryId
        : display.bounds.x === 0 && display.bounds.y === 0
    const { workArea, scaleFactor } = display

    // Physical pixels, not DIP: a 3840×2160 panel at 200% scale reports a DIP
    // work area of 1920×1080, which would read as identical to an actual
    // 1920×1080 monitor at 100% in the picker. Multiplying back by the scale
    // factor is what Edge-Drop's README calls out as the fix.
    const physicalWidth = Math.round(workArea.width * scaleFactor)
    const physicalHeight = Math.round(workArea.height * scaleFactor)

    return {
      id: display.id,
      // "Primary" stays in English here — this string is assembled in main,
      // where `t()` is unreachable. The renderer translates the word back out
      // of it if the current locale needs to.
      label: `${isPrimary ? 'Primary' : `Display ${index + 1}`} · ${physicalWidth}×${physicalHeight}`,
      physicalWidth,
      physicalHeight,
      scaleFactor,
      isPrimary,
      workArea: { x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height }
    }
  })
}

/** Every display the hub could dock to, straight from the live `screen` module. */
export function listDisplayOptions(): DisplayOption[] {
  // `getPrimaryDisplay` can throw before the app is ready on some platforms;
  // the origin heuristic in `describeDisplays` is the fallback, and a wrong
  // "Primary" tag in a label is a cosmetic problem, not a functional one.
  let primaryId: number | undefined
  try {
    primaryId = screen.getPrimaryDisplay().id
  } catch {
    primaryId = undefined
  }
  return describeDisplays(screen.getAllDisplays(), primaryId)
}

function closeEnough(a: ScreenRect, b: DisplayOption['workArea']): boolean {
  return (
    Math.abs(a.x - b.x) <= WORK_AREA_TOLERANCE_PX &&
    Math.abs(a.y - b.y) <= WORK_AREA_TOLERANCE_PX &&
    Math.abs(a.width - b.width) <= WORK_AREA_TOLERANCE_PX &&
    Math.abs(a.height - b.height) <= WORK_AREA_TOLERANCE_PX
  )
}

/**
 * The 4-tier resolve, as a pure function over an injected display list — no
 * `screen` calls in here, which is what lets `tests/displays.test.ts` exercise
 * every tier without an Electron instance. `resolveStickDisplayPrefs` below is
 * the version main actually calls.
 */
export function resolveStickDisplay(
  options: readonly DisplayOption[],
  prefs: StickDisplayPrefs,
  currentBounds?: { x: number; y: number; width: number; height: number } | null
): DisplayOption | null {
  if (options.length === 0) return null

  // Tier 1 — exact id, valid only for the lifetime of the current session.
  if (prefs.displayId !== null) {
    const exact = options.find((option) => option.id === prefs.displayId)
    if (exact) return exact
  }

  // Tier 2 — fuzzy work-area match, the one that survives a reboot.
  if (prefs.savedWorkArea) {
    const savedWorkArea = prefs.savedWorkArea
    const candidates = options.filter((option) => closeEnough(savedWorkArea, option.workArea))
    if (candidates.length === 1) {
      return candidates[0]
    }
    if (candidates.length > 1) {
      // Twins: same size and position (mirrored, or matched external
      // monitors). Scale factor is the next-best discriminator; if that still
      // does not narrow it down, prefer whichever twin is primary, then just
      // take the first — anything is better than throwing here.
      const byScale =
        prefs.savedScaleFactor !== null
          ? candidates.filter((option) => option.scaleFactor === prefs.savedScaleFactor)
          : []
      const narrowed = byScale.length > 0 ? byScale : candidates
      return narrowed.find((option) => option.isPrimary) ?? narrowed[0]
    }
  }

  // Tier 3 — nearest to wherever the window currently sits, centre to centre.
  if (currentBounds) {
    const cx = currentBounds.x + currentBounds.width / 2
    const cy = currentBounds.y + currentBounds.height / 2
    let nearest: DisplayOption | null = null
    let nearestDistance = Infinity
    for (const option of options) {
      const ox = option.workArea.x + option.workArea.width / 2
      const oy = option.workArea.y + option.workArea.height / 2
      const distance = Math.hypot(cx - ox, cy - oy)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearest = option
      }
    }
    if (nearest) return nearest
  }

  // Tier 4 — primary, or whatever Electron happened to list first.
  return options.find((option) => option.isPrimary) ?? options[0]
}

/**
 * Resolve against the live screen and hand back the prefs that should be
 * persisted. Writing the resolved work area and scale factor back after every
 * successful resolve is what feeds tier 2 on the *next* launch — without it, a
 * reboot that reshuffles ids would have nothing but a stale id to fall back
 * on, and would drop straight to tier 3/4 every time.
 *
 * When nothing resolves (an empty display list — should not happen, but
 * `resolveStickDisplay` never throws, so this does not either), the prefs come
 * back unchanged rather than being clobbered with nulls.
 */
export function resolveStickDisplayPrefs(prefs: StickDisplayPrefs): StickDisplayPrefs {
  const resolved = resolveStickDisplay(listDisplayOptions(), prefs)
  if (!resolved) return prefs

  return {
    displayId: resolved.id,
    savedWorkArea: { ...resolved.workArea },
    savedScaleFactor: resolved.scaleFactor
  }
}
