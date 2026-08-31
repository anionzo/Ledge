---
id: doc-e5982d8bd5e12d6b1431fcbe9a7725d5
title: smooth-09 settings feel brief
description: Full implement context for magnetic sliders and 1.75s stick preview.
createdAt: '2026-08-31T16:36:47.123Z'
updatedAt: '2026-08-31T16:36:47.123Z'
tags:
  - guide
  - smoothness
  - task-brief
---

# smooth-09 — settings feel

**Task:** @task-ayx44m | **AC:** spec AC-2 (preview) + AC-4 (slider) | **Priority:** low
**Depends:** @task-qsavo6 display list, @task-5vsd9y opacity slider

## Goal

Micro-feel from Edge-Drop settings **without** collapsing Ledge's 5 tabs to 3.

Keep: Behaviour, Panels, Agents, Appearance, About.

Port:

1. Magnetic 5% slider: live 1:1 while dragging (`step` fine), snap to 5% on pointer up. Tick marks + live `%` badge.
2. 1.75 s interactive preview when changing **side** or **display**: apply temporarily, then commit (or revert if they click away — Edge-Drop applies preview then keeps it). Match Edge-Drop: 1.75 s preview window of the new stick, then it stays.

## Current Ledge

- `src/settings/components/Controls.tsx` already has `Slider` (used by Appearance opacity WIP and Panels height/proximity)
- `PanelsTab.setSide` commits immediately
- Independent scroll-per-tab is nice-to-have; only do it if cheap (`tabScrollPositions`)

## Files

| File | Change |
|---|---|
| `src/settings/components/Controls.tsx` | magnetic snap on commit; live `onInput` vs `onCommit` |
| `src/settings/tabs/PanelsTab.tsx` | preview timer 1750 ms for side + display |
| `src/lib/soundEffects.ts` | `playDialTickSound` already exists — use on tick |

Constant: `PREVIEW_MS = 1750`.

Do not add sponsor/quit-pill from Edge-Drop.

## Verify

@doc/guides/smoothness/verify-matrix section 09.
