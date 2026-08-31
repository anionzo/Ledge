---
id: 20260831-1045-panelhost-voi-collapsestrategy-thay-vi-hardcode-click-through
title: PanelHost voi collapseStrategy thay vi hardcode click-through
status: draft
supersedes: []
supersededBy: []
tags:
  - architecture
  - cross-platform
sources:
  - 'https://www.electronjs.org/docs/latest/api/browser-window'
relatedDocs: []
relatedTasks: []
verification: []
reviewState: needs_evidence
reviewBlockers:
  - candidate needs at least one linked task or a spec with linked tasks before acceptance
reviewMatches: []
reviewAllowedResolutions: []
reviewEvaluatedAt: '2026-08-31T03:45:31.317Z'
createdAt: '2026-08-31T03:45:31.317Z'
updatedAt: '2026-08-31T03:45:31.317Z'
---

## Context

Edge-Drop thu gon panel bang cach giu cua so full-size trong suot roi goi setIgnoreMouseEvents cho chuot xuyen qua. Tai lieu Electron ghi ro setIgnoreMouseEvents chi ho tro macOS va Windows - Linux khong co.

## Decision

PanelHost nhan PanelSpec { id, side: left|right, width, gripPx, collapseStrategy: clickthrough|resize }. clickthrough cho win32/darwin; resize (thu cua so con dung dai grip) cho linux. Ca hai panel Shelf va Gauge deu la instance cua PanelHost.

## Alternatives Considered

Hardcode click-through nhu Edge-Drop: se chan click toan man hinh tren Linux. Bo Linux hoan toan: nguoi dung noi Linux la nice-to-have nen khong nen dong cua som.

## Consequences

Them mot seam nho tu P0 thay vi phai mo lai kien truc giua chung. Cung lam cho viec them panel thu ba tro thanh chuyen tam thuong - dung voi ten du an TASKBAR-ALL.
