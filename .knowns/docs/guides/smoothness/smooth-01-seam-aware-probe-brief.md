---
id: doc-63e806a1c72bab8271082253f3209635
title: smooth-01 seam-aware probe brief
description: Full implement context for stickProbe port into cursorPoll.
createdAt: '2026-08-31T16:36:46.405Z'
updatedAt: '2026-08-31T16:36:46.405Z'
tags:
  - guide
  - smoothness
  - task-brief
---

# smooth-01 — seam-aware edge probe

**Task:** @task-e6f62s | **AC:** spec AC-1 | **Priority:** high
**Depends:** none
**Unlocks:** 03 beacon (correct `inTriggerZone`), 02 (shares work-area cache)

## Goal

Replace Ledge's cheap traversal lockout with Edge-Drop's three-pillar seam policy so inner-monitor boundaries do not false-open the hub.

## Why Ledge feels worse

`electron/main/edge/cursorPoll.ts` today:

- `distanceToEdge` returns `null` if the cursor is **not inside** the work area. Crossing from the neighbour display is "other screen" → leave event, not a seam-aware rest.
- Speed gate: `TRAVERSAL_SPEED_PX_PER_MS = 2.2` + `TRAVERSAL_LOCKOUT_MS = 250` (clock, not rest).
- No garbage-coord guard.
- Re-reads `target.workArea()` every tick (16 ms) with no versioned cache.

Edge-Drop `stickProbe.ts` (fetch at implement time):

- `probeStickEdge`: client coords = cursor − workArea origin; garbage if outside [-5000, 15000]; `inEdge` if dist in [-30, hotZoneWidth]
- `probeSeamAware` pillars:
  1. Own-pixel arming: `distFromEdge >= 0` (the -30 overshoot is keep-open only, not arm)
  2. Intent speed: `MAX_INTENT_SPEED_PX_PER_MS = 1.5`
  3. Rest-as-intent: after a boundary cross, require `REST_FRAMES_REQUIRED = 3` slow frames **inside the own-side band**
- State is a `SeamTickState` object passed in/out — no module globals — so tests simulate topologies.

Constants to keep byte-equivalent unless a test proves otherwise:

- `FAST_POLL_PROXIMITY_PX = 450` (Edge-Drop) vs Ledge `FAST_BAND_PX = 160` — when porting, use Edge-Drop 450 for "stay fast" or document why 160 stays.
- Renderer open dwell remains `OPEN_DWELL_MS = 120` in `src/hub/App.tsx`. Probe only decides `inTriggerZone`; renderer still dwells.

## Ledge files to change

| File | Role |
|---|---|
| `electron/main/edge/stickProbe.ts` | **New.** Copy structure from upstream. Zero Electron imports. |
| `electron/main/edge/workAreaCache.ts` | **New.** Port `WorkAreaCache` class. |
| `electron/main/edge/cursorPoll.ts` | Drive `inTriggerZone` from `armedInEdge`. Keep adaptive 16/75/100 ms poll + battery + suppress. |
| `tests/stickProbe.test.ts` | **New.** Topology tests. |
| `electron/main/index.ts` `edgeTargets()` | Pass hotZoneWidth from `settings.shelf.edgeProximityPx`. |

Do not change `src/hub/App.tsx` dwell unless a probe test shows double-dwell is wrong.

## Port recipe

1. Fetch https://raw.githubusercontent.com/Deepender25/Edge-Drop/main/electron/main/stickProbe.ts and `workAreaCache.ts`.
2. Place under `electron/main/edge/`. Rename comments Edge-Drop → Ledge; keep algorithm.
3. Header: `Adapted from Edge-Drop electron/main/stickProbe.ts (Apache-2.0).`
4. In `createCursorPoll` tick:
   - Resolve workArea via `WorkAreaCache.get(displayId)`.
   - Call `probeSeamAware({ cursor, workArea, stickPosition: target.side, hotZoneWidth: target.proximityPx(), now }, state)`.
   - `inTriggerZone = result.armedInEdge && withinStrip` (vertical strip still from `target.triggerRect()`).
   - Persist `nextState` per target id.
5. Keep emit gating (`EMIT_MIN_DELTA_PX = 3`) so IPC does not flood.
6. `distancePx` for the renderer can stay "distance from edge" (`probe.distFromEdge`).

## Tests (must)

File `tests/stickProbe.test.ts` — no electron:

- Two displays 1920×1080 side by side; stick right edge of left display (inner seam).
- Flick: positions moving 10 px / 4 ms through the band → not armed.
- Rest: three frames dist 0–3 px, speed ~0 → armed.
- Garbage sample does not update lastPoint.
- Outer physical edge (no neighbour): slow approach still arms (pillars invisible).

## Verify

See @doc/guides/smoothness/verify-matrix section 01.

## Decision compliance

D1=pass D2=pass D3=pass D4=pass D5=pass D6=pass (attribution header)

## Out of scope

Display picker (02). Beacon (03). Changing `OPEN_DWELL_MS`.
