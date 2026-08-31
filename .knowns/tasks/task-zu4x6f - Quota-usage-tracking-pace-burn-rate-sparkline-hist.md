---
id: zu4x6f
title: 'Quota usage tracking: pace (burn rate) + sparkline history + toast nguong'
status: in-progress
priority: high
labels:
  - feature
  - quota
createdAt: '2026-08-31T07:33:43.316Z'
updatedAt: '2026-08-31T07:34:05.378Z'
timeSpent: 0
---
# Quota usage tracking: pace (burn rate) + sparkline history + toast nguong

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Nguoi dung muon theo doi muc do su dung 'chuan chinh': burn-rate (pace hot/ok = da dung% so voi thoi gian cua so da troi), sparkline lich su usage, toast khi vuot nguong critical. Da them contract: UsagePace, UsageSample, QuotaReading.pace, kenh gauge:history. Subagent dang lam electron/features/quota/pace.ts + electron/store/usageHistory.ts + wire + toast. Renderer (hien pace badge + sparkline trong ProviderSheet) se lam o wave cuoi.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pace tinh dung, co test
- [ ] #2 history luu + gauge:history tra ve
- [ ] #3 toast khi cross critical, debounce
- [ ] #4 renderer hien pace + sparkline
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
BACKEND XONG (subagent): pace.ts (computePace hot/ok, windowLengthMs suy tu label), usageHistory.ts (mirror balanceHistory, dedupe/heartbeat 10min, cap 600, prune 14d), withUsage fold trong index.ts, toast debounce once-per-provider-per-window, handle('gauge:history'), them 'gauge:history' vao preload INVOKE_CHANNELS. 257/257 test pass, tsc node xanh. CON LAI: renderer hien pace badge + sparkline trong ProviderSheet (lam o wave cuoi).
<!-- SECTION:NOTES:END -->

