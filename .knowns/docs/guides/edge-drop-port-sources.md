---
id: doc-3f8be37a65014017cfbb41d05da1dd3f
title: Edge-Drop port sources
description: File-level map of Edge-Drop main files to Ledge targets for the smoothness wave.
createdAt: '2026-08-31T16:27:59.945Z'
updatedAt: '2026-08-31T16:27:59.945Z'
tags:
  - guide
  - edge-drop
  - port
---

# Edge-Drop port sources

Where to copy from on https://github.com/Deepender25/Edge-Drop `main`, and where it lands in Ledge. Always fetch **current `main`**, not a remembered snapshot. Adapt names; do not keep `window.edge` or `edgelocal://`.

License: Apache-2.0. Keep `NOTICE` + `licenses/Edge-Drop-Apache-2.0.txt`. Short file header is enough: "Adapted from Edge-Drop `<path>`".

## Do this first (read, don't paste)

1. @doc/research/edge-drop-smoothness-gap — what is missing
2. @doc/specs/2026-08-31/edge-drop-smoothness — ACs
3. This map — which file

## Engine ports (high value)

| Upstream (Edge-Drop) | Ledge target | Notes |
|---|---|---|
| `electron/main/stickProbe.ts` | `electron/main/edge/stickProbe.ts` **new** | Zero Electron imports. Unit-test topologies. Drive `cursorPoll.ts` with `armedInEdge`. |
| `electron/main/workAreaCache.ts` | `electron/main/edge/workAreaCache.ts` **new** | Versioned display-change cache; stop querying geometry every 16 ms. |
| `electron/main/geometry.ts` | `electron/main/panels/displays.ts` **new** | `getDisplayListOptions()`, physical pixels, 4-tier persist. Wire into Settings + `PanelHost.displayId`. |
| `electron/main/updater.ts` | `electron/main/updater.ts` **new** | Retarget `anionzo/Ledge`. Gate `isStoreBuild()`. `electron-updater` is already a dependency with **no call sites**. |
| `electron/main/config.ts` (`isStoreBuild`) | `electron/main/config.ts` **new** | Needed by updater. |
| `electron/main/drag.ts` (z-band, self-drop, filename) | `electron/features/clipboard/drag.ts` + `PanelHost.ts` | Ledge already has `prestageDrag` / `startDrag`. Steal z-band demotion + self-drop only. |
| `electron/main/stagedTemp.ts` | `electron/features/clipboard/stagedTemp.ts` | Ledge already has this file — diff, don't replace blindly. |
| `electron/clipboard/formats.ts` spreadsheet / snip names | `electron/features/clipboard/formats/` | Win32 + HTML table vs image. |
| `electron/main/loginItems.ts` | `electron/platform/shared/loginItems.ts` | Ledge already ported most of this. |

## Renderer ports (feel)

| Upstream | Ledge target | Notes |
|---|---|---|
| Settings magnetic slider + 1.75 s preview | `src/settings/components/Controls.tsx`, `PanelsTab.tsx` | Keep Ledge 5-tab settings (Behaviour / Panels / Agents / Appearance / About). Do **not** collapse to Edge-Drop's 3 tabs. |
| Proximity beacon + clipPath | `src/hub/` + panel CSS | Main still owns the trigger rect; renderer draws the hint. |
| Click vs 5 px drag | `src/shelf/components/ItemCard.tsx` | Guard before click-to-copy. |
| Clear time windows + filter scope | `ClearMenu.tsx` + `ItemStore` | Need store API for "createdAt < now-N" and "ids matching current filter". |
| GIF in stack tiles | `ItemCard.tsx` stack fan + `ledge://` | Full GIF via protocol, not thumb. |
| Zero-blur material | `src/design/tokens.css` | Cheap fill default; opacity variable already WIP. |

## Do not copy

| Upstream | Why |
|---|---|
| `src/` wholesale | Ledge hub/quota/settings taxonomy is different |
| `public/` sponsor QR, Logo.gif as product mark | Different product |
| `edge-drop-translations/` as Ledge dictionaries | Wrong key taxonomy; ALIAS already loads `src/i18n/locales` |
| `window.edge` / `edgelocal://` | Ledge uses `window.ledge` / `ledge://` |
| Two BrowserWindows for shelf vs gauge | Ledge unified hub (`htmlEntry('hub')`) |

## Fetch commands

```bash
# latest files from upstream main
curl -sL https://raw.githubusercontent.com/Deepender25/Edge-Drop/main/electron/main/stickProbe.ts
curl -sL https://raw.githubusercontent.com/Deepender25/Edge-Drop/main/electron/main/updater.ts
curl -sL https://raw.githubusercontent.com/Deepender25/Edge-Drop/main/electron/main/workAreaCache.ts
curl -sL https://raw.githubusercontent.com/Deepender25/Edge-Drop/main/electron/main/geometry.ts
```

Or clone a sibling checkout and diff:

```bash
git clone --depth 1 https://github.com/Deepender25/Edge-Drop.git %TEMP%\Edge-Drop
```

## Verify after each port

- `npm test` — add stickProbe topology tests
- `npm run typecheck`
- Manual: two monitors, drag-out to Explorer, hover inner seam, opacity slider, update banner only on packaged GitHub build

## Refs

- @doc/research/edge-drop-smoothness-gap
- @doc/specs/2026-08-31/edge-drop-smoothness
- https://github.com/Deepender25/Edge-Drop
