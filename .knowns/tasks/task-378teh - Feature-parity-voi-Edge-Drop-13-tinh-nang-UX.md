---
id: 378teh
title: Feature parity voi Edge-Drop (13 tinh nang UX)
status: in-progress
priority: high
labels:
  - feature
  - ux
createdAt: '2026-08-31T07:07:21.281Z'
updatedAt: '2026-08-31T07:33:10.968Z'
timeSpent: 0
---
# Feature parity voi Edge-Drop (13 tinh nang UX)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Nguoi dung yeu cau lay HET tinh nang Edge-Drop con thieu vao Ledge: (1) filter tabs All/Text/Links/Images/Files, (2) thumbnail anh trong card qua ledge://thumb, (3) stack fan 3D cho collection + sub-item drag/split/merge, (4) url preview unfurl link, (5) drag-IN tha file vao shelf, (6) copy indicator flare (CopyIndicatorCurve+particleEvents) gated indicatorStyle, (7) am thanh soundEffects noi vao events, (8) ClearMenu clear all/unpinned, (9) HotkeyRecorder trong settings, (10) controls setting moi (incognito/hoverActivation/textScale/previewEnabled/indicatorStyle), (11) ap dung settings trong hub, (12) onboarding first-run, (13) changelog What's New. Da them field vao ShelfSettings + wire incognito->engine.pause trong main. Subagent dang port src/**.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 13 tinh nang co trong app, tsc web + build xanh
- [ ] #2 Verify bang app that (chup)
<!-- AC:END -->

