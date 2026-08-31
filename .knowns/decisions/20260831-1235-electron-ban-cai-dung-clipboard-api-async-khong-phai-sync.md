---
id: 20260831-1235-electron-ban-cai-dung-clipboard-api-async-khong-phai-sync
title: Electron ban cai dung clipboard API async, khong phai sync
status: draft
supersedes: []
supersededBy: []
tags:
  - finding
  - clipboard
sources:
  - electron/features/clipboard/formats/clip.ts
relatedDocs: []
relatedTasks: []
verification: []
reviewState: needs_evidence
reviewBlockers:
  - candidate needs at least one linked task or a spec with linked tasks before acceptance
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedAt: '2026-08-31T05:35:23.879Z'
createdAt: '2026-08-31T05:35:23.879Z'
updatedAt: '2026-08-31T05:35:23.879Z'
---

## Context

Khi port bo may clipboard Edge-Drop (dua tren clipboard sync: readImage/readBuffer/availableFormats/readHTML) sang Bezel, phat hien Electron ban dang cai expose clipboard API async kieu W3C: read(), readText(), write(), has() deu la Promise; cac phuong thuc sync Edge-Drop dua vao da bi bo. Probe xac nhan: clipboard.readText() tra ve Promise, await duoc noi dung that tu main process.

## Decision

Chua toan bo asynchrony trong mot adapter formats/clip.ts (readSnapshot tra ve ClipSnapshot thuan). Logic phan loai va chu ky (analyzeSnapshot, signatureForSnapshot) giu la ham THUAN de test khong can clipboard that hay mock async. Watcher poll 600ms goi readSnapshot.

## Alternatives Considered


## Consequences

Test logic pass khong can live clipboard. Nhung duong doc that chi lo o runtime - da verify bang app that (bat 3 copy thanh cong). File-reference copy tren Windows dung PowerShell CF_HDROP vi async API khong co readBuffer. Sequence number qua koffi optional, fallback so sanh noi dung.
