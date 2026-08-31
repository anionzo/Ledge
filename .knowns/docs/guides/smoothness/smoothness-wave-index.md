---
id: doc-548d2d64667f7f58f3ca116f84f7007a
title: Smoothness wave index
description: 'Agent index for the Edge-Drop smoothness wave: read order, task map, decisions, fetch URLs.'
createdAt: '2026-08-31T16:36:46.070Z'
updatedAt: '2026-08-31T16:36:46.070Z'
tags:
  - guide
  - smoothness
  - index
---

# Smoothness wave — agent index

Canonical execution pack for the Edge-Drop → Ledge feel wave. Everything here lives in this repo's Knowns store (`.knowns/docs/guides/smoothness/`). Do not look in `%TEMP%`.

## Read in this order

1. @doc/specs/2026-08-31/edge-drop-smoothness-wave — ACs + locked decisions D1–D6
2. @doc/research/edge-drop-smoothness-gap — what is missing vs Edge-Drop `main`
3. @doc/guides/edge-drop-port-sources — upstream file → Ledge file
4. @doc/guides/smoothness/settings-and-ipc — schema/IPC deltas
5. @doc/guides/smoothness/verify-matrix — how to prove a task
6. The per-task brief linked from the task (`guides/smoothness/smooth-NN-*`)

Parent tracker: @task-mlncst

## Locked decisions (copy — do not reopen)

- D1: Source of truth is current Edge-Drop `main` (https://github.com/Deepender25/Edge-Drop), not closed @task-378teh.
- D2: Keep one hub + quota. Internal panel id stays `shelf`. `htmlEntry('hub')`.
- D3: Port engines, adapt names (`ledge://`, `window.ledge`, `PanelHost`, `PlatformAdapter`).
- D4: Out of scope: sponsor UI, fake 31 locales, Antigravity protobuf expansion, AI clustering.
- D5: Smoothness over decoration. Default material must be cheap (no required 24px blur). Opacity knob stays.
- D6: Apache-2.0 attribution via existing `NOTICE` + `licenses/Edge-Drop-Apache-2.0.txt`.

## Task map

| Order | Task | Brief | Upstream seed |
|---|---|---|---|
| 00 | @task-mlncst parent | @doc/guides/smoothness/smooth-00-wave | — |
| 01 | @task-e6f62s probe | @doc/guides/smoothness/smooth-01-probe | `electron/main/stickProbe.ts` |
| 02 | @task-qsavo6 monitors | @doc/guides/smoothness/smooth-02-monitors | `electron/main/geometry.ts` |
| 03 | @task-ma5ui8 beacon | @doc/guides/smoothness/smooth-03-beacon | README Edge Location Hint |
| 04 | @task-5vsd9y material | @doc/guides/smoothness/smooth-04-material | README zero blur jank |
| 05 | @task-euv8k3 drag | @doc/guides/smoothness/smooth-05-drag | `electron/main/drag.ts` |
| 06 | @task-gop97t clear | @doc/guides/smoothness/smooth-06-clear | Clear time windows |
| 07 | @task-1jdmgn capture | @doc/guides/smoothness/smooth-07-capture | formats + snipping |
| 08 | @task-370vlz updater | @doc/guides/smoothness/smooth-08-updater | `electron/main/updater.ts` |
| 09 | @task-ayx44m settings | @doc/guides/smoothness/smooth-09-settings | magnetic slider |
| 10 | @task-unlbvv quota+i18n | @doc/guides/smoothness/smooth-10-quota-i18n | Ledge-native |

## Parallelism

Safe in parallel after 01+02 land geometry types:

- 03 depends on triggerRect (exists) — can start after 01 emits `inTriggerZone` correctly
- 04 independent of 01
- 05 independent
- 06 independent
- 07 independent
- 08 independent
- 09 depends on 02 (display list) and 04 (opacity slider)
- 10 independent

Do not implement while Claude session `5ce0c7ee-f4ba-4db7-8c22-9e77eed9bc8e` is live on `AppearanceTab` / i18n / tokens.

## Fetch upstream

```text
https://raw.githubusercontent.com/Deepender25/Edge-Drop/main/electron/main/stickProbe.ts
https://raw.githubusercontent.com/Deepender25/Edge-Drop/main/electron/main/workAreaCache.ts
https://raw.githubusercontent.com/Deepender25/Edge-Drop/main/electron/main/geometry.ts
https://raw.githubusercontent.com/Deepender25/Edge-Drop/main/electron/main/updater.ts
https://raw.githubusercontent.com/Deepender25/Edge-Drop/main/electron/main/config.ts
https://github.com/Deepender25/Edge-Drop/blob/main/README.md
```

Always re-fetch `main` at implement time. Snapshots in these briefs are 2026-08-31.

## Validate after each task

```bash
npm test
npm run typecheck
knowns validate --entity <task-id>
```
