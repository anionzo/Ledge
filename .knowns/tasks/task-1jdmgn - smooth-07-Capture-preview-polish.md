---
id: 1jdmgn
title: "[smooth-07] Capture + preview polish"
status: done
priority: medium
labels:
  - from-spec
  - spec:edge-drop-smoothness-wave
  - spec-date:2026-08-31
  - edge-drop
createdAt: '2026-08-31T16:29:54.496Z'
updatedAt: '2026-08-31T17:42:00.530Z'
completedAt: '2026-08-31T17:42:00.530Z'
timeSpent: 0
parent: mlncst
spec: specs/2026-08-31/edge-drop-smoothness-wave
fulfills:
  - AC-7
order: 70
---
# [smooth-07] Capture + preview polish

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spreadsheet/HTML cells must not become screenshots. Snipping Tool clips drag out as Screenshot YYYY-MM-DD HH.MM.SS.png. GIF stack tiles animate via ledge://. Image lightbox already exists in PreviewSheet — also open from the card thumbnail.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Excel/Sheets cell copies store as text/HTML, not image
- [x] #2 Win+Shift+S drag-out filename matches Screenshot YYYY-MM-DD HH.MM.SS.png
- [x] #3 GIF members in a stack play through ledge:// not a static thumb
- [x] #4 Clicking an image card thumbnail opens Lightbox without requiring the preview sheet first
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Win32 format: prefer HTML table/spreadsheet over DIB image.
2. Snip drag-out filename Screenshot YYYY-MM-DD HH.MM.SS.png when no original name.
3. GIF stack/card uses ledge:// full not thumb PNG.
4. Reuse existing Lightbox; host at list/hub so card thumbnail click opens it. Do not rebuild Lightbox.
5. tests for format preference.
D3=pass D4=pass.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Read first: @doc/guides/smoothness/smoothness-wave-index then @doc/specs/2026-08-31/edge-drop-smoothness-wave @doc/research/edge-drop-smoothness-gap @doc/guides/edge-drop-port-sources @doc/guides/smoothness/smoothness-settings-and-ipc @doc/guides/smoothness/smoothness-verify-matrix. Fetch Edge-Drop main at implement time, do not trust this snapshot date. D1-D6 in the spec. Keep one hub + quota. Brief: @doc/guides/smoothness/smooth-07-capture-preview-brief Lightbox already in src/ui/Lightbox.tsx + PreviewSheet ImagePreview. formats/win32.ts is the spreadsheet trap. imageProtocol.ts ledge://thumb vs ledge://id.
<!-- SECTION:NOTES:END -->

