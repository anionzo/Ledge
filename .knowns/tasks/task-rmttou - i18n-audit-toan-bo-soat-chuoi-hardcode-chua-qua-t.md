---
id: rmttou
title: i18n audit toan bo - soat chuoi hardcode chua qua t()
status: done
priority: medium
labels:
  - i18n
createdAt: '2026-08-31T07:33:43.665Z'
updatedAt: '2026-08-31T08:23:54.671Z'
completedAt: '2026-08-31T08:23:36.719Z'
timeSpent: 0
---
# i18n audit toan bo - soat chuoi hardcode chua qua t()

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Nguoi dung dan: soat cai nao chua co i18n thi bo sung het. Sau khi UX port xong: grep src/** tim chuoi tieng Anh hardcode trong JSX khong boc t(), them key vao English base, kiem 31 locale/*.json phu het khong, xac nhan fallback thieu-key hien tieng Anh chu khong raw key.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 0 chuoi user-facing hardcode ngoai t()
- [ ] #2 31 locale khong loi parse; key moi it nhat co English + vi neu map duoc
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review workflow soat i18n: 6 chuoi hardcode confirmed (urlPreview x5, fileType labels, %, Space) da fix qua t() + ALIAS packs. Fallback en->key xac nhan dung.
<!-- SECTION:NOTES:END -->

