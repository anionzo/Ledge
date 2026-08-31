---
id: mlncst
title: "[smooth-00] Edge-Drop smoothness wave"
status: todo
priority: high
labels:
  - from-spec
  - spec:edge-drop-smoothness-wave
  - spec-date:2026-08-31
  - edge-drop
  - parent
createdAt: '2026-08-31T16:29:09.400Z'
updatedAt: '2026-08-31T16:38:12.470Z'
timeSpent: 0
spec: specs/2026-08-31/edge-drop-smoothness-wave
order: 0
---
# [smooth-00] Edge-Drop smoothness wave

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Parent tracker. Port current Edge-Drop main shelf feel into Ledge hub. Do not implement until spec is approved if the operator wants SDD gates; user asked for the task board now. Follow @doc/research/edge-drop-smoothness-gap and @doc/guides/edge-drop-port-sources. Keep one hub + quota.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All child smooth-01..10 are done or explicitly wont-do
- [ ] #2 Ledge still one hub + quota; no Edge-Drop sponsor UI; NOTICE attribution intact
- [ ] #3 typecheck + test green on the wave branch
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Do not write product code on this parent.
2. Track children listed in @doc/guides/smoothness/smooth-00-wave-parent-brief.
3. Sequence: 01+04 first in parallel; 02 then 03; 05/06/07/08/10 parallel; 09 last.
4. Close only when every child is done or wont-do and npm test + typecheck are green.
5. Refuse sponsor UI, 31-locale fiction, protobuf expansion, two-window split.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Read first: @doc/guides/smoothness/smoothness-wave-index then @doc/specs/2026-08-31/edge-drop-smoothness-wave @doc/research/edge-drop-smoothness-gap @doc/guides/edge-drop-port-sources @doc/guides/smoothness/smoothness-settings-and-ipc @doc/guides/smoothness/smoothness-verify-matrix. Fetch Edge-Drop main at implement time, do not trust this snapshot date. D1-D6 in the spec. Keep one hub + quota. Brief: @doc/guides/smoothness/smooth-00-wave-parent-brief Children: @task-e6f62s @task-qsavo6 @task-ma5ui8 @task-5vsd9y @task-euv8k3 @task-gop97t @task-1jdmgn @task-370vlz @task-ayx44m @task-unlbvv
 Canonical docs: @doc/guides/smoothness/smoothness-wave-index @doc/guides/smoothness/smoothness-canonical-paths @doc/guides/smoothness/smoothness-settings-and-ipc @doc/guides/smoothness/smoothness-verify-matrix On disk: .knowns/docs/guides/smoothness/
<!-- SECTION:NOTES:END -->

