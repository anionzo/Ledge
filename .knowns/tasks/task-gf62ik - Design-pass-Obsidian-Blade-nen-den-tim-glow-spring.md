---
id: gf62ik
title: Design pass Obsidian Blade (nen den + tim glow + spring nay)
status: done
priority: medium
labels:
  - design
  - ui
createdAt: '2026-08-31T07:33:43.554Z'
updatedAt: '2026-09-02T08:50:03.150Z'
completedAt: '2026-08-31T08:23:36.630Z'
timeSpent: 0
---
# Design pass Obsidian Blade (nen den + tim glow + spring nay)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Nguoi dung muon lay design dep nhu Edge-Drop. Edge-Drop tokens: nen den nhieu lop #000/#060608/#0c0c10/#141418, glass rgba(12,12,16,.72), accent tim #8b5cf6 + glow rgba(139,92,246,.55), vien 1px sang trong + bong sau 0 30px 80px, bo goc blade 22px/card 14px/pill, spring overshoot cubic-bezier(.34,1.56,.64,1) 140/240ms. Ap vao src/design/tokens.css giu mau ngu nghia ok/warn/crit + mirroring + reduced-motion. Lam o wave cuoi sau khi 2 subagent xong.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tokens.css doi sang Obsidian, ca 2 theme van dung duoc
- [ ] #2 spring/glow ap dung, tat khi reduced-motion
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Obsidian Blade ap dung: nen den nhieu lop, accent tim #8b5cf6+glow, shadow sau, blade 22px, spring nay. Light theme giu dung duoc. Values-only, 0 rename token.
[2026-09-02 Lead] Bug fix da ship: item-card.css hover lift dung box-shadow: 0 1px 3px var(--bz-shadow) — nhung --bz-shadow la shadow DA LOP bat dau bang inset, nen layer dau sai cu phap va bi browser bo (cu nhac hover mat bong, chi con hairline). Da them token --bz-lift (light + 2 scope dark) tai design/tokens.css va doi item-card.css:77 sang var(--bz-lift). Architect (Grok no-edits) da giao backlog 10 muc polish — xem task moi.
<!-- SECTION:NOTES:END -->

