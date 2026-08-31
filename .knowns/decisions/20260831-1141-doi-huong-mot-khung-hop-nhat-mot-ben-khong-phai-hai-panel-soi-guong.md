---
id: 20260831-1141-doi-huong-mot-khung-hop-nhat-mot-ben-khong-phai-hai-panel-soi-guong
title: 'Doi huong: mot khung hop nhat mot ben, khong phai hai panel soi guong'
status: draft
supersedes: []
supersededBy: []
tags:
  - architecture
  - ui
sources: []
relatedDocs: []
relatedTasks: []
verification: []
reviewState: needs_evidence
reviewBlockers:
  - candidate needs at least one source before acceptance
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedAt: '2026-08-31T04:41:01.627Z'
createdAt: '2026-08-31T04:41:01.627Z'
updatedAt: '2026-08-31T04:41:01.627Z'
---

## Context

Ban dau thiet ke hai panel soi guong: Shelf mep trai (clipboard), Gauge mep phai (quota). Khi chay thu app that, nguoi dung phan hoi: (1) panel che het desktop khi khoi dong - do usePanelOpen(initial=true) lam renderer paint full glass ngay tu dau, lai co hai cai nen che ca hai mep; (2) muon gop thanh MOT khung mot ben cho gon, khong tach hai.

## Decision

Mot panel hub duy nhat, dock mep phai (gan khay he thong Windows). Bo tri nguoi dung chon: quota la dai mong tren cung (cham mau theo severity + % nong nhat), bam bung ra overlay chi tiet; clipboard chiem gan tron khung ben duoi. Renderer khoi dong DONG (usePanelOpen(false)), truot khuat khoi mep khi dong nen khong che desktop. Internal panel id giu 'shelf' de routing/toggle/push khong doi; htmlEntry tro toi renderer moi src/hub.

## Alternatives Considered

Giu hai panel: nguoi dung khong muon. Tab chuyen qua lai / xep chong: nguoi dung chon kieu dai-mong-bung-ra vi toi gian nhat.

## Consequences

Bo hai renderer entry shelf/gauge, thay bang mot entry hub; component cua chung van dung, chi ghep lai. Fix luon bug che-het bang cach khoi dong dong. Bе nguyen 31 ngon ngu i18n + lib helper cua Edge-Drop ve xai (nguoi dung yeu cau tan dung setup san co).
