---
id: 9q66ks
title: Cost Meter — tinh tien theo token (per-model + spend tu delta so du)
status: done
priority: low
labels:
  - quota
  - cost-meter
createdAt: '2026-08-31T03:46:37.374Z'
updatedAt: '2026-09-02T08:48:15.964Z'
completedAt: '2026-08-31T07:33:10.691Z'
timeSpent: 0
---
# Cost Meter — tinh tien theo token (per-model + spend tu delta so du)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Doc luong token API tra ve va quy ra tien theo bang gia tung model. Hien canh vong han muc trong panel Gauge: chi phi phien hien tai, hom nay, thang nay. Nguoi dung yeu cau ghi lai de mot dung, CHUA LAM o dot nay.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Them field cost vao QuotaReading
- [x] #2 Bang gia theo model, phan biet goi thue bao voi goi tra theo luot dung
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dang lam. Cach tinh trung thuc: Bezel la spectator khong dem token tung request duoc, nen Cost Meter = (A) spend tu DELTA so du theo ky (tien that da dung, cho DeepSeek/balance provider) + (B) bang gia model tham chieu (Anthropic list price chinh xac tu skill claude-api: Opus 5/25, Sonnet-5 2/10, Haiku 1/5 per 1M; cache read ~0.1x, write ~1.25x). pricing.ts + balanceHistory.ts (snapshot so du, computeSpend today/month, top-up->0 khong am), wire vao refresh, cost line trong ProviderSheet. QuotaCost.currency mo rong USD|CNY. Khong bia token, model khong biet gia -> null.
XONG + verify bang app that: detail sheet DeepSeek hien CNY 110.00 + dong 'Spent today: CNY 12.50 · this month: CNY 47.30' (spend tu delta so du, dung CNY). deepseek-chat khong co trong bang gia Anthropic nen khong hien price ref (dung - khong bia). pricing.ts (gia Anthropic chinh xac + estimateCost cho tuong lai token path), balanceHistory.ts (snapshot + computeSpend today/month, top-up->0), CostLine trong ProviderSheet. 236 test pass, ca 2 typecheck xanh. Luu y kien truc nho: ProviderSheet import modelPrice tu electron/features/quota/pricing.ts (pricing.ts thuan, khong deps) - hoat dong nhung la vuot ranh gioi main/renderer, co the tach sang shared/ sau.
[hygiene 2026-09-02 Lead] Reconcile + verify: ca 2 AC dat trong code — AC1 cost?: QuotaCost|null tai shared/types/quota.ts:120; AC2 ModelPrice + co meteredByToken (true=spend that / false=subscription) tai quota.ts:150-160 + bang gia shared/pricing.ts. Drift path: note cu ghi electron/features/quota/pricing.ts, thuc te da tach sang shared/pricing.ts (dung nhu note du bao); balanceHistory o electron/store/balanceHistory.ts. Verify app: npm run typecheck xanh (node+web); npm run test = 365 pass/13 files, rieng tests/cost.test.ts 21 pass. Bo tien to BACKLOG khoi title + xoa label backlog.
<!-- SECTION:NOTES:END -->

