---
id: gop97t
title: "[smooth-06] Filter-scoped and timed history clear"
status: todo
priority: medium
labels:
  - from-spec
  - spec:edge-drop-smoothness-wave
  - spec-date:2026-08-31
  - edge-drop
createdAt: '2026-08-31T16:29:54.399Z'
updatedAt: '2026-08-31T16:37:43.044Z'
timeSpent: 0
parent: mlncst
spec: specs/2026-08-31/edge-drop-smoothness-wave
fulfills:
  - AC-6
order: 60
---
# [smooth-06] Filter-scoped and timed history clear

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Clear menu currently only unpinned vs all. Port Edge-Drop 1h/6h/24h windows and filter/search scoping. Add auto-delete timer and clear-unpinned-on-restart. Never delete pinned.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Clear menu offers 1h, 6h, 24h, unpinned, all with confirm on destructive all
- [ ] #2 Active Images/Files/Links/Text filter or search restricts which unpinned ids are removed
- [ ] #3 autoDeleteHours and clearUnpinnedOnRestart settings exist and spare pinned items
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add shelf:clear-query IPC; keep shelf:clear(keepPinned) wrapper.
2. ItemStore.clearOlderThan + clearIds; never delete pinned.
3. ClearMenu: 1h/6h/24h/view-unpinned/all. Hub passes visible unpinned ids from matches/matchesFilter.
4. Settings autoDeleteHours 0|1|6|24|168 and clearUnpinnedOnRestart. Startup + interval prune.
5. tests/clipboard.test.ts age/id cases.
D2=pass.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Read first: @doc/guides/smoothness/smoothness-wave-index then @doc/specs/2026-08-31/edge-drop-smoothness-wave @doc/research/edge-drop-smoothness-gap @doc/guides/edge-drop-port-sources @doc/guides/smoothness/smoothness-settings-and-ipc @doc/guides/smoothness/smoothness-verify-matrix. Fetch Edge-Drop main at implement time, do not trust this snapshot date. D1-D6 in the spec. Keep one hub + quota. Brief: @doc/guides/smoothness/smooth-06-history-clear-brief Current: ClearMenu onClear(keepPinned), ipc shelf:clear, store.clear. describe.ts matches/matchesFilter. Schema in @doc/guides/smoothness/smoothness-settings-and-ipc
<!-- SECTION:NOTES:END -->

