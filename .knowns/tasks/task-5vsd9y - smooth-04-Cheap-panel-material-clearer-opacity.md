---
id: 5vsd9y
title: "[smooth-04] Cheap panel material + clearer opacity"
status: done
priority: high
labels:
  - from-spec
  - spec:edge-drop-smoothness-wave
  - spec-date:2026-08-31
  - edge-drop
createdAt: '2026-08-31T16:29:28.489Z'
updatedAt: '2026-08-31T17:41:47.241Z'
completedAt: '2026-08-31T17:41:47.241Z'
timeSpent: 0
parent: mlncst
spec: specs/2026-08-31/edge-drop-smoothness-wave
fulfills:
  - AC-4
order: 40
---
# [smooth-04] Cheap panel material + clearer opacity

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stop using blur(24px) as the only hub material (Edge-Drop removed blur for 60/120 fps). Default panel opacity must read solid on a busy wallpaper. Keep the opacity slider 50-100% live via --bz-panel-opacity. One source of truth vs the 0.72/0.82/0.85 mismatch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Default hub material is a cheap fill (no 24px blur required to look finished)
- [x] #2 Opacity slider 50-100% updates both panels live; clamp 0.5-1
- [x] #3 Default is clearer than dark 0.72; tokens and Settings.panelOpacity agree
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. One opacity source: settings.panelOpacity -> --bz-panel-opacity. Default 0.92. Clamp 0.5-1 already in store.
2. Remove required blur(24px) as the hub material; cheap rgba fill default.
3. Finish AppearanceTab slider if WIP from Claude 5ce0c7ee; do not duplicate if already present.
4. Align tokens.css light/dark fallbacks with DEFAULT_SETTINGS (kill 0.72/0.82/0.85 split).
5. Visual check busy wallpaper + scroll 200 items.
D5=pass.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Read first: @doc/guides/smoothness/smoothness-wave-index then @doc/specs/2026-08-31/edge-drop-smoothness-wave @doc/research/edge-drop-smoothness-gap @doc/guides/edge-drop-port-sources @doc/guides/smoothness/smoothness-settings-and-ipc @doc/guides/smoothness/smoothness-verify-matrix. Fetch Edge-Drop main at implement time, do not trust this snapshot date. D1-D6 in the spec. Keep one hub + quota. Brief: @doc/guides/smoothness/smooth-04-cheap-material-brief Dirty/WIP: shared/types/settings.ts panelOpacity 0.85, tokens.css blur 24px, AppearanceTab slider, bridge.ts --bz-panel-opacity. If Claude session still live, wait or take over those files only.
<!-- SECTION:NOTES:END -->

