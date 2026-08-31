---
id: doc-2af601346dbab6afa274b927d318d02f
title: smooth-00 wave parent brief
description: Parent tracker context, child list, sequence, stop condition.
createdAt: '2026-08-31T16:36:46.324Z'
updatedAt: '2026-08-31T16:36:46.324Z'
tags:
  - guide
  - smoothness
  - task-brief
---

# smooth-00 — wave parent

**Task:** @task-mlncst
**Spec:** @doc/specs/2026-08-31/edge-drop-smoothness-wave
**Index:** @doc/guides/smoothness/index

This task is a tracker. Do not write product code here. Close it only when children are done or wont-do.

## Children (implement these)

- @task-e6f62s 01 probe — @doc/guides/smoothness/smooth-01-probe
- @task-qsavo6 02 monitors — @doc/guides/smoothness/smooth-02-monitors
- @task-ma5ui8 03 beacon — @doc/guides/smoothness/smooth-03-beacon
- @task-5vsd9y 04 material — @doc/guides/smoothness/smooth-04-material
- @task-euv8k3 05 drag — @doc/guides/smoothness/smooth-05-drag
- @task-gop97t 06 clear — @doc/guides/smoothness/smooth-06-clear
- @task-1jdmgn 07 capture — @doc/guides/smoothness/smooth-07-capture
- @task-370vlz 08 updater — @doc/guides/smoothness/smooth-08-updater
- @task-ayx44m 09 settings — @doc/guides/smoothness/smooth-09-settings
- @task-unlbvv 10 quota+i18n — @doc/guides/smoothness/smooth-10-quota-i18n

## Suggested sequence

1. 01 + 04 (feel: hover + glass) in parallel
2. 02 then 03 (03 uses trigger geometry)
3. 05, 06, 07, 08, 10 in parallel
4. 09 last (needs 02 display list + 04 slider)

## Do not

- Reopen @task-378teh
- Split the hub back into shelf + gauge windows
- Copy Edge-Drop `src/` wholesale
- Ship OAuth client secrets for Antigravity
- Edit Knowns markdown files by hand; use `knowns task` / `knowns doc`

## Stop condition

`npm test` + `npm run typecheck` green, ACs on the spec checked, hub still one frame, NOTICE intact.
