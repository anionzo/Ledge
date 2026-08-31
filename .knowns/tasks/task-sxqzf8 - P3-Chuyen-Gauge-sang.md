---
id: sxqzf8
title: P3 - Chuyen Gauge sang
status: done
priority: medium
labels:
  - phase
  - quota
createdAt: '2026-08-31T03:46:19.692Z'
updatedAt: '2026-08-31T07:33:10.526Z'
completedAt: '2026-08-31T07:33:10.526Z'
timeSpent: 0
---
# P3 - Chuyen Gauge sang

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Dich scrapers.js 1359 dong sang TypeScript, tach bay provider sau interface QuotaProvider. Bo Python, dung node:sqlite. Them nhanh Keychain cho macOS.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Bay provider claude codex gemini cursor grok opencode custom deu tach rieng file
- [ ] #2 Khong con phu thuoc Python
- [ ] #3 Provider Claude doc duoc credential tren ca file (win/linux) lan Keychain (macOS)
- [ ] #4 Provider hong thi hien dau gach chu khong sap panel
- [ ] #5 Moi provider co test rieng
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
XONG + verify bang app that: quota panel mo rong hien Claude ring 32%, Cursor ring 76% (warn), DeepSeek CNY 110.00 dang thanh balance meter 2 doan (granted/topped-up) + Balance available, icon ca voi. Da them: provider deepseek (endpoint chinh thuc /user/balance), custom HTTP mode (Bearer + JSONpath, chan non-https) phu gateway sub2api/new-api/one-api, BalanceMeter component, QuotaBalance type. Tien giu dang string. 218 test pass.
<!-- SECTION:NOTES:END -->

