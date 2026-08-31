---
id: doc-54f8ad51c464358fbc4fa7f1d15efa4a
title: smooth-02 multi-monitor brief
description: Full implement context for 4-tier display persist and picker.
createdAt: '2026-08-31T16:36:46.489Z'
updatedAt: '2026-08-31T16:36:46.489Z'
tags:
  - guide
  - smoothness
  - task-brief
---

# smooth-02 — multi-monitor stick + persist

**Task:** @task-qsavo6 | **AC:** spec AC-2 | **Priority:** high
**Depends:** none (pairs with 01's WorkAreaCache)
**Unlocks:** 09 settings preview of display

## Goal

User picks which display the hub sticks to (left/right already exists). Choice survives Windows re-assigning numeric display ids on reboot (Edge-Drop 4-tier).

## Current Ledge

- `PanelHost.#display()` (`electron/main/panels/PanelHost.ts` ~364) honors `deps.displayId` **if passed**.
- `syncPanels` in `electron/main/index.ts` ~132 constructs `PanelHost` with `{ platform, preloadPath }` — **no displayId**.
- Settings `PanelsTab` has Left/Right only. No display list.
- `cursorPoll` comments mention two panels on different displays; runtime is **one** hub.

## Upstream algorithm (`geometry.ts` `computeStickBounds`)

Fetch: https://raw.githubusercontent.com/Deepender25/Edge-Drop/main/electron/main/geometry.ts

Tiers:

1. Exact `displayId` (same session)
2. Fuzzy `savedWorkArea` ± 8 px, then `savedScaleFactor` if twins, then primary among twins
3. Nearest display to current window bounds
4. Primary / first

Also persist `resolvedDisplay` workArea + scale after every successful resolve so reboot has Tier 2 data.

Physical resolution for labels: `Math.round(workArea.width * scaleFactor)` × `Math.round(workArea.height * scaleFactor)` — Edge-Drop README calls this out for 3840×2160 vs 1920×1080@2x.

## Settings / IPC

See @doc/guides/smoothness/settings-and-ipc

- `Settings.stickDisplay: { displayId, savedWorkArea, savedScaleFactor }`
- `displays:list` invoke
- `SETTINGS_VERSION` → 2
- On successful dock, write back resolved geometry via `saveSettings` (avoid loop: only if values changed)

## Ledge files

| File | Change |
|---|---|
| `electron/main/panels/displays.ts` | **New.** Port `computeStickBounds` + `getDisplayListOptions()` using `screen.getAllDisplays()`. Electron import allowed here (not in stickProbe). |
| `electron/main/index.ts` `syncPanels` | Pass resolved `displayId` into `PanelHost` deps. Re-resolve on settings change and `screen.on('display-added'/'display-removed'/'display-metrics-changed')`. |
| `electron/main/panels/PanelHost.ts` | After create, may call `setPosition` from computeStickBounds; keep `computePanelBounds` for heightRatio/triggerAlign. |
| `shared/types/settings.ts` | `stickDisplay` |
| `electron/store/settings.ts` | migrate defaults |
| `electron/main/ipc/index.ts` | `displays:list` |
| `electron/preload/index.ts` | allow channel |
| `src/settings/tabs/PanelsTab.tsx` | display `<Select>` under edge |
| `src/i18n/index.ts` | `settings.panels.display`, `settings.panels.display.primary` |
| `tests/displays.test.ts` | 4-tier with fake `DisplayInfo[]` (pure function, no electron) — put pure resolve in `displays.ts` with injected list |

## Hub vs two windows

One frame. Writing `shelf.side` + `gauge.side` together stays (`setSide`). `stickDisplay` is top-level, not per-panel.

## Verify

@doc/guides/smoothness/verify-matrix section 02. Unplug test: no throw, fallback primary.

## Decision compliance

D2=pass (one hub). D3=pass (port geometry.ts, keep PanelHost).
