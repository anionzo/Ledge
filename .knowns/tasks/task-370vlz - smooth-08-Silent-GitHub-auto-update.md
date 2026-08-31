---
id: 370vlz
title: "[smooth-08] Silent GitHub auto-update"
status: todo
priority: high
labels:
  - from-spec
  - spec:edge-drop-smoothness-wave
  - spec-date:2026-08-31
  - edge-drop
createdAt: '2026-08-31T16:29:54.597Z'
updatedAt: '2026-08-31T16:37:43.240Z'
timeSpent: 0
parent: mlncst
spec: specs/2026-08-31/edge-drop-smoothness-wave
fulfills:
  - AC-8
order: 80
---
# [smooth-08] Silent GitHub auto-update

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
electron-updater is in package.json with zero call sites. Port Edge-Drop updater.ts, retarget anionzo/Ledge, gate Microsoft Store/MSIX via isStoreBuild, add Settings banner Restart to update.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Packaged GitHub NSIS build checks anionzo/Ledge releases and can Restart to install
- [ ] #2 isStoreBuild() skips updater entirely
- [ ] #3 Unpackaged dev does not download updates by default
- [ ] #4 Settings shows a banner only when an update is downloaded or available
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Port updater.ts + isStoreBuild config.ts. Change GitHub repo Deepender25/Edge-Drop -> anionzo/Ledge (package.json publish already).
2. initAutoUpdater after app ready. autoUpdates setting default true. Store/MSIX: no net.
3. IPC status/check/download/quit-and-install + pushes available/downloaded.
4. Settings chrome banner Restart. Unpackaged: no download.
5. Do not log secrets. D3=pass.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Read first: @doc/guides/smoothness/smoothness-wave-index then @doc/specs/2026-08-31/edge-drop-smoothness-wave @doc/research/edge-drop-smoothness-gap @doc/guides/edge-drop-port-sources @doc/guides/smoothness/smoothness-settings-and-ipc @doc/guides/smoothness/smoothness-verify-matrix. Fetch Edge-Drop main at implement time, do not trust this snapshot date. D1-D6 in the spec. Keep one hub + quota. Brief: @doc/guides/smoothness/smooth-08-auto-update-brief electron-updater is a dependency with ZERO call sites. Upstream: https://raw.githubusercontent.com/Deepender25/Edge-Drop/main/electron/main/updater.ts
<!-- SECTION:NOTES:END -->

