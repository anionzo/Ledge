---
id: 20260831-1045-dung-node-sqlite-thay-vi-python-hoac-sql-js
title: 'Dung node:sqlite thay vi Python hoac sql.js'
status: draft
supersedes: []
supersededBy: []
tags:
  - dependencies
sources:
  - 'https://releases.electronjs.org/'
relatedDocs: []
relatedTasks: []
verification: []
reviewState: needs_evidence
reviewBlockers:
  - candidate needs at least one linked task or a spec with linked tasks before acceptance
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedAt: '2026-08-31T03:45:38.947Z'
createdAt: '2026-08-31T03:45:38.947Z'
updatedAt: '2026-08-31T03:45:38.947Z'
---

## Context

agent-notch shell ra electron/sqlite-item.py de doc state.vscdb cua Cursor IDE. Bat nguoi dung cai Python la khong chap nhan duoc cho mot desktop app.

## Decision

Dung node:sqlite (DatabaseSync) co san trong Node. Electron 44.1.0 chay Node 24.19.0, ma Node 24 da tich hop san module nay.

## Alternatives Considered

sql.js (WASM): them mot dependency va mot blob wasm, khong can thiet khi runtime da co san. better-sqlite3: native module, phai rebuild theo tung OS va tung phien ban Electron - dung thu can tranh nhat cho mot app da nen tang.

## Consequences

Khong them dependency nao, khong WASM, khong native rebuild. Can mot smoke test 5 phut o P0 de xac nhan Electron thuc su expose node:sqlite trong main process; neu khong thi fallback ve sql.js.
