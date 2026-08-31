---
id: doc-038aae537128a3a0c04a4b5ba40d5261
title: Smoothness verify matrix
description: Per-task verification commands and manual checks.
createdAt: '2026-08-31T16:36:46.252Z'
updatedAt: '2026-08-31T16:36:46.252Z'
tags:
  - guide
  - smoothness
  - verify
---

# Smoothness wave — verify matrix

Run after each task. Quote this doc from the task plan.

## Always

```bash
npm test
npm run typecheck
knowns validate --entity <task-id>
```

Do not claim done on typecheck-only. Hover/drag need a packaged or `npm run dev` window.

## Per task

### 01 probe (@task-e6f62s)

- Unit: two virtual displays sharing an inner edge; cursor flicks through band with speed > 1.5 px/ms → `armedInEdge === false`
- Unit: same topology, cursor rests 3 frames inside own-side band → `armedInEdge === true`
- Unit: garbage coords (`clientX < -5000`) never poison `SeamTickState`
- Manual: two monitors, flick across inner edge, hub stays closed; pause on stuck edge, hub opens (~120 ms dwell still applies in `src/hub/App.tsx`)

### 02 monitors (@task-qsavo6)

- Settings → Panels lists every display with physical `width×scale × height×scale`
- Pick non-primary + Right, quit, relaunch: hub on same physical monitor
- Unplug that monitor: hub falls to primary, no throw (`PanelHost.#display` already falls through)

### 03 beacon (@task-ma5ui8)

- Trigger Center: hovering top of the edge flashes a 1.5 px hairline once, does not open
- Hovering the center strip opens (with dwell)
- Collapsed click-through: beacon must not capture clicks (`setIgnoreMouseEvents` still true until open)

### 04 material (@task-5vsd9y)

- Default hub text readable on a busy wallpaper without cranking slider
- Slider 50–100 live; 50 still ≥ 0.5 clamp
- Dark/light/system all honor one `--bz-panel-opacity`
- Scroll 200-item shelf: no blur-jank stutter vs current `blur(24px)` (subjective but compare before/after)

### 05 drag (@task-euv8k3)

- Click card: copy, no Explorer ghost
- Drag > 5 px into Explorer: file lands, `hitCount` +1
- Drag back onto hub empty area: no duplicate, no hitCount
- Drag onto another card: merge still works (existing `onDragOver`)
- Word/Explorer can receive drop (z-band demoted during drag)

### 06 clear (@task-gop97t)

- Filter Images + Clear 1h: only unpinned images from last hour go; text remains
- Search "foo" + Clear unpinned: only matching unpinned go
- Pinned never deleted
- Restart with `clearUnpinnedOnRestart`: pinned remain

### 07 capture (@task-1jdmgn)

- Copy Excel cells: kind text (or html-as-text), not image
- Win+Shift+S then drag out: filename `Screenshot YYYY-MM-DD HH.MM.SS.png`
- GIF in stack plays
- Click thumbnail on card: Lightbox without opening preview first

### 08 updater (@task-370vlz)

- Unpackaged `npm run dev`: no GitHub download
- Packaged GitHub build: banner when newer tag on `anionzo/Ledge`
- Fake store build / `isStoreBuild()` true: no check
- Restart installs downloaded update

### 09 settings (@task-ayx44m)

- Height slider live-tracks, snaps 5% on release
- Side change: 1.75 s preview then commit
- Five tabs remain

### 10 quota + i18n (@task-unlbvv)

- Collapsed strip: one icon + % (or —) per enabled provider
- Language Vietnamese: Settings tabs + quota strings Vietnamese
- README does not say "31-language UI, including full Vietnamese" unless vi pack is actually Ledge-keyed

## Quota honesty (never regress)

A provider that cannot prove a number shows a dash + reason. No invented weekly/hourly from protobuf. See `electron/features/quota/providers/antigravityCredits.ts`.
