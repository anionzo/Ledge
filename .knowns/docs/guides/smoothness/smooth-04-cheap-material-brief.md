---
id: doc-f9a4263a9b88d758240474cf60b520e7
title: smooth-04 cheap material brief
description: Full implement context for blur removal and clearer panelOpacity.
createdAt: '2026-08-31T16:36:46.704Z'
updatedAt: '2026-08-31T16:36:46.704Z'
tags:
  - guide
  - smoothness
  - task-brief
---

# smooth-04 — cheap panel material + clearer opacity

**Task:** @task-5vsd9y | **AC:** spec AC-4 | **Priority:** high
**Depends:** none
**Conflict:** Claude session `5ce0c7ee` may still be patching `AppearanceTab.tsx`, `tokens.css`, `bridge.ts`, `settings.ts`. If those files are dirty, rebase/finish rather than duplicate.

## Goal

Hub must read **solid enough** and **scroll at 60/120 fps**. Edge-Drop README: they **removed `backdrop-filter: blur()`** because it janks. Ledge currently:

- `src/design/tokens.css`: `--bz-glass-blur: blur(24px) saturate(1.15)` applied on the panel
- `--bz-glass: rgba(var(--bz-glass-rgb), var(--bz-panel-opacity))`
- Light default opacity 0.82 in CSS, dark 0.72 in CSS, Settings default `panelOpacity: 0.85` — **three sources**
- WIP slider in `src/settings/tabs/AppearanceTab.tsx` (50–100%, commit `percent/100`)
- `src/lib/bridge.ts` `useThemeAttributes` sets `--bz-panel-opacity`
- `electron/store/settings.ts` clamps 0.5–1

## Target behavior

- **One** runtime opacity: `settings.panelOpacity` → `--bz-panel-opacity` on `:root`
- CSS `--bz-panel-opacity` fallback = same number as `DEFAULT_SETTINGS.panelOpacity`
- **Change default to 0.92** (spec open question; this brief locks 0.92 unless the user says otherwise)
- Default material is a **fill** (`rgba(glass-rgb, opacity)`). Blur is optional and off-by-default, or a much smaller blur (4–8 px) if a hairline still needs it. Do not keep 24 px as the only look.
- `reduceMotion` does not need to disable opacity
- Both light and dark `--bz-glass-rgb` stay; only alpha is the knob

## Files

| File | Change |
|---|---|
| `src/design/tokens.css` | `--bz-panel-opacity: 0.92`; `--bz-glass-blur` none or tiny; apply blur only if a setting exists — prefer none |
| `shared/types/settings.ts` | default 0.92 |
| `electron/store/settings.ts` | clamp already; migrate undefined → 0.92 |
| `src/lib/bridge.ts` | already sets CSS var; keep |
| `src/settings/tabs/AppearanceTab.tsx` | slider; keys `settings.appearance.panel_opacity` |
| `src/i18n/index.ts` | add EN keys if missing (smooth-10 does vi) |
| `src/ui/styles/lightbox.css` | leave small overlay blur or match — lightbox is not the hub scroll path |

Do not add `panelBlur` setting in this task unless it is a 3-line follow-up. Default cheap fill is the AC.

## GPU motion (same task, small)

Where pin/filter transitions still animate `height`/`margin`, prefer `transform`/`opacity` like Edge-Drop. Touch only if you see layout jank while in these files. Do not rewrite the virtual list (`src/lib/virtual.ts` is fine).

## Verify

@doc/guides/smoothness/verify-matrix section 04. Dark + light + system. Wallpaper busy.

## Decision compliance

D5=pass (smoothness over decoration).
