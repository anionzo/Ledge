---
id: 20260831-1417-grok-billing-api-doi-sang-unified-billing-parser-da-fix
title: Grok billing API doi sang unified billing - parser da fix
status: draft
supersedes: []
supersededBy: []
tags:
  - bugfix
  - quota
sources: []
relatedDocs: []
relatedTasks: []
verification: []
reviewState: needs_evidence
reviewBlockers:
  - candidate needs at least one source before acceptance
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedAt: '2026-08-31T07:17:36.820Z'
createdAt: '2026-08-31T07:17:36.820Z'
updatedAt: '2026-08-31T07:17:36.820Z'
---

## Context

Nguoi dung bao Grok tracking loi khong hien gi. Chan doan bang cach goi that endpoint voi token that: HTTP 200, token con han, NHUNG response shape doi hoan toan - config gio la {currentPeriod, onDemandCap, onDemandUsed, prepaidBalance, isUnifiedBillingUser, billingPeriodStart/End}, KHONG con creditUsagePercent/productUsage ma parser (port tu agent-notch) tim -> ca hai null -> tra error unrecognised shape.

## Decision

Viet lai parser grok.ts: (1) onDemandCap>0 -> phan tram used/cap; (2) prepaidBalance>0 -> balance reading nhu DeepSeek (them balance vao ReadingInit/makeReading); (3) unified billing thuan (truong hop nguoi dung: tat ca =0, isUnifiedBillingUser=true) -> state ok voi message Subscription + weekly reset tu currentPeriod.end; (4) giu tuong thich shape cu neu account nao con tra ve. Verify voi du lieu that: cu=error, moi=ok Subscription reset 2026-09-07.

## Alternatives Considered


## Consequences

Grok hien dung trang thai thay vi error. numVal() doc dang {val:number} moi cua xAI.
