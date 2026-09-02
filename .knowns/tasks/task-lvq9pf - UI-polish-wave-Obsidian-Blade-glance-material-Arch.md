---
id: lvq9pf
title: UI polish wave — Obsidian Blade glance + material (Architect backlog)
status: todo
priority: medium
labels:
  - ui
  - obsidian-blade
  - polish
createdAt: '2026-09-02T08:50:31.441Z'
updatedAt: '2026-09-02T09:33:27.344Z'
timeSpent: 0
---
# UI polish wave — Obsidian Blade glance + material (Architect backlog)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Goi polish CSS-first tu Architect (Grok no-edits, 2026-09-02). Tat ca low-risk, GPU-cheap, ton trong constraint: achromatic chrome, khong tang blur (smooth-04 fill la material), khong pulse vo han. Muc #10 (shadow token misuse) DA SHIP rieng trong task gf62ik.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 #1 Quota chip severity chrome: box-shadow hairline theo --bz-sev vao chip [data-severity] (QuotaStrip.tsx:97-111 / hub.css:253-297) — glance 'ai sap het' khong can mo rong
- [x] #2 #2 Cost Meter thanh instrument row: label mono + 2 figure tabular (ProviderSheet.tsx:186-204 / provider-sheet.css:185-197)
- [x] #3 #3 Window bar lit fill: glow theo --bz-sev + track 5px trong detail (provider-sheet.css:146-167)
- [x] #4 #4 Docked-edge violet falloff: inset rim side-scoped theo data-side (panel.css:38-48)
- [x] #5 Nice same-PR: #5 flare fillet rim, #6 provider-row hover lift parity, #7 balance topup glow, #8 quota strip denser rail
- [ ] #6 Neu wave drag: #9 drop stick scale(1.01) one-shot
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
[2026-09-02 Lead] Impl #1-#4 (must-consider) da giao Peer Engineer tren Codex gpt-5.6-luna (high). #5-#9 giu backlog. Lead se review diff + verify (typecheck/test) truoc khi accept.
[2026-09-02 Lead ACCEPT] #1-#4 impl xong boi Claude Sonnet 5 (code subagent), Lead review diff + verify: typecheck sach (node+web), 365/365 test pass (baseline giu nguyen). Files: hub.css (chip [data-severity] hairline), ProviderSheet.tsx + provider-sheet.css (Cost instrument row + window lit fill 5px), panel.css (edge violet falloff side-scoped), i18n en+ledge/vi.json (tach gauge.cost.label/today/month — dat dung lop ledge authoritative, 29 locale khac fallback English dung hanh vi cu). Overshoot placement OK (chi dung --bz-spring). #5-#8 (AC5) va #9 (AC6) van backlog. Chua commit.
[2026-09-02 Lead ACCEPT] #5-#8 impl Claude Sonnet 5, Lead review diff + verify: typecheck sach, 365/365 pass. #5 flare fillet rim :has([data-open]) scope; #6 provider-row lift overshoot (arriving) + reduced-motion kill; #7 topup glow + reset box-shadow:none o critical (chong bleed); #8 .bz-quota nen panel-2 55% + gap 5px, KHONG dung hairline severity cua #1. Luu y: nen strip theme sang can nhin bang mat. #9 (AC6, drag wave) hoan lai ngoai pham vi dot nay.
<!-- SECTION:NOTES:END -->

