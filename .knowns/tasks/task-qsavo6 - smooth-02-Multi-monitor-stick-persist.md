---
id: qsavo6
title: "[smooth-02] Multi-monitor stick + persist"
status: done
priority: high
labels:
  - from-spec
  - spec:edge-drop-smoothness-wave
  - spec-date:2026-08-31
  - edge-drop
createdAt: '2026-08-31T16:29:28.298Z'
updatedAt: '2026-08-31T17:41:47.090Z'
completedAt: '2026-08-31T17:41:47.090Z'
timeSpent: 0
parent: mlncst
spec: specs/2026-08-31/edge-drop-smoothness-wave
fulfills:
  - AC-2
order: 20
---
# [smooth-02] Multi-monitor stick + persist

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Expose display picker in Settings > Panels. Persist physical monitor identity across reboot (Edge-Drop 4-tier). Wire PanelHost.displayId which already exists but is unused from settings.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Settings lists displays with physical resolution and left/right
- [x] #2 Chosen display+side docks the hub after restart even if Electron display ids change
- [x] #3 macOS/Linux still work via PlatformAdapter; missing APIs degrade to primary display
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Port computeStickBounds 4-tier into electron/main/panels/displays.ts with injected DisplayInfo list (testable).
2. Settings v2 stickDisplay {displayId,savedWorkArea,savedScaleFactor}. Bump SETTINGS_VERSION. IPC displays:list.
3. syncPanels must pass displayId into PanelHost deps (currently omitted in electron/main/index.ts).
4. PanelsTab select with physical width x height. Write back resolved geometry after dock.
5. tests/displays.test.ts for tiers 1-4. Verify reboot + unplug fallback.
D2=pass D3=pass.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Read first: @doc/guides/smoothness/smoothness-wave-index then @doc/specs/2026-08-31/edge-drop-smoothness-wave @doc/research/edge-drop-smoothness-gap @doc/guides/edge-drop-port-sources @doc/guides/smoothness/smoothness-settings-and-ipc @doc/guides/smoothness/smoothness-verify-matrix. Fetch Edge-Drop main at implement time, do not trust this snapshot date. D1-D6 in the spec. Keep one hub + quota. Brief: @doc/guides/smoothness/smooth-02-multi-monitor-brief PanelHost.#display already honors deps.displayId (line ~364) but syncPanels does not pass it. Upstream geometry.ts tiers: id, fuzzy workArea +/-8px + scale, nearest, primary. https://raw.githubusercontent.com/Deepender25/Edge-Drop/main/electron/main/geometry.ts
<!-- SECTION:NOTES:END -->

