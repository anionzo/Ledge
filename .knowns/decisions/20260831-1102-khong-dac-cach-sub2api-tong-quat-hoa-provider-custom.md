---
id: 20260831-1102-khong-dac-cach-sub2api-tong-quat-hoa-provider-custom
title: Khong dac cach Sub2API - tong quat hoa provider custom
status: draft
supersedes: []
supersededBy: []
tags:
  - architecture
  - quota
sources:
  - 'https://github.com/Wei-Shaw/sub2api'
relatedDocs: []
relatedTasks: []
verification: []
reviewState: needs_evidence
reviewBlockers:
  - candidate needs at least one linked task or a spec with linked tasks before acceptance
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedAt: '2026-08-31T04:02:12.310Z'
createdAt: '2026-08-31T04:02:12.310Z'
updatedAt: '2026-08-31T04:02:12.310Z'
---

## Context

Nguoi dung hoi ve viec moc phan doc quota cua Sub2API. Sub2API la gateway tu host (Go + Gin + PostgreSQL + Redis) gom Claude OpenAI Gemini Grok ve mot endpoint. Khao sat cho thay no KHONG co API quota/balance cong khai co tai lieu - chi co admin dashboard voi endpoint noi bo. Va no khong dung mot minh: cung ho con co new-api, one-api, one-hub, deu la relay co endpoint so du na na nhau va nguoi dung tu host moi nguoi mot kieu.

## Decision

Khong viet file sub2api.ts rieng. Thay vao do nang provider custom - hien chi biet chay shell command - them kieu thu hai: HTTP + Bearer token + duong dan JSON toi con so. Cau hinh trong tab Agents: URL (chi https), Header, duong dan kieu JSONPath, va kieu hien thi so du hay phan tram.

## Alternatives Considered

Viet mot file cho moi relay: ky cam ket bao tri vo han, va hong theo tung ban cap nhat cua nguoi ta. Moc thang vao endpoint admin cua sub2api: dang doan API rieng tu, de vo.

## Consequences

Mot lan lam phu duoc ca ho relay. Token phai luu qua safeStorage chu khong de trong file settings. Chi chap nhan https.
