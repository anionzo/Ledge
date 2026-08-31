---
id: ttafyv
title: Custom-provider token duoc ma hoa qua safeStorage tren dia
layer: project
category: convention
status: proposed
tags:
  - security
createdAt: '2026-08-31T06:14:56.991Z'
updatedAt: '2026-08-31T06:14:56.991Z'
---

electron/store/settings.ts: token cua custom HTTP provider luu dang SS1:<base64> tren dia (ma hoa qua safeStorage DPAPI/Keychain/libsecret), giu plaintext trong bo nho de quota reader dung. protectToken()/mapTokens() lam viec nay: encrypt luc save (chi ban tren dia), decrypt luc load (vao cache in-memory). Neu OS khong co secret store -> giu plaintext (suy bien co ghi chu). Token khong the seal/unseal -> bi drop, nguoi dung nhap lai. Thay cho TODO cu cua backend agent.
