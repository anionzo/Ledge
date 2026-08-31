---
id: k31onn
title: Model pricing o shared/pricing.ts, khong phai electron/
layer: project
category: convention
status: proposed
tags:
  - architecture
createdAt: '2026-08-31T06:34:27.578Z'
updatedAt: '2026-08-31T06:34:27.578Z'
---

Da chuyen pricing.ts (bang gia model + modelPrice + estimateCost) tu electron/features/quota/ sang shared/pricing.ts de renderer (ProviderSheet) va main deu import tu cho chung, khong vuot ranh gioi main/renderer. Chi phu thuoc shared/types/quota (ModelPrice). Importers: src/gauge/components/ProviderSheet.tsx va tests/cost.test.ts. Da fix xong, 236 test pass.
