---
id: ma5ui8
title: "[smooth-03] Proximity beacon + trigger clipPath"
status: todo
priority: medium
labels:
  - from-spec
  - spec:edge-drop-smoothness-wave
  - spec-date:2026-08-31
  - edge-drop
createdAt: '2026-08-31T16:29:28.398Z'
updatedAt: '2026-08-31T16:37:42.743Z'
timeSpent: 0
parent: mlncst
spec: specs/2026-08-31/edge-drop-smoothness-wave
fulfills:
  - AC-3
order: 30
---
# [smooth-03] Proximity beacon + trigger clipPath

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When the cursor hits the stuck edge outside the trigger Y strip, flash a 1.5px hairline beacon once. CSS clipPath of the hub must match Top/Center/Bottom trigger geometry from main.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Misaligned edge hover shows a one-shot proximity beacon, then stops
- [ ] #2 Trigger align Top/Center/Bottom visually matches the hover strip
- [ ] #3 Beacon does not steal clicks (click-through still holds when collapsed)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend EdgeCursorEvent with edgeHit (or miss) so strip-miss is once-per-approach, not 60Hz.
2. Renderer hairline 1.5px pointer-events none; skip pulse if reduceMotion.
3. CSS clipPath of collapsed hub matches shelf.heightRatio + triggerAlign used by PanelHost.triggerRect.
4. Must not open panel and must not steal clicks while click-through.
5. Manual: trigger Center, hover top of edge = beacon only.
D2=pass D5=pass.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Read first: @doc/guides/smoothness/smoothness-wave-index then @doc/specs/2026-08-31/edge-drop-smoothness-wave @doc/research/edge-drop-smoothness-gap @doc/guides/edge-drop-port-sources @doc/guides/smoothness/smoothness-settings-and-ipc @doc/guides/smoothness/smoothness-verify-matrix. Fetch Edge-Drop main at implement time, do not trust this snapshot date. D1-D6 in the spec. Keep one hub + quota. Brief: @doc/guides/smoothness/smooth-03-proximity-beacon-brief Files: cursorPoll.ts emit, src/hub/App.tsx, hub.css / panel.css. Prefer extra fields on existing panel:cursor-edge over a new channel.
<!-- SECTION:NOTES:END -->

