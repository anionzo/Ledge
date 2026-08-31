---
id: doc-0bee1e28e59092135d6dab6e927737e8
title: Edge-Drop smoothness gap
description: 'Gap matrix: current Edge-Drop main vs Ledge v0.1.3. Source of truth before porting smoothness.'
createdAt: '2026-08-31T16:27:52.560Z'
updatedAt: '2026-08-31T16:27:52.560Z'
tags:
  - edge-drop
  - gap
  - shelf
---

# Edge-Drop smoothness gap

Gap analysis between **current Edge-Drop `main`** and **Ledge v0.1.3**. Use this as the source of truth before porting. Do not treat closed task `@task-378teh` as "full Edge-Drop parity" — that wave only landed 13 shelf UX features; Edge-Drop has moved on, and Ledge still feels less smooth.

**Upstream:** [Deepender25/Edge-Drop](https://github.com/Deepender25/Edge-Drop) (Apache-2.0). README + `FEATURES.md` + `electron/main/{stickProbe,updater,drag,window}.ts` as of 2026-08-31.

**Product constraint:** keep Ledge as **one hub frame + quota HUD**. Port shelf *feel* and proven engines. Do not drop quota, do not copy Edge-Drop's sponsor UI, and do not claim 31 complete locales.

## Why Ledge feels less smooth

Edge-Drop's README is explicit: they **removed `backdrop-filter: blur()`** from UI surfaces to stop CPU raster jank at 60/120 fps. Ledge still uses `--bz-glass-blur: blur(24px) saturate(1.15)` on the panel (`src/design/tokens.css`). Combined with a thinner default glass (dark theme `--bz-panel-opacity: 0.72`) the hub reads faint *and* costs compositor work on every open/scroll.

Edge-Drop also spent the last wave on **seam-aware multi-monitor math** (`stickProbe.ts`: own-pixel arming + intent speed 1.5 px/ms + rest-as-intent 3 frames). Ledge's `cursorPoll.ts` only has a cheaper traversal lockout (`TRAVERSAL_SPEED_PX_PER_MS = 2.2`, 250 ms). Inner-monitor boundaries still false-open.

## Already in Ledge (do not re-port)

| Capability | Ledge evidence | Edge-Drop analogue |
|---|---|---|
| Edge hover + click-through / resize collapse | `PanelHost.ts`, `cursorPoll.ts` | `window.ts` |
| Adaptive 16 ms / battery poll + suspend | `cursorPoll.ts` | `window.ts` + `powerMonitor` |
| Fullscreen game suppress + desktop class filter | `electron/platform/win32/fullscreen.ts` | `fullscreen.ts` |
| Native OLE drag-out + hover prestage | `electron/features/clipboard/drag.ts` `prestageDrag` | `drag.ts` |
| Thumbnails `ledge://thumb/` + full `ledge://id` | `imageProtocol.ts`, `ItemCard.tsx` | `edgelocal://thumb/` |
| Filter tabs All/Text/Links/Images/Files | `FilterTabs.tsx` | 5-category suite |
| Stacks merge/split, drag-in, URL preview | `ItemCard.tsx`, `dragIn.ts` | Fluid bundles |
| Copy indicator, sounds, HotkeyRecorder | `CopyIndicatorCurve.tsx`, `soundEffects.ts` | same names |
| Incognito, hover activation, text scale, preview | `ShelfSettings` | Behaviour tab |
| Virtual list | `src/lib/virtual.ts` | `content-visibility` + windowing |
| Sleep/wake clipboard re-seed | `ClipboardWatcher.ts` `powerMonitor` | same |
| Autostart `--hidden` self-heal path | `electron/platform/win32/autostart.ts` | `loginItems.ts` |
| Image lightbox in preview sheet | `src/ui/Lightbox.tsx` + `PreviewSheet.tsx` | preview zoom |
| Payload-on-disk for long text | `ItemStore` + `shelf:full-text` | `payloads/<id>.txt` |

`@task-378teh` (done) covered the 13-feature shelf port. Remaining work is **feel, geometry, drag integrity, history hygiene, updater**.

## Missing or weaker — port these

### P0 — edge geometry (this is the smoothness)

| Gap | Edge-Drop | Ledge today | Port from |
|---|---|---|---|
| Seam-aware arming | `probeSeamAware`: own pixels, 1.5 px/ms, rest 3 frames | Speed lockout only, 2.2 px/ms, 250 ms timer | `electron/main/stickProbe.ts` + tests |
| Versioned work-area cache | `workAreaCache.ts` | Re-reads `workArea()` every tick | `workAreaCache.ts` |
| Mixed-DPI garbage guard | skip if client coords outside [-5000, 15000] | not present | `stickProbe.ts` |
| Multi-monitor picker | `getDisplayListOptions()`, physical res, persist across reboot (4-tier ID) | `PanelHost.displayId` exists, **not in Settings** | `geometry.ts`, `window.ts`, settings Position |
| Rest-as-intent at interior seams | 140 ms / rest-frames | traversal lockout only | `stickProbe.ts` |
| Proximity beacon | 1.5 px hairline pulse when cursor hits edge **outside** trigger Y | none | renderer edge hint |
| Trigger clipPath = sensor | CSS clip matches Top/Center/Bottom strip | trigger rect in main, no matching clip | `window.ts` + panel CSS |

### P0 — motion / material

| Gap | Edge-Drop | Ledge today |
|---|---|---|
| Zero blur jank | Replaced blur with solid/semi-transparent fills | `backdrop-filter: blur(24px)` on panel |
| Spring open | Adaptive spring + elastic overshoot | Hub dwell then slide; less physical |
| GPU-only pin/tab transitions | `transform` + `opacity` | mixed |
| Magnetic 5% sliders | live drag + snap on release + tick marks | Settings sliders exist, weaker feel |
| 1.75 s position/display preview | temp interactive preview on side/monitor change | change applies immediately, no preview |

Panel **opacity knob** is a Ledge-native fix for "thanh mờ". Keep it, but default **clearer** (near-opaque). Do not fight Edge-Drop's "less blur" finding.

### P1 — drag / clipboard feel

| Gap | Edge-Drop | Ledge today | Port from |
|---|---|---|---|
| 5 px click vs drag | movement guard before paste | easy to mis-drag a click | renderer card pointer logic |
| Self-drop no-op | preload drop filter, no re-ingest / hitCount / split | weaker | `drag.ts` + preload |
| Z-band demotion | `setAlwaysOnTop(true, 'normal')` during drag | not found | `window.ts` / `PanelHost` |
| External-only hitCount | only drops that leave the shelf | paste always `store.touch` | `clipboard/index.ts` |
| Original filenames | preserved on capture/drag/export | partial | `stagedTemp.ts`, image capture |
| Spreadsheet vs screenshot | HTML/table cells stay text, not image | risk of image misclass | `formats/` |
| Snipping Tool names | `Screenshot YYYY-MM-DD HH.MM.SS.png` | generic image id | capture path |
| Animated GIF in stacks | `edgelocal://` playback | thumbs only | protocol + stack tile |
| Filter-scoped + time clear | 1h / 6h / 24h / all, scoped to active tab/search | Clear unpinned / all only | `ClearMenu` + ItemStore |
| Auto-delete timer | Never / 1h / 6h / 24h / 7d | none | settings + store prune |
| Clear unpinned on restart | setting | none | startup |

### P1 — product ops

| Gap | Edge-Drop | Ledge today | Port from |
|---|---|---|---|
| Silent auto-update | `updater.ts` + banner + Store gate | `electron-updater` in `package.json`, **zero call sites** | `electron/main/updater.ts` — retarget `anionzo/Ledge` |
| Manual check + Restart | Settings banner | none | settings Behaviour |
| `isStoreBuild()` | skip updater on MSIX | `build:win:store` exists, no gate | `config.ts` |

### P2 — do not blindly copy

- 31-locale "100% coverage" — Ledge `vi.json` is still Edge-Drop taxonomy; Gauge/Settings fall back to English. Ship **en + vi on Ledge keys**. Other packs stay ALIAS.
- Sponsor / Ko-fi / UPI blocks.
- Microsoft Store listing copy.
- AI clustering roadmap.
- Two-window left+right layout (Ledge already unified to one hub).
- Replacing `ledge://` with `edgelocal://`.

## Ledge-native leftovers (same wave, not in Edge-Drop)

These came from the live Claude session and still belong on the board:

1. Collapsed quota strip: **icon + % per provider**, not dots + one hottest (`QuotaStrip.tsx`).
2. Panel opacity default **clearer**, one CSS variable source (WIP `panelOpacity` vs `--bz-panel-opacity` 0.72/0.82 mismatch).
3. Language switch must cover Gauge + Settings, not only aliased shelf strings.

## Implementation rules

1. Prefer **file-level port + adapt** of Edge-Drop engines (`stickProbe`, `updater`, drag guards) over rewriting from README prose.
2. Keep Ledge names: `ledge://`, `window.ledge`, `PanelHost`, `PlatformAdapter`.
3. Every port needs a unit test where Edge-Drop already tests geometry (stickProbe is designed with zero Electron imports).
4. Attribution stays in `NOTICE` + `licenses/Edge-Drop-Apache-2.0.txt`.
5. Verify feel on **primary + a second monitor** and with **blur off / opacity high** before calling a task done.

## Refs

- @doc/specs/2026-08-31/edge-drop-smoothness
- @doc/guides/edge-drop-port-sources
- @task-378teh (closed 13-feature port — incomplete vs current upstream)
- https://github.com/Deepender25/Edge-Drop
- https://raw.githubusercontent.com/Deepender25/Edge-Drop/main/README.md
- https://raw.githubusercontent.com/Deepender25/Edge-Drop/main/electron/main/stickProbe.ts
- https://raw.githubusercontent.com/Deepender25/Edge-Drop/main/electron/main/updater.ts
