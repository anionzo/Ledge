---
id: doc-615117b386391586b528e668a7667709
title: smooth-06 history clear brief
description: Full implement context for timed/filter clear and auto-delete.
createdAt: '2026-08-31T16:36:46.876Z'
updatedAt: '2026-08-31T16:36:46.876Z'
tags:
  - guide
  - smoothness
  - task-brief
---

# smooth-06 — filter-scoped and timed history clear

**Task:** @task-gop97t | **AC:** spec AC-6 | **Priority:** medium
**Depends:** none

## Goal

Clear is not only "unpinned vs all". Port Edge-Drop:

- Time windows: last 1h / 6h / 24h / all
- Scope to **active filter and search**
- Settings: auto-delete timer Never/1h/6h/24h/7d (`autoDeleteHours` 0/1/6/24/168)
- Settings: clear unpinned on restart

Pinned never dies.

## Current Ledge

- `ClearMenu` (`src/shelf/components/ClearMenu.tsx`): unpinned + confirm-all. Calls `onClear(keepPinned: boolean)`.
- IPC `shelf:clear: { args: [keepPinned: boolean]; result: ClipboardItem[] }` (`shared/ipc.ts` 53)
- Engine `clear(keepPinned)` → `store.clear` (`clipboard/index.ts` 123)
- `ItemStore` has `capturedAt` on items (used for ordering / touch)

## Implementation

Do **not** break the existing channel. Add `shelf:clear-query` per @doc/guides/smoothness/settings-and-ipc.

Renderer owns filter/search. Hub already has `matches` / `matchesFilter` (`src/shelf/describe.ts`). ClearMenu should receive `visibleUnpinnedIds: string[]` from `hub/App.tsx` (the same list the virtual window uses, minus pinned).

Menu items:

1. Clear this view — 1 hour (`olderThanMs = 1h` AND ids = visible)
2. 6 hours
3. 24 hours
4. Clear unpinned in this view (ids = visible unpinned, olderThanMs null)
5. Clear all (existing confirm) — keepPinned false, ids null

If the active filter is All and search is empty, "this view" = whole shelf.

Main still re-checks pinned.

### Auto-delete

On clipboard engine tick or once a minute from main: `store.clearOlderThan(autoDeleteHours * 3600_000, true)` when hours > 0.

### Restart

In engine bootstrap after `store.load()`: if `clearUnpinnedOnRestart` then `store.clear(true)`.

## Files

| File | Change |
|---|---|
| `shared/types/settings.ts` | `autoDeleteHours`, `clearUnpinnedOnRestart` |
| `electron/store/settings.ts` | migrate |
| `electron/features/clipboard/ItemStore.ts` | `clearOlderThan`, `clearIds` |
| `electron/features/clipboard/index.ts` | wire + interval + startup |
| `shared/ipc.ts` + preload + `ipc/index.ts` | `shelf:clear-query` |
| `src/shelf/components/ClearMenu.tsx` | extra items |
| `src/hub/App.tsx` | pass visible ids |
| `src/settings/tabs/BehaviourTab.tsx` | two settings |
| `src/i18n/index.ts` | keys |
| `tests/clipboard.test.ts` | store clear by age/ids |

## i18n keys (EN here; vi in 10)

- `shelf.clear.last_hour`
- `shelf.clear.last_6h`
- `shelf.clear.last_24h`
- `shelf.clear.view_unpinned`
- `settings.behaviour.auto_delete`
- `settings.behaviour.clear_unpinned_restart`

## Verify

@doc/guides/smoothness/verify-matrix section 06.
