---
id: ayx44m
title: "[smooth-09] Settings feel (magnetic slider, 1.75s preview)"
status: done
priority: low
labels:
  - from-spec
  - spec:edge-drop-smoothness-wave
  - spec-date:2026-08-31
  - edge-drop
createdAt: '2026-08-31T16:29:54.706Z'
updatedAt: '2026-08-31T17:42:00.680Z'
completedAt: '2026-08-31T17:42:00.680Z'
timeSpent: 0
parent: mlncst
spec: specs/2026-08-31/edge-drop-smoothness-wave
fulfills:
  - AC-2
  - AC-4
order: 90
---
# [smooth-09] Settings feel (magnetic slider, 1.75s preview)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port Edge-Drop settings micro-feel: magnetic 5% tick slider with live drag, 1.75s interactive preview when changing side or display. Keep Ledge 5 tabs (do not collapse to Behaviour/Position/Appearance only).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Height/opacity sliders track 1:1 while dragging and snap to 5% on release
- [x] #2 Changing Left/Right or display shows a 1.75s live preview then commits
- [x] #3 Settings still has Behaviour, Panels, Agents, Appearance, About
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. After 02+04 exist, magnetic 5% snap on Slider commit; live onInput.
2. PREVIEW_MS=1750 for side + display change.
3. Keep five tabs. Dial ticks via playDialTickSound.
4. No sponsor/quit-pill port.
5. Manual slider + side preview.
D2=pass.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Read first: @doc/guides/smoothness/smoothness-wave-index then @doc/specs/2026-08-31/edge-drop-smoothness-wave @doc/research/edge-drop-smoothness-gap @doc/guides/edge-drop-port-sources @doc/guides/smoothness/smoothness-settings-and-ipc @doc/guides/smoothness/smoothness-verify-matrix. Fetch Edge-Drop main at implement time, do not trust this snapshot date. D1-D6 in the spec. Keep one hub + quota. Brief: @doc/guides/smoothness/smooth-09-settings-feel-brief Depends @task-qsavo6 @task-5vsd9y. Controls.tsx Slider, PanelsTab.setSide.
<!-- SECTION:NOTES:END -->

