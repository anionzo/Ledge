---
id: 20260831-1102-hai-hinh-dang-han-muc-cua-so-phan-tram-vs-so-du-tra-truoc
title: 'Hai hinh dang han muc: cua so phan tram vs so du tra truoc'
status: draft
supersedes: []
supersededBy: []
tags:
  - architecture
  - quota
sources:
  - 'https://api-docs.deepseek.com/api/get-user-balance/'
relatedDocs: []
relatedTasks: []
verification: []
reviewState: needs_evidence
reviewBlockers:
  - candidate needs at least one linked task or a spec with linked tasks before acceptance
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedAt: '2026-08-31T04:02:12.171Z'
createdAt: '2026-08-31T04:02:12.171Z'
updatedAt: '2026-08-31T04:02:12.171Z'
---

## Context

Bay provider cua agent-notch deu bao phan tram da dung cua mot cua so thoi gian kem moc reset. Vong tron trong panel Gauge duoc thiet ke quanh dung hinh dang do. Khi khao sat DeepSeek phat hien no tra ve tien (CNY/USD) chu khong phai phan tram - khong co mau so de chia, khong co moc reset. Dang chu y: endpoint /user/balance cua DeepSeek la CHINH THUC CO TAI LIEU, khac voi endpoint noi bo khong tai lieu cua Claude va Gemini.

## Decision

Thua nhan hai hinh dang. Them field tuy chon balance?: QuotaBalance | null vao QuotaReading, canh session/weekly. QuotaBalance gom currency CNY|USD, totalBalance grantedBalance toppedUpBalance dang chuoi thap phan chinh xac (khong parse thanh float nhi phan), va isAvailable. Gauge ve thanh so cho provider dang so du thay vi ve vong tron.

## Alternatives Considered

Nhet so du vao usedPercent: buoc phai de null va vong tron hien dau gach - vo dung. Doi den khi lam Cost Meter: nhung the thi phai mo lai kieu du lieu sau, dat hon nhieu so voi 30 dong bay gio.

## Consequences

Field balance chinh la seam ma Cost Meter (task backlog 9q66ks) se dung. Dat no bay gio KHONG phai la lam som Cost Meter - la dat nen de mot Cost Meter chi con la cong them bang gia. Gauge can hai kieu hien thi trong cung mot vat lieu.
