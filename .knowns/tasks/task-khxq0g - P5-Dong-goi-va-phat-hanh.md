---
id: khxq0g
title: P5 - Dong goi va phat hanh
status: In Progress
priority: low
labels:
  - phase
  - packaging
createdAt: '2026-08-31T03:46:37.262Z'
updatedAt: '2026-08-31T06:38:10.269Z'
timeSpent: 0
---
# P5 - Dong goi va phat hanh

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
NSIS + MSIX cho Windows, DMG co notarize cho macOS, AppImage + deb cho Linux. Mot luong auto-update chung. NOTICE ghi cong hai repo goc.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Build ra duoc artifact cho ca ba OS
- [ ] #2 NOTICE ghi cong Edge-Drop Apache-2.0 va agent-notch MIT
- [ ] #3 LICENSE la Apache-2.0, giu nguyen van ban MIT trong licenses/
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Config electron-builder cho win/mac/linux da xong + valid. Icon app render bang resvg (resources/icon.png, tro win.icon/mac.icon vao day de electron-builder tu convert). entitlements.mac.plist tao (JIT + network.client). NOTICE/LICENSE/licenses da co. Da them author vao package.json. Build --win --dir chay tot toi buoc cuoi: rebuild native OK, tai electron 100%, chi fail EPERM khi rename dist\win-unpacked.tmp -> dist\win-unpacked (quirk quyen thu muc cua sandbox, KHONG phai loi config). Installer that (NSIS/dmg/AppImage) can CI runner theo tung OS; mac con can Apple Developer notarize - khong lam duoc tu may Windows nay.
WINDOWS INSTALLER BUILD THAT XONG: Bezel Setup 0.1.0.exe (~109MB) tren o C:. EPERM truoc do la do o E: chan rename thu muc win-unpacked.tmp; build voi -c.directories.output tro sang o C: thi qua het pipeline: giai nen electron, asar integrity, signtool, NSIS, uninstaller, blockmap. Config dung hoan toan. Mac/linux van can runner tung OS + Apple notarize.
<!-- SECTION:NOTES:END -->

