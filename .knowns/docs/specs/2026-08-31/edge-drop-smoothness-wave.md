---
id: doc-b6ae6d42ebe32b989e34550201ea4886
title: Edge-Drop smoothness wave
description: Spec to port Edge-Drop shelf feel into Ledge hub without dropping quota. Draft until reviewed.
createdAt: '2026-08-31T16:27:59.841Z'
updatedAt: '2026-08-31T16:27:59.841Z'
tags:
  - spec
  - draft
  - edge-drop
---

# Edge-Drop smoothness wave

## Overview

Bring Ledge's **shelf feel** up to current Edge-Drop `main` without abandoning Ledge's one-frame hub + quota HUD. Closed task `@task-378teh` only covered 13 UX features; users still report Ledge is less smooth than https://github.com/Deepender25/Edge-Drop. This spec is the execution contract for a port-and-adapt wave. Background matrix lives in @doc/research/edge-drop-smoothness-gap. File-level port map lives in @doc/guides/edge-drop-port-sources.

## Locked Decisions

- D1: Source of truth for shelf smoothness is **current Edge-Drop `main`**, not `@task-378teh`.
- D2: Keep Ledge identity: **one hub frame + quota HUD**. Do not split back into two edge windows. Do not drop Agents/quota.
- D3: Port **behavior and proven engines** (`stickProbe`, updater, drag guards, history prune). Adapt names to Ledge (`ledge://`, `PanelHost`, `PlatformAdapter`). Do not wholesale-replace the renderer.
- D4: Out of scope: Edge-Drop sponsor UI, fake 31-locale completeness, unofficial Antigravity protobuf expansion, AI clustering.
- D5: Smoothness over decoration: prefer Edge-Drop's **less `backdrop-filter`** finding; panel opacity remains a user knob with a **clearer default**.
- D6: Attribution remains Apache-2.0 via existing `NOTICE` / `licenses/Edge-Drop-Apache-2.0.txt`. New ports cite the upstream file in comments, not copy/paste of Edge-Drop branding.

## System Decision Impact

- Impact: none
- Decision: n/a
- Acceptance gate: n/a — this wave does not change the platform-adapter or "never invent quota numbers" rules.

## Requirements

### Functional Requirements

- FR-1: Interior multi-monitor seams must not open the hub while the cursor is *crossing*; they must open when the cursor *rests* on the stuck edge (Edge-Drop rest-as-intent).
- FR-2: User can pick which display the hub sticks to, left or right; the choice survives reboot even if Windows reassigns display IDs.
- FR-3: Hitting the screen edge *outside* the trigger strip shows a one-shot proximity beacon; the visible clip matches the trigger strip.
- FR-4: Opening, scrolling, and tab/pin transitions stay compositor-cheap (no heavy blur on every frame). Panel opacity is adjustable and defaults clearer than 0.72 dark glass.
- FR-5: Click vs drag is discriminated (~5 px). Self-drop onto the shelf is a no-op. Native drag-out still uses prestage + OLE. Z-order demotes during drag so drops land in other apps.
- FR-6: History clear supports time windows (1h / 6h / 24h / all) and is scoped to the active filter/search. Optional auto-delete and clear-unpinned-on-restart.
- FR-7: Spreadsheet/HTML copies stay text; Snipping Tool clips get timestamped names; GIF stacks animate; image click still opens the existing lightbox.
- FR-8: Packaged GitHub builds check/download/install updates via `electron-updater` (silent + Restart). Store/MSIX builds must not self-update.
- FR-9: Collapsed quota strip shows each enabled provider's **icon + %** (or dash) in one row. Language switch covers Ledge keys for hub + settings, at least `en` and `vi`.

### Non-Functional Requirements

- NFR-1: Geometry probe stays unit-testable with **zero Electron imports** (same split as Edge-Drop `stickProbe.ts`).
- NFR-2: No extra runtime renderer dependencies. Reuse `motion` already in `package.json`.
- NFR-3: `npm run typecheck` and `npm test` stay green. New geometry/updater logic has targeted tests.
- NFR-4: Cross-platform: Windows is the smoothness reference; macOS/Linux keep `PlatformAdapter` paths and degrade (resize collapse, no Win32 seam extras) rather than crash.

## Acceptance Criteria

- [ ] AC-1: On a two-display setup, moving the cursor through an interior edge does **not** open Ledge; stopping on the stuck edge does within ~3 rest frames. Covered by unit tests of the probe plus a manual note.
- [ ] AC-2: Settings → Panels lists displays with physical resolution; choosing a display + side docks the hub there after restart.
- [ ] AC-3: Trigger Top/Center/Bottom visually matches the hover strip; a misaligned edge hover flashes the proximity beacon once.
- [ ] AC-4: Panel open/scroll does not use a 24 px blur on the whole hub as the only material; opacity slider 50–100% updates live; default reads solid enough to read text on a busy wallpaper.
- [ ] AC-5: A click copies/pastes; a drag >5 px starts OLE drag. Dropping back on the shelf does not duplicate or bump hitCount. Drag-out into Explorer still works.
- [ ] AC-6: Clear menu offers 1h / 6h / 24h / unpinned / all; with Images filter + search, only matching unpinned items go. Auto-delete and restart-clear honor pinned.
- [ ] AC-7: Excel/Sheets cell copies are not stored as screenshots. `Win+Shift+S` drag-out filename matches `Screenshot YYYY-MM-DD HH.MM.SS.png`. GIF in a stack plays. Clicking an image still opens `Lightbox`.
- [ ] AC-8: Packaged GitHub build shows update available from `anionzo/Ledge` releases and Restart installs. `isStoreBuild()` skips updater. Dev unpackaged does not phone home unless forced.
- [ ] AC-9: Collapsed strip shows icon+% for each enabled provider without expanding. Switching language to Vietnamese translates hub + settings Ledge keys (not only Edge-Drop ALIAS).

## Scenarios

### Scenario 1: Cross-monitor pass-through
**Given** two displays, hub stuck to the inner edge of the right display
**When** the user flicks the cursor from left display to right without pausing
**Then** the hub stays closed
**And** when they stop on that edge, the hub opens

### Scenario 2: Stick display after reboot
**Given** the user picked "Display 2 · 2560×1440 · Right"
**When** Windows reassigns display ids on reboot
**Then** the hub still docks to the same physical monitor and edge

### Scenario 3: Drag then return
**Given** a file card on the shelf
**When** the user starts a drag and drops it back on the hub
**Then** no duplicate card, no hitCount bump, no stack split

### Scenario 4: GitHub update
**Given** a packaged NSIS install older than latest GitHub release
**When** auto-updates are on
**Then** a banner offers Restart to update
**And** an MSIX store build never shows that banner

### Scenario 5: Quota glance
**Given** Claude, Cursor, and Antigravity enabled
**When** the hub is open but the quota strip is collapsed
**Then** three brand icons with used-% (or dash) sit in one row

## Technical Notes

- Port `stickProbe.ts` almost verbatim into `electron/main/edge/` (rename types to Ledge). Drive `cursorPoll.ts` from `armedInEdge`, not a parallel heuristic.
- Updater: copy Edge-Drop `updater.ts` structure; change GitHub owner/repo to `anionzo/Ledge`; honor existing `package.json` `build.publish`.
- Blur: tokens should offer a cheap material (opacity fill) as default; blur if at all is a setting, not the only look.
- Quota strip change is Ledge-native; reuse `ProviderBrandIcon`.
- Do not implement while Claude session `5ce0c7ee` is still patching the same files.

## Task Links

Generated after task creation. Keep ID, title, status only.

## Open Questions

- [ ] Ship Microsoft Store updater isolation only, or also a Store listing later? (default: isolation code only)
- [ ] Default panel opacity number (recommend 0.92–1.0)
