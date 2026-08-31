---
id: unlbvv
title: "[smooth-10] Quota glance strip + vi/en i18n"
status: todo
priority: high
labels:
  - from-spec
  - spec:edge-drop-smoothness-wave
  - spec-date:2026-08-31
  - edge-drop
createdAt: '2026-08-31T16:29:54.798Z'
updatedAt: '2026-08-31T16:37:43.423Z'
timeSpent: 0
parent: mlncst
spec: specs/2026-08-31/edge-drop-smoothness-wave
fulfills:
  - AC-9
order: 100
---
# [smooth-10] Quota glance strip + vi/en i18n

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ledge-native, not in Edge-Drop. Collapsed QuotaStrip must show icon+% per enabled provider (user request). Language switch must cover Ledge keys; ship complete en + vi dictionaries, stop claiming 31 full locales.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Collapsed strip shows ProviderBrandIcon + used percent or dash for every enabled provider in one row
- [ ] #2 Expand still shows full ProviderRow list
- [ ] #3 vi.json (or src/i18n/ledge/vi.json) uses Ledge keys for hub + settings; switching to Vietnamese translates those strings
- [ ] #4 README no longer claims 31 fully translated languages
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. QuotaStrip collapsed: ProviderBrandIcon + percent or dash per enabled reading, one row, click still expands.
2. Provider id gemini is Antigravity; do not add a new id. Do not invent quota numbers.
3. Add src/i18n/ledge/vi.json covering every en key (glob already in index.ts).
4. Honest README locale sentence. Include new keys from this wave.
5. Manual: collapsed 3 providers; switch vi.
D2=pass D4=pass.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Read first: @doc/guides/smoothness/smoothness-wave-index then @doc/specs/2026-08-31/edge-drop-smoothness-wave @doc/research/edge-drop-smoothness-gap @doc/guides/edge-drop-port-sources @doc/guides/smoothness/smoothness-settings-and-ipc @doc/guides/smoothness/smoothness-verify-matrix. Fetch Edge-Drop main at implement time, do not trust this snapshot date. D1-D6 in the spec. Keep one hub + quota. Brief: @doc/guides/smoothness/smooth-10-quota-i18n-brief QuotaStrip hottest() is the UX bug. ALIAS i18n is why vi is partial. registerLocale unused. Claude 5ce0c7ee may be patching i18n — do not fight.
<!-- SECTION:NOTES:END -->

