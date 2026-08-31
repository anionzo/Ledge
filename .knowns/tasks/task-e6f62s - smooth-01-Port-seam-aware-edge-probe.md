---
id: e6f62s
title: "[smooth-01] Port seam-aware edge probe"
status: todo
priority: high
labels:
  - from-spec
  - spec:edge-drop-smoothness-wave
  - spec-date:2026-08-31
  - edge-drop
createdAt: '2026-08-31T16:29:28.198Z'
updatedAt: '2026-08-31T16:37:42.552Z'
timeSpent: 0
parent: mlncst
spec: specs/2026-08-31/edge-drop-smoothness-wave
fulfills:
  - AC-1
order: 10
---
# [smooth-01] Port seam-aware edge probe

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port Edge-Drop stickProbe.ts (own-pixel arming, 1.5 px/ms intent speed, rest-as-intent 3 frames, garbage guard) into electron/main/edge/ and drive cursorPoll from armedInEdge. Zero Electron imports so topologies are unit-tested. See @doc/guides/edge-drop-port-sources.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 stickProbe.ts exists in Ledge with probeSeamAware + garbage guard, no Electron imports
- [ ] #2 cursorPoll uses armedInEdge; interior-seam flick does not open, rest does
- [ ] #3 Unit tests cover two-display crossing vs rest without Electron
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Fetch Edge-Drop electron/main/stickProbe.ts and workAreaCache.ts from current main.
2. Add electron/main/edge/stickProbe.ts (zero Electron imports) and workAreaCache.ts. Attribution header Apache-2.0.
3. Drive cursorPoll.ts inTriggerZone from probeSeamAware.armedInEdge AND triggerRect Y strip. Keep adaptive poll + emit gating.
4. Add tests/stickProbe.test.ts: inner-seam flick not armed, 3 rest frames armed, garbage ignored.
5. npm test && npm run typecheck. Manual two-monitor flick vs rest. See @doc/guides/smoothness/smoothness-verify-matrix.
D1=pass D2=pass D3=pass D5=pass D6=pass.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Read first: @doc/guides/smoothness/smoothness-wave-index then @doc/specs/2026-08-31/edge-drop-smoothness-wave @doc/research/edge-drop-smoothness-gap @doc/guides/edge-drop-port-sources @doc/guides/smoothness/smoothness-settings-and-ipc @doc/guides/smoothness/smoothness-verify-matrix. Fetch Edge-Drop main at implement time, do not trust this snapshot date. D1-D6 in the spec. Keep one hub + quota. Brief: @doc/guides/smoothness/smooth-01-seam-aware-probe-brief Ledge: electron/main/edge/cursorPoll.ts TRAVERSAL_SPEED 2.2/250ms is the thing to replace. Renderer OPEN_DWELL_MS 120 in src/hub/App.tsx stays. Constants: MAX_INTENT_SPEED 1.5, REST_FRAMES 3, garbage [-5000,15000]. Upstream: https://raw.githubusercontent.com/Deepender25/Edge-Drop/main/electron/main/stickProbe.ts
<!-- SECTION:NOTES:END -->

