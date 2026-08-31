# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

<!-- Delivery is an Electron desktop app (Windows/macOS/Linux); the renderer is web tech (React 19 + TypeScript). Recorded as `web` because every design surface is web-rendered UI. -->

## Users

Primary: developers and AI power-users who run several AI coding-agent CLIs/apps at once — Claude Code, Codex, Gemini / Antigravity, Cursor, Grok, OpenCode, DeepSeek, plus custom gateway relays. They work on the desktop while coding or chatting with agents and need two things at a glance without leaving what they are doing: how close each agent is to its quota/limit, and a fast clipboard history to shuttle snippets, links, images, and files between apps.

Distribution: a public, open-source desktop product (Apache-2.0, GitHub releases, auto-update) for the general public — not a personal tool or an internal/enterprise build.

## Product Purpose

Ledge docks a single frame to a screen edge and carries two features in one: an AI-agent quota gauge (the strip along the top/edge) and a clipboard shelf (below it). It answers "can I start another long agent task right now?" without opening each provider's dashboard, and "where's the thing I just copied?" without a heavyweight clipboard manager. Success is that the user gets both answers in a glance from the screen edge, and the panel costs nothing — it stays out of the way — when not in use.

## Positioning

- Reads each provider's quota/usage **locally** — from installed CLIs, local state stores (e.g. VS Code-style `state.vscdb`), and prepaid balances — so it needs no provider dashboard and, for many providers, no login or API key.
- **One unified frame for two jobs** that used to be two separate tools (a clipboard manager and a quota tracker), docked to a screen edge with an edge-hover / click-through model that keeps the desktop usable underneath.
- **Private by construction:** clipboard history can be encrypted at rest, incognito pauses capture, and provider secrets are sealed via the OS key store.
- A neighbouring product could copy either half, but not the honest, local, no-dashboard quota read across a whole family of agents combined with the clipboard shelf in one screen-edge frame.

## Operating Context

- Electron desktop app on Windows, macOS, and Linux, treated as **equal** targets.
- Lives at a screen edge; opens on edge-hover or a global hotkey; collapses via click-through (or window resize on Linux). Stands down while a fullscreen app or game is in front.
- The shipped surface is a unified **hub** (quota strip + clipboard shelf in one frame) plus a **Settings** window. The panel is narrow (hub/shelf ≈ 360 px, gauge ≈ 320 px) and full display height.
- Interactions are glance-and-go: hover to open, tap the strip to see every provider, refresh quotas, drag a card straight into another app, pin/search/merge clips.
- 31-language UI including Vietnamese; the primary maintainer works in Vietnamese.

## Capabilities and Constraints

- **Quota providers:** Claude, Codex, Gemini / Antigravity, Cursor, Grok, OpenCode, DeepSeek (balance-shaped), plus user-defined custom providers (shell command → JSON, HTTPS GET + JSON dot-path, or manual entry).
- **Reading shapes:** window-based (5-hour session and/or weekly, with a reset countdown and a burn-rate "hot" warning) and balance-based (money or credits left).
- **Honesty rule (hard constraint):** a provider that cannot prove a number shows a status — "not installed", "signed out", "permission needed", "reset unknown", or a retained "last known / stale" reading — never an invented percentage or a substituted 0.
- **Clipboard shelf:** text, links (offline URL preview), images (thumbnail + full-resolution lightbox), files/folders; pin, search, filter, multi-select, merge into stacks, split, drag out natively.
- **Settings:** theme (system/light/dark), language, panel opacity, text scale, copy indicator, reduce-motion, per-panel side/height/trigger position, global hotkeys, history size + encryption, provider enable/configure.
- **Technical constraints:** Electron + React 19 + TypeScript; single-instance lock; several capabilities are OS-dependent (click-through collapse, non-activating windows, fullscreen detection, launch-at-login, encrypted storage) and the app degrades **honestly** where a platform lacks one. Local quota sources can be stale or unavailable (an old state file, an expired token) — the app shows a stale/last-known state rather than guessing.

## Brand Commitments

- Name **"Ledge"** and tagline **"One frame, two screen edges."** — binding.
- **Achromatic chrome:** colour carries meaning only — the quota rings/severity, a selection, a primary action — never decoration. Binding.
- **Local, private quota reads:** encrypted history, incognito, no provider dashboard or forced login required. Binding.
- **Cross-platform** (Windows / macOS / Linux, equal) and **full i18n** (31 languages including Vietnamese). Binding.
- **Ease of use and task-completeness:** every task the app implies must be simple to reach and fully doable — usability and completeness are a stated, binding requirement, not a nice-to-have.
- Apache-2.0 open source; current visual identity is the "Obsidian Blade" token system (near-black ground, single violet accent).

## Evidence on Hand

- Real, working provider readers in `electron/features/quota/*`; the design token system in `src/design/tokens.css`; `README.md`; `LICENSE` (Apache-2.0); `NOTICE`.
- 31 locale packs in `src/i18n/locales/` plus a complete Ledge-native Vietnamese dictionary in `src/i18n/ledge/vi.json`.
- **Absences future work must not fabricate:** there are no testimonials, named customers, benchmarks, pricing, revenue, or install-count claims. Do not invent them.

## Product Principles

1. **Glance over dashboard.** Every surface answers one question at the screen edge, then gets out of the way — no charts or history walls where a single number is the answer.
2. **Honest data.** Never invent a quota number; show the real state (unknown / stale / signed-out) instead. Colour means severity, never decoration.
3. **Private by default.** Read locally, encrypt at rest, pause on demand; never require a provider login or send data outward.
4. **Easy and complete.** Every task the app implies is simple to reach and fully doable; usability and task-completeness are first-class (a binding user requirement).
5. **One product, every platform and language.** Windows, macOS, Linux and 31 languages are equal citizens; degrade honestly where an OS lacks a capability.

## Accessibility & Inclusion

- Full internationalization (31 languages incl. Vietnamese) is a product requirement, not an add-on.
- Honors reduce-motion (OS-level and an in-app setting); manages keyboard focus and ARIA on panels and sheets; keeps "usage unknown" and "nothing used" distinct for screen-reader users. (Observed in the current code — treat as the standard to maintain.)
