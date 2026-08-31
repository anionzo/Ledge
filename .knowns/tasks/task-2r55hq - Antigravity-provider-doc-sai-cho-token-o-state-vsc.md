---
id: 2r55hq
title: Antigravity provider doc sai cho - token o state.vscdb protobuf khong phai Credential Manager
status: done
priority: medium
labels:
  - bug
  - quota
createdAt: '2026-08-31T07:33:43.431Z'
updatedAt: '2026-08-31T09:23:22.224Z'
completedAt: '2026-08-31T09:23:22.224Z'
timeSpent: 0
---
# Antigravity provider doc sai cho - token o state.vscdb protobuf khong phai Credential Manager

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Nguoi dung bao Antigravity khong hien. Chan doan: provider doc Windows Credential Manager target 'gemini:antigravity' -> TRONG tren may. Token that nam trong AppData/Roaming/Antigravity/User/globalStorage/state.vscdb key 'antigravityUnifiedStateSync.oauthToken' (Antigravity la fork VS Code), va usage o 'antigravityUnifiedStateSync.modelCredits'/'userStatus' - deu la base64-PROTOBUF khong schema. Doc token can decode protobuf+JSON; doc usage can decode protobuf modelCredits/userStatus. De vo khi Antigravity doi format. agent-notch goc cung can env client id/secret de refresh (khong phai regression). Tam thoi de logged-out trung thuc.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Doc token tu state.vscdb (node:sqlite) thay vi Credential Manager
- [ ] #2 Decode duoc usage tu modelCredits/userStatus HOAC goi cloudcode API voi token do
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
GIAI QUYET: viet antigravityCredits.ts doc state.vscdb (tai dung readVscdbItems cua cursor) + protobuf decoder nho. Key antigravityUnifiedStateSync.modelCredits = protobuf long base64: entry {1:sentinelKey, 2:{1:base64(value)}}, value availableCredits decode ra {2:varint}. Xac nhan mau that EOgH->1000. Provider gemini.ts doc DB lam nguon CHINH (khong can token/OAuth client), fallback API. Them 'credits' vao QuotaBalance/QuotaCost, BalanceMeter hien 'N credits'. 4 test moi. Tong/reset nam trong userStatus protobuf sau khong co schema -> chi hien so credits con lai (trung thuc), khong bia %.
<!-- SECTION:NOTES:END -->

