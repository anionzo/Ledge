---
id: doc-7fb372992cd3b9151331f41fd972db3c
title: smooth-10 quota i18n brief
description: Full implement context for icon+percent strip and en/vi Ledge keys.
createdAt: '2026-08-31T16:36:47.203Z'
updatedAt: '2026-08-31T16:36:47.203Z'
tags:
  - guide
  - smoothness
  - task-brief
---

# smooth-10 — quota glance strip + en/vi i18n

**Task:** @task-unlbvv | **AC:** spec AC-9 | **Priority:** high
**Depends:** none
**Conflict:** Claude `5ce0c7ee` was patching `src/i18n/index.ts` / vi. If dirty, finish that work against this brief instead of fighting.

## Goal (Ledge-native, not in Edge-Drop)

1. Collapsed quota strip shows **every enabled provider** as brand icon + used % (or dash), in one row. User asked: Cursor / Antigravity / Claude visible without expanding.
2. Language switch covers **Ledge keys** for hub + settings. Ship complete **en + vi**. Stop README "31 full languages".

## Current Ledge

`src/hub/components/QuotaStrip.tsx`:

- Collapsed: severity **dots** + **one hottest** name + % (`hottest()` by `ringPercent`)
- Expanded: `ProviderRow` list (correct)
- `ProviderBrandIcon` exists (`src/gauge/components/ProviderBrandIcon.tsx`) with glyphs for claude, codex, gemini, cursor, grok, opencode, deepseek. Antigravity is provider id **`gemini`** with displayName **Antigravity** — use id `gemini` for the glyph (sparkle already used). Do not invent a second provider id in this task.

`src/i18n/index.ts`:

- `en` is the Ledge taxonomy
- `src/i18n/locales/*.json` are Edge-Drop nested packs, reached via `ALIAS`
- `import.meta.glob('./ledge/*.json')` is already coded for Ledge-native overlays — **directory may be empty**
- `registerLocale` is unused
- Gauge/settings strings mostly English when locale is `vi`

README claims "31-language UI, including full Vietnamese" — false.

## Strip UI

Collapsed row:

```
[icon 12px][72%] [icon][—] [icon][41%]  …  chevron
```

- `%` from `reading.ringPercent`; if null, `—` (`unit.percent` / em dash already in file)
- `title` = displayName
- Click still toggles expand (`onToggle`)
- Do not wrap onto many rows; if > ~6 providers, allow horizontal scroll **inside the strip** rather than dropping names
- Color: severity on the **percent**, not a rainbow of icons (icons are `currentColor` / secondary)
- Pace `hot` can keep the existing warn ring on the icon

Keep expanded panel as-is.

## i18n

1. Add `src/i18n/ledge/vi.json` as a flat `Record<string, string>` of **all** keys in `en` (copy keys, translate values). The glob in `index.ts` already merges these over ALIAS.
2. Do not rewrite 31 Edge-Drop packs.
3. Settings language picker: keep listing packs, but missing Ledge keys fall back to English (already). Vietnamese should not fall back for hub/settings.
4. README Features "Everything else": change to "English + Vietnamese complete; other locales cover shared shelf strings".
5. New keys this wave (opacity, clear windows, displays, updater) must be in `en` **and** `vi.json`.

## Files

| File | Change |
|---|---|
| `src/hub/components/QuotaStrip.tsx` | icon+% row |
| `src/hub/styles/hub.css` | strip layout |
| `src/i18n/ledge/vi.json` | **New** full overlay |
| `src/i18n/index.ts` | only if glob path/docs need it |
| `README.md` | honest locale sentence |
| `src/gauge/components/ProviderBrandIcon.tsx` | only if gemini glyph must read as Antigravity — optional title, not a new id |

## Quota honesty

Do not decode more protobuf. Dashes are correct. See `antigravityCredits.ts`.

## Verify

@doc/guides/smoothness/verify-matrix section 10.

## Decision compliance

D2=pass (quota stays). D4=pass (no fake 31, no protobuf).
