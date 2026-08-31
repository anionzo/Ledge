---
id: doc-596af718698fda44e56bbb77e1923a91
title: smooth-08 auto-update brief
description: Full implement context for electron-updater port to anionzo/Ledge.
createdAt: '2026-08-31T16:36:47.036Z'
updatedAt: '2026-08-31T16:36:47.036Z'
tags:
  - guide
  - smoothness
  - task-brief
---

# smooth-08 — silent GitHub auto-update

**Task:** @task-370vlz | **AC:** spec AC-8 | **Priority:** high
**Depends:** none

## Goal

Wire `electron-updater` which is already in `package.json` **with zero call sites**. Port Edge-Drop `updater.ts`, retarget **anionzo/Ledge**.

## Current Ledge

- `package.json` `dependencies.electron-updater`, `build.publish` GitHub `anionzo/Ledge`
- `build:win` NSIS, `build:win:store` appx
- No `updater.ts`, no `autoUpdater` grep hits
- Settings locales from Edge-Drop still mention auto-updates (`vi.json` `behaviour.autoUpdatesTitle`) but Ledge Settings Behaviour tab does not expose it
- README install still mentions 0.1.0 in one place — update if you touch README (smooth-10 also fixes i18n claims)

## Upstream

Fetch at implement time:

- https://raw.githubusercontent.com/Deepender25/Edge-Drop/main/electron/main/updater.ts
- https://raw.githubusercontent.com/Deepender25/Edge-Drop/main/electron/main/config.ts (`isStoreBuild`)

Behavior to keep:

- `isStoreBuild()` → disable completely (MSIX/Store policy)
- `autoDownload` from `settings.autoUpdates` (new field, default true)
- Packaged only; unpackaged: log and no-op (optional `forceDevUpdateConfig` off by default)
- Fast path: GitHub releases API for `anionzo/Ledge` (change URL; upstream hardcodes Deepender25/Edge-Drop)
- Events: available / downloaded → push to renderer
- `quitAndInstall(false, true)` on user Restart

## Ledge wiring

| File | Change |
|---|---|
| `electron/main/config.ts` | **New** `isStoreBuild()` |
| `electron/main/updater.ts` | **New** port + retarget |
| `electron/main/index.ts` | `initAutoUpdater()` after ready |
| `shared/ipc.ts` + preload + ipc | status/check/download/quit-and-install + pushes |
| `shared/types/settings.ts` | `autoUpdates: boolean` |
| `src/settings/tabs/BehaviourTab.tsx` | toggle + banner |
| `src/settings/components/` | small UpdateBanner |
| `src/i18n/index.ts` | EN strings |

Banner: top of Settings scroll, all tabs or Behaviour only — Edge-Drop puts it on all category tabs. Ledge can put it in the settings chrome (`src/settings/App.tsx`) so every tab sees it.

## Security

- Do not log tokens
- HTTPS GitHub only
- Store builds never call net for updates

## Verify

@doc/guides/smoothness/verify-matrix section 08. Cannot fully test quitAndInstall in unit tests; mock `isStoreBuild` + skip packaged branch.

## Decision compliance

D3=pass (port updater, change owner/repo). D2=pass (settings stay Ledge 5-tab).
