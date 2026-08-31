---
id: doc-38e771bfaf264e000b2083e6aa7672e5
title: smooth-05 drag integrity brief
description: Full implement context for 5px guard, self-drop, z-band.
createdAt: '2026-08-31T16:36:46.784Z'
updatedAt: '2026-08-31T16:36:46.784Z'
tags:
  - guide
  - smoothness
  - task-brief
---

# smooth-05 — drag integrity

**Task:** @task-euv8k3 | **AC:** spec AC-5 | **Priority:** high
**Depends:** none

## Goal

Click stays click. Drag is OLE. Returning a card to the shelf is a no-op. Other apps can receive the drop. Prestage already exists — keep it.

## Current Ledge (good)

- `send('shelf:start-drag')` is **synchronous** (`ItemCard.tsx` ~114–118). Must stay send, never invoke.
- `preventDefault` on dragstart to block HTML5 ghost.
- `onPointerEnter` → `shelf:prestage-drag` (`drag.ts` `prestageDrag`).
- Merge via HTML5 dragover onto another card (`draggingId` in zustand).
- `store.touch` on **paste** always (`clipboard/index.ts` ~191) — that is paste, not external drop.

## Current Ledge (gaps)

- No 5 px movement guard: a tiny drag still `preventDefault` + `startDrag`, so click-to-copy races OLE.
- No explicit self-drop filter: dropping on the hub empty region may re-ingest via `dragIn.ts`.
- No `setAlwaysOnTop(..., 'normal')` demotion during drag (Edge-Drop z-band).
- `hitCount` for external OLE success is not clearly gated (touch is on paste).

## Port pieces

### 5 px click vs drag

On the card pointer:

- `pointerdown` record `{x,y}`
- `pointermove` if hypot < 5: do nothing (click handlers still work)
- if hypot ≥ 5: then `send('shelf:start-drag')`
- Do **not** call startDrag from `onDragStart` if we already started, or skip native HTML5 dragstart entirely once OLE is running

Edge-Drop: "Intelligent 5px movement guard". Keep 5 as a named constant `DRAG_THRESHOLD_PX = 5` in `ItemCard.tsx`.

Click path today: need to read the card click handler — copy on click, paste on double-click (file header). Preserve that.

### Self-drop

`src/shelf/dragIn.ts` + hub `onDrop`. If the drag originated from Ledge (`draggingId` set or a payload marker), treat drop on the shelf as no-op: no `addData`, no touch, no split.

Preload drop filter in Edge-Drop; Ledge can do it in renderer with `draggingId !== null`.

### Z-band

In `startDrag` (`electron/features/clipboard/drag.ts`):

- Before `sender.startDrag(item)`, find the BrowserWindow for `sender` and `setAlwaysOnTop(true, 'normal')` (or `'pop-up-menu'` — match Edge-Drop `window.ts` after re-fetch).
- Restore previous level on `webContents` drag done / timeout / `mouseup` in main.

`PanelHost` currently owns always-on-top. Add `demoteZ()` / `restoreZ()` on the host and call from drag.ts via a small callback injected at engine setup — do not import PanelHost from clipboard if that creates a cycle. `electron/features/clipboard/index.ts` is constructed from main; pass `{ onDragBegin, onDragEnd }` from `electron/main/index.ts`.

### External hitCount

Only `store.touch` when OLE completes outside. If Electron does not give drop-target identity, approximate: touch on `startDrag` is **wrong**; touch on paste is OK for paste; for OLE, Edge-Drop gates on external. Re-read `electron/main/drag.ts` at implement time for the exact hook (`will-start-dragging` / `cursor-leave` / they count on successful temp file takeaway). If unverifiable, **do not increment on self-drop**; increment when `draggingId` clears and the pointer is outside the hub window.

## Files

| File | Change |
|---|---|
| `src/shelf/components/ItemCard.tsx` | 5 px guard; keep prestage on hover |
| `src/hub/App.tsx` / `dragIn.ts` | self-drop no-op |
| `electron/features/clipboard/drag.ts` | z-band callbacks |
| `electron/main/index.ts` | wire callbacks to PanelHost |
| `electron/main/panels/PanelHost.ts` | demote/restore |
| `tests/` | unit the 5 px helper if extracted |

## Verify

@doc/guides/smoothness/verify-matrix section 05. Merge onto another card must still work.

## Do not

- Await inside dragstart
- Replace `send` with `invoke`
- Delete prestage
