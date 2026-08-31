---
id: yji970
title: 'Fix: xoa custom provider de lai rac trong enabledProviders'
status: todo
priority: medium
labels:
  - bug
  - integration
createdAt: '2026-08-31T04:21:17.356Z'
updatedAt: '2026-08-31T04:21:17.356Z'
timeSpent: 0
---
# Fix: xoa custom provider de lai rac trong enabledProviders

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Loi ghep giua agent UI va agent build. electron/store/settings.ts merge enabledProviders kieu {...current, ...next} nen key khong bao gio bi xoa; customProviders (mang) thi thay nguyen cuc. Hau qua: xoa mot custom provider thi no bien khoi mang nhung entry enabledProviders['custom_xxx'] o lai vinh vien. Ca hai agent deu tu neu diem nay (UI agent ghi chu trong AgentsTab.tsx). Sua o P3/P4: hoac reconcile orphan luc save (xoa key enabledProviders khong con provider tuong ung), hoac cho UI gui lenh xoa tuong minh.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Xoa custom provider xoa luon entry enabledProviders tuong ung
- [ ] #2 Co test cho truong hop nay
<!-- AC:END -->

