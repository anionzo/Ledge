---
id: 20260831-1045-electron-44-typescript-lam-nen-tang-da-nen-tang
title: Electron 44 + TypeScript lam nen tang da nen tang
status: draft
supersedes: []
supersededBy: []
tags:
  - stack
  - cross-platform
sources:
  - 'https://www.electronjs.org/docs/latest/api/web-contents'
  - 'https://github.com/Deepender25/Edge-Drop'
  - 'https://github.com/adityarya24/agent-notch'
relatedDocs: []
relatedTasks: []
verification: []
reviewState: needs_evidence
reviewBlockers:
  - candidate needs at least one linked task or a spec with linked tasks before acceptance
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedAt: '2026-08-31T03:45:15.526Z'
createdAt: '2026-08-31T03:45:15.526Z'
updatedAt: '2026-08-31T03:45:15.526Z'
---

## Context

Gop Edge-Drop (clipboard rail, Electron 34 + TS, Windows-only, koffi/Win32 FFI, 70 file TS, ~26300 dong, 29 file test) va agent-notch (AI quota HUD, Electron 44 + JS, ~3430 dong). Yeu cau nguoi dung: cai duoc tren Windows va macOS, them Linux thi tot.

## Decision

Dung Electron 44 + TypeScript + React 19 + electron-vite. Lay Edge-Drop lam nen, cam agent-notch vao nhu panel thu hai.

## Alternatives Considered

Tauri 2 + Rust: binary ~10MB thay vi ~120MB, RAM thap hon. Bi loai vi (1) keo file ra ngoai - tinh nang cot loi cua panel trai - trong Tauri chi co qua plugin cong dong, khong phai API loi; (2) phai viet lai ~30000 dong va bo 4568 dong test da co, uoc tinh gap 4-6 lan cong; (3) webview khac nhau theo OS lam backdrop-filter lech nhau.

## Consequences

Tai dung ~85% code hien co. Diet tich phai viet lai cho macOS/Linux chi la 9 file trong 70 file TS cua Edge-Drop (do quet source). Danh doi: installer ~120MB, RAM ~180-300MB. Neu sau nay dung luong va RAM thanh uu tien so mot thi tinh lai.
