---
id: f4wasv
title: P4 - Hop nhat giao dien
status: Done
priority: medium
labels:
  - phase
  - ui
createdAt: '2026-08-31T03:46:37.148Z'
updatedAt: '2026-08-31T05:53:24.814Z'
timeSpent: 0
---
# P4 - Hop nhat giao dien

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Viet lai 4 component Tailwind cua agent-notch sang token CSS, gop cua so Cai dat thanh mot voi cac tab Behaviour Panels Agents Appearance About, dua chuoi moi vao i18n.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Khong con Tailwind trong dependencies
- [ ] #2 Mot cua so Settings duy nhat co du nam tab
- [ ] #3 Chuoi moi cua Gauge co trong i18n
- [ ] #4 Tuong phan dat chuan o ca light va dark tren nhieu loai nen desktop
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
XONG: Settings hop nhat cho mot khung: PanelsTab viet lai (mot frame, chon side ghi ca shelf.side+gauge.side, dien tich Clipboard/Quota on-off, so do mirror mot khung), AgentsTab them DeepSeek + editor custom 3 mode (Command/HTTP/Manual) x 2 shape (Percent/Balance), token la password field, xoa custom provider clear luon enabledProviders (fix orphan). typecheck web xanh.
<!-- SECTION:NOTES:END -->

