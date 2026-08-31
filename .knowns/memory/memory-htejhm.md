---
id: htejhm
title: Knowns MCP khong co san, dung CLI lam fallback
layer: project
category: convention
status: proposed
tags:
  - tooling
createdAt: '2026-08-31T03:52:32.357Z'
updatedAt: '2026-08-31T03:52:32.357Z'
---

MCP server cua Knowns khong xuat hien trong tool list cua phien nay. CLI knowns v0.30.0 co san va chay duoc, dung dung nhu KNOWNS.md quy dinh o muc Source of Truth (CLI la fallback khi MCP khong co). Luu y: lenh tao ghi ra canh bao 'search runtime queue unavailable ... projects.json.lock: Access is denied' nhung van tao file thanh cong. Va 'knowns decision list' khong co --status thi tra ve rong du da co decision - phai them --status draft.
