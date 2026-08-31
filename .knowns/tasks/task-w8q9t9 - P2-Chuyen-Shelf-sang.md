---
id: w8q9t9
title: P2 - Chuyen Shelf sang
status: done
priority: medium
labels:
  - phase
  - clipboard
createdAt: '2026-08-31T03:46:19.593Z'
updatedAt: '2026-08-31T07:33:10.441Z'
completedAt: '2026-08-31T07:33:10.441Z'
timeSpent: 0
---
# P2 - Chuyen Shelf sang

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Be clipboard, ItemStore, drag tu Edge-Drop cung 29 file test. Boc phan doc dinh dang ra formats/{win32,darwin,linux}.ts. Doi DPAPI sang safeStorage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ClipboardWatcher chay duoc tren ca ba OS
- [ ] #2 startDrag keo file ra ngoai duoc, icon khac rong tren macOS
- [ ] #3 Lich su ma hoa bang safeStorage, co duong migrate tu DPAPI cu
- [ ] #4 29 file test tu Edge-Drop pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dang port bo may clipboard tu Edge-Drop (ClipboardWatcher, formats/{win32,darwin,linux}, ItemStore doi DPAPI->safeStorage, drag.ts, imageProtocol bezel://, thumbnailCache). Subagent lam electron/features/clipboard/**; main wiring (register scheme privileged, tao engine, thay registerShelfPlaceholders, start/stop lifecycle) do minh tu noi.
XONG + verify bang app that: copy 3 chuoi qua PowerShell Set-Clipboard, watcher bat dung, URL tu phan loai thanh LINK, hien theo thu tu moi-nhat-len-dau, tieng Viet OK. 206/206 test pass, typecheck+build xanh. Phat hien quan trong: Electron ban nay dung clipboard API ASYNC (W3C: read/readText/write la Promise), KHONG phai sync nhu Edge-Drop - subagent da thich ung, chua async trong formats/clip.ts, logic phan loai/chu ky la ham thuan de test. Wiring o main: registerSchemesAsPrivileged(bezel) truoc ready; registerBezelProtocol + createClipboardEngine + engine.start + registerClipboardIpc sau ready; engine.stop khi teardown.
<!-- SECTION:NOTES:END -->

