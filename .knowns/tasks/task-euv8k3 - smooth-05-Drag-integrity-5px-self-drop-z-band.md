---
id: euv8k3
title: "[smooth-05] Drag integrity (5px, self-drop, z-band)"
status: todo
priority: high
labels:
  - from-spec
  - spec:edge-drop-smoothness-wave
  - spec-date:2026-08-31
  - edge-drop
createdAt: '2026-08-31T16:29:54.290Z'
updatedAt: '2026-08-31T16:37:42.963Z'
timeSpent: 0
parent: mlncst
spec: specs/2026-08-31/edge-drop-smoothness-wave
fulfills:
  - AC-5
order: 50
---
# [smooth-05] Drag integrity (5px, self-drop, z-band)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port Edge-Drop drag feel Ledge is missing: 5px click-vs-drag guard, self-drop onto the shelf is a no-op, z-band demotion during OLE drag, external-only hitCount, original filenames. Keep existing prestageDrag + startDrag.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Click under 5px still copies/pastes; drag beyond 5px starts OLE without a paste
- [ ] #2 Dropping a card back on the hub does not duplicate, split, or bump hitCount
- [ ] #3 During drag-out the window z-band demotes so Explorer/Word can receive the drop
- [ ] #4 Drag-out into Explorer still works with prestage
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract DRAG_THRESHOLD_PX=5; only send shelf:start-drag after 5px move. Keep send() sync, never invoke.
2. Self-drop no-op when draggingId set (dragIn.ts / hub onDrop).
3. Inject onDragBegin/End from main to demote always-on-top z-band then restore (PanelHost).
4. hitCount only for external drop or paste, not self-drop.
5. Verify click copy, Explorer drop, return-to-shelf, merge-on-card still work.
D3=pass.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Read first: @doc/guides/smoothness/smoothness-wave-index then @doc/specs/2026-08-31/edge-drop-smoothness-wave @doc/research/edge-drop-smoothness-gap @doc/guides/edge-drop-port-sources @doc/guides/smoothness/smoothness-settings-and-ipc @doc/guides/smoothness/smoothness-verify-matrix. Fetch Edge-Drop main at implement time, do not trust this snapshot date. D1-D6 in the spec. Keep one hub + quota. Brief: @doc/guides/smoothness/smooth-05-drag-integrity-brief Keep prestage on pointerenter (ItemCard.tsx ~122). startDrag in electron/features/clipboard/drag.ts. Do not await in dragstart.
<!-- SECTION:NOTES:END -->

