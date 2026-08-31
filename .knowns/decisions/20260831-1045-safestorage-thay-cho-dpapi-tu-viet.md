---
id: 20260831-1045-safestorage-thay-cho-dpapi-tu-viet
title: safeStorage thay cho DPAPI tu viet
status: draft
supersedes: []
supersededBy: []
tags:
  - security
  - cross-platform
sources:
  - 'https://www.electronjs.org/docs/latest/api/safe-storage'
relatedDocs: []
relatedTasks: []
verification: []
reviewState: needs_evidence
reviewBlockers:
  - candidate needs at least one linked task or a spec with linked tasks before acceptance
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedAt: '2026-08-31T03:45:50.837Z'
createdAt: '2026-08-31T03:45:50.837Z'
updatedAt: '2026-08-31T03:45:50.837Z'
---

## Context

Edge-Drop tu viet lop ma hoa lich su clipboard bang Windows DPAPI. Khong chay tren macOS/Linux.

## Decision

Dung electron safeStorage cho toan bo ma hoa tai cho. Mot API duy nhat anh xa xuong DPAPI tren Windows, Keychain tren macOS, kwallet/gnome-libsecret tren Linux.

## Alternatives Considered

Viet ba lop ma hoa rieng: ton cong va de sai. Bo ma hoa: khong chap nhan duoc vi lich su clipboard chua mat khau, token.

## Consequences

Xoa duoc code DPAPI tu viet. Tren Linux safeStorage co the fallback ve unprotected encryption neu khong co secret store - phai kiem tra isEncryptionAvailable va canh bao nguoi dung. Can duong migrate du lieu cu cua nguoi dung Edge-Drop.
