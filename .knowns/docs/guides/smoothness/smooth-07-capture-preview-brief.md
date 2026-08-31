---
id: doc-54aa715c3b23e74fbd1c783d5fd1e826
title: smooth-07 capture preview brief
description: Full implement context for spreadsheet, snip names, GIF, card lightbox.
createdAt: '2026-08-31T16:36:46.957Z'
updatedAt: '2026-08-31T16:36:46.957Z'
tags:
  - guide
  - smoothness
  - task-brief
---

# smooth-07 — capture + preview polish

**Task:** @task-1jdmgn | **AC:** spec AC-7 | **Priority:** medium
**Depends:** none
**Note:** Lightbox **already exists** (`src/ui/Lightbox.tsx`, wired in `PreviewSheet.tsx` ImagePreview). Do not rebuild it. Wire it from the card thumbnail too.

## Goal

1. Spreadsheet/HTML cell copies stay text, not a screenshot image.
2. Snipping Tool clips drag out as `Screenshot YYYY-MM-DD HH.MM.SS.png`.
3. GIF in stacks animate via `ledge://` (not only `ledge://thumb/`).
4. Clicking an image thumbnail on the **card** opens Lightbox.

## Current Ledge

- Formats: `electron/features/clipboard/formats/{win32,darwin,linux,clip,index}.ts`
- Images: `ledge://thumb/<id>` on cards; `ledge://<id>` full (`imageProtocol.ts`)
- `ItemCard.tsx` ~455–487 thumbnail URLs
- `PreviewSheet` ImagePreview click → Lightbox with `ledge://<imageId>`
- File kinds / pastel icons already partially ported (`fileSvg.ts` exists under clipboard)

## Spreadsheet vs image

Windows often puts **both** CF_DIB and HTML on the clipboard when copying Excel/Sheets. If the watcher prefers image, cells become a screenshot.

Fix in win32 format reader: if HTML table / `Spreadsheet` / `HTML Format` is present with a table, **prefer text/html → text item**, skip image. Re-fetch Edge-Drop `electron/clipboard/formats.ts` (or equivalent in current tree) at implement time.

Add a test with a fixture of availableFormats() list if they unit-test format choice; otherwise a pure function `preferSpreadsheetOverImage(formats: string[]): boolean`.

## Snipping Tool names

When the image comes from Win+Shift+S, Edge-Drop names drag-out `Screenshot YYYY-MM-DD HH.MM.SS.png`.

Ledge `stagedTemp` / `drag.ts` `stageDragFile` writes temp files. Use `capturedAt` to format the basename for image payloads that look like snips (single bitmap, no original filename). If an original filename exists, keep it (Edge-Drop "Original Filename Preservation").

## GIF

`ledge://thumb/` is 240 px static. For `image/gif` members, stack tiles and preview should use `ledge://<id>` (full) or a protocol flag `ledge://<id>?anim=1` that skips transcode. Check `thumbnailCache.ts` — do not GIF-smash into PNG.

## Card → Lightbox

Lift Lightbox state to `hub/App.tsx` or `ItemList` so a card can `onPreviewImage(src)` without opening `PreviewSheet`. Reuse the same component. Keyboard Esc already in Lightbox.

## Files

| File | Change |
|---|---|
| `electron/features/clipboard/formats/win32.ts` | spreadsheet preference |
| `electron/features/clipboard/formats/index.ts` | dispatch |
| `electron/features/clipboard/drag.ts` / `stagedTemp.ts` | screenshot filename |
| `src/shelf/components/ItemCard.tsx` | GIF src + thumbnail click |
| `src/hub/App.tsx` or list | Lightbox host |
| `tests/clipboard.test.ts` | format preference |

## Verify

@doc/guides/smoothness/verify-matrix section 07.
