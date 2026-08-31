---
id: zgs3rs
title: P1 - Lop platform adapter
status: Done
priority: high
labels:
  - phase
  - cross-platform
createdAt: '2026-08-31T03:46:11.141Z'
updatedAt: '2026-08-31T05:53:35.035Z'
timeSpent: 0
---
# P1 - Lop platform adapter

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Dinh nghia PlatformAdapter roi hien thuc ba lan cho win32/darwin/linux: noActivate, fullscreen, autostart, secrets, shell, paths. Ke ca nhanh collapseStrategy resize cho Linux.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 electron/platform/types.ts dinh nghia day du interface
- [ ] #2 Ca ba thu muc win32 darwin linux hien thuc het interface, khong con TODO
- [ ] #3 Moi ham suy bien an toan khi khong ho tro thay vi nem loi
- [ ] #4 Co test cho viec chon adapter theo process.platform
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
PlatformAdapter 3 OS, 109 test platform pass, interface khop quota+clipboard.
<!-- SECTION:NOTES:END -->

