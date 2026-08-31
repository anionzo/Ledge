---
id: doc-775a1cdce2904f7126c2674a4f9fe84f
title: smooth-03 proximity beacon brief
description: Full implement context for edge miss beacon and trigger clipPath.
createdAt: '2026-08-31T16:36:46.622Z'
updatedAt: '2026-08-31T16:36:46.622Z'
tags:
  - guide
  - smoothness
  - task-brief
---

# smooth-03 — proximity beacon + trigger clipPath

**Task:** @task-ma5ui8 | **AC:** spec AC-3 | **Priority:** medium
**Depends:** 01 so `inTriggerZone` is trustworthy. Can prototype on current poll.

## Goal

1. If the cursor is on the stuck edge **but outside the vertical trigger strip**, flash a 1.5 px hairline beacon once (Edge-Drop "Edge Location Hint") so the user finds the shelf.
2. The visible hub clip/mask matches Top / Center / Bottom trigger geometry.

## Current Ledge

- `PanelHost.triggerRect()` exists and is what the poll uses.
- `PanelsTab` already has trigger align Top/Center/Bottom.
- `src/hub/App.tsx` opens only when `event.inTriggerZone` (after 120 ms dwell).
- No miss signal, no hairline, no clipPath tied to the strip.
- Collapse: click-through full-size window (`PanelHost` comments). A visible beacon in the renderer would show in a transparent window — must be a few pixels and must not make the window interactive.

## Design

Main detects "on edge, not in strip":

- `distFromEdge <= proximityPx` AND NOT `withinStrip` AND NOT `armedInEdge` for open
- Emit `panel:proximity-miss` **once per approach** (edge-trigger, not 60 Hz)

Renderer:

- Draw a 1.5 px gradient hairline on the docked edge, pulse once (~400–600 ms), ignore pointer (`pointer-events: none`)
- Reduced motion: skip pulse, optional static 1-frame or skip entirely (`settings.reduceMotion`)

clipPath:

- When closed, the visible blade/grip should match `triggerAlign` + `heightRatio` so users don't hover "the window" that isn't the sensor.
- Main already sizes height via `computePanelBounds` + `triggerAlign` (`PanelHost.ts` `computePanelBounds`). Confirm closed grip + open panel both match; if the window is full work-area height under click-through, **CSS clipPath** on `.bz-panel` / hub root must clip to the same rect the poll uses.
- Pass strip metrics to renderer: either settings (`heightRatio`, `triggerAlign`) computed in CSS, or a push `panel:geometry`. Prefer computing in CSS from settings already on the hub (`settings.shelf.*`) to avoid a new channel unless they drift from main.

## Files

| File | Change |
|---|---|
| `electron/main/edge/cursorPoll.ts` | Detect miss; emit once |
| `shared/ipc.ts` | `panel:proximity-miss` if not folding into `panel:cursor-edge` |
| `src/hub/App.tsx` | Listen, set beacon state |
| `src/hub/styles/hub.css` | hairline + clipPath |
| `src/ui/Panel.tsx` / `src/ui/styles/panel.css` | origin/clip |

Prefer extending `EdgeCursorEvent` with `miss: boolean` over a new channel if it keeps preload smaller. Today `EdgeCursorEvent` is `{ distancePx, offsetPx, inTriggerZone }` (`cursorPoll.ts` emit). Adding `edgeHit: boolean` is enough: `edgeHit && !inTriggerZone` = miss.

## Do not

- Open the panel on a miss
- Steal clicks
- Beacon every tick

## Verify

@doc/guides/smoothness/verify-matrix section 03.
