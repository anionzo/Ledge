---
id: doc-4a735ee61c5a5ddfdfdb2b89723251c0
title: Smoothness settings and IPC
description: Settings v2 fields and IPC channels required by smoothness tasks.
createdAt: '2026-08-31T16:36:46.167Z'
updatedAt: '2026-08-31T16:36:46.167Z'
tags:
  - guide
  - smoothness
  - ipc
---

# Smoothness wave — settings + IPC deltas

All new fields go through `shared/types/settings.ts` + `electron/store/settings.ts` normalize/migrate. `SETTINGS_VERSION` is currently `1`. Bump to `2` when adding persisted keys so old installs merge defaults.

Do not invent a second config file. Quota stays under `gauge.*`. Hub geometry stays under `shelf.*` (the hub reads `shelf.side`).

## Existing fields already relevant

From `shared/types/settings.ts`:

- `panelOpacity: number` — WIP, default `0.85`, clamp 0.5–1 in `electron/store/settings.ts`
- `shelf.side`, `shelf.edgeProximityPx` (1–64), `shelf.heightRatio`, `shelf.triggerAlign`
- `shelf.maxItems`, `shelf.incognito`, `shelf.hoverActivation`, `shelf.previewEnabled`
- `gauge.side` — must stay lockstep with `shelf.side` (`PanelsTab.setSide`)
- `hotkeyToggleShelf` / `hotkeyToggleGauge` — leftover dual-window; out of this wave unless a task explicitly collapses them

`PanelHost` already has `deps.displayId?: number | null` (`electron/main/panels/PanelHost.ts` `#display()` ~364) but `syncPanels` in `electron/main/index.ts` does **not** pass it.

## Add — Settings v2

```ts
interface StickDisplayPrefs {
  /** Last resolved Electron display id. Session-fast. Invalid after reboot. */
  displayId: number | null
  /** Persisted workArea for 4-tier resolve. */
  savedWorkArea: { x: number; y: number; width: number; height: number } | null
  savedScaleFactor: number | null
}

// on Settings:
autoUpdates: boolean            // default true; ignored on store builds
stickDisplay: StickDisplayPrefs

// on ShelfSettings:
autoDeleteHours: 0 | 1 | 6 | 24 | 168  // 0 = never
clearUnpinnedOnRestart: boolean        // default false
```

`movePastedToTop` is already implicit (`store.touch` in `clipboard/index.ts` paste). Do not add a setting unless product asks.

## Add — IPC (`shared/ipc.ts` + preload allow-list)

Keep typed maps. Preload is a static list in `electron/preload/index.ts`.

```ts
// InvokeMap
'displays:list': {
  args: []
  result: Array<{
    id: number
    label: string
    physicalWidth: number
    physicalHeight: number
    scaleFactor: number
    isPrimary: boolean
    workArea: { x: number; y: number; width: number; height: number }
  }>
}

'shelf:clear-query': {
  args: [{
    keepPinned: boolean
    olderThanMs: number | null
    ids: string[] | null
  }]
  result: ClipboardItem[]
}

'updater:status': { args: []; result: {
  storeBuild: boolean
  checking: boolean
  availableVersion: string | null
  downloadedVersion: string | null
  error: string | null
}}
'updater:check': { args: []; result: { status: string; version?: string; error?: string } }
'updater:download': { args: []; result: void }
'updater:quit-and-install': { args: []; result: void }

// EventMap
'updater:available': [info: { version: string }]
'updater:downloaded': [info: { version: string }]
'panel:proximity-miss': [info: { side: 'left' | 'right'; offsetPx: number }]
```

Prefer extending clear via a **new** `shelf:clear-query` rather than overloading `shelf:clear(keepPinned: boolean)` — that channel is already wired (`ipc/index.ts` 195, preload 37). Keep the old channel as `clear-query({ keepPinned, olderThanMs: null, ids: null })` wrapper so existing ClearMenu "unpinned/all" still works.

## ItemStore methods to add

`electron/features/clipboard/ItemStore.ts`:

- `clearOlderThan(ms: number, keepPinned: boolean): string[]` — compare `item.capturedAt`
- `clearIds(ids: string[], keepPinned: boolean): string[]`
- Existing `clear(keepPinned)` stays

Renderer `ClearMenu` should compute candidate ids from the **current filter + search** (`matches` / `matchesFilter` in `src/shelf/describe.ts`) and pass `ids`. Main still enforces keepPinned.

## Defaults

| Key | Default | Why |
|---|---|---|
| `autoUpdates` | `true` | Edge-Drop default; silent on GitHub NSIS |
| `stickDisplay.displayId` | `null` | primary via 4-tier fallback |
| `autoDeleteHours` | `0` | never, match Edge-Drop |
| `clearUnpinnedOnRestart` | `false` | opt-in |
| `panelOpacity` | `0.92` (change from 0.85) | user said current glass is too faint |

## Files that always get touched for a settings key

1. `shared/types/settings.ts` — type + `DEFAULT_SETTINGS`
2. `electron/store/settings.ts` — normalize/clamp/migrate
3. Settings tab UI (`PanelsTab` / `BehaviourTab` / `AppearanceTab`)
4. `src/i18n/index.ts` `en` keys (and vi in smooth-10)
5. Tests if normalize has rules (`tests/` — add next to existing store tests if any; otherwise new `tests/settingsNormalize.test.ts`)
