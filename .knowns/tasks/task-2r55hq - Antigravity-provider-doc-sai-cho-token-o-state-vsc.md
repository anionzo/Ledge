---
id: 2r55hq
title: Antigravity provider doc sai cho - token o state.vscdb protobuf khong phai Credential Manager
status: todo
priority: medium
labels:
  - bug
  - quota
createdAt: '2026-08-31T07:33:43.431Z'
updatedAt: '2026-08-31T07:33:43.431Z'
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

