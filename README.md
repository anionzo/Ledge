# Ledge

**One frame on the edge of your screen — a drag-and-drop clipboard shelf and a
live AI-agent quota/cost HUD, together.**

Ledge tucks into the right edge of your desktop and stays out of the way until
you hover it. Open it and you get two things in one frame:

- a **clipboard shelf** — everything you copy, ready to drag straight into any
  app;
- a **quota strip** — how much of each AI coding agent's limit you've used, and
  how much you've spent.

It's a cross-platform (Windows / macOS / Linux) [Electron](https://www.electronjs.org/)
app, built by merging two focused open-source tools —
[Edge-Drop](https://github.com/Deepender25/Edge-Drop) (the clipboard rail) and
[agent-notch](https://github.com/adityarya24/agent-notch) (the quota readers) —
into one.

---

## Features

### Clipboard shelf
- Hover the screen edge to slide the panel open; it's click-through and out of
  the way when closed.
- Text, links, images, files, and multi-item stacks — each copy lands as a card.
- **Drag straight out** of Ledge into any application (native OS drag).
- History **encrypted at rest** via the OS keystore (`safeStorage` — DPAPI /
  Keychain / libsecret).
- Search, multi-select, pin, and a preview flyout.

### AI quota HUD
Reads each agent's quota from **local credentials** and the provider's own API —
no proxy, no middleman:

| Provider | Shows |
| --- | --- |
| Claude Code, Codex, Gemini, Cursor, Grok, OpenCode | % used of the session / weekly window + reset countdown |
| **DeepSeek** | prepaid **balance** (documented `/user/balance` endpoint) |
| **Custom (HTTP)** | any gateway relay — Sub2API / new-api / one-api — via URL + Bearer token + a JSON path |

It **never invents a number**: a provider that can't prove a value shows a dash
and the reason (not installed, logged out, permission needed, …).

### Cost Meter
Real spend, computed honestly. Ledge is a spectator — it can't count tokens per
request — so it tracks **how much a prepaid balance falls over time** (today /
this month) and shows an **Anthropic price reference** for known models. No
fabricated token counts.

### Everything else
- One unified **Settings** window (Behaviour · Panels · Agents · Appearance · About).
- **English and Vietnamese** fully translated; ~29 more locales (carried over
  from Edge-Drop) cover the shared clipboard/settings vocabulary and fall back
  to English for Ledge-specific strings like the quota HUD — never a
  machine-invented translation. RTL supported.
- Cross-platform seam: a `PlatformAdapter` with `win32` / `darwin` / `linux`
  implementations; nothing else in the app reads `process.platform`.

---

## Install

### Windows
Download the **`Ledge Setup <version>.exe`** installer from the
[latest release](https://github.com/anionzo/Ledge/releases/latest) and run it.

> The installer is **not code-signed** yet. Two different Windows features
> react to that, and they are not the same thing:
>
> - **SmartScreen** warns. Click **More info -> Run anyway** and you are done.
> - **Smart App Control** *blocks*, with no "run anyway" button at all. It is
>   Windows 11 only and switches itself on only for clean installs, so most
>   machines never see it. If you hit it, use the npm route below — turning
>   Smart App Control off is a one-way door (Windows will not let you turn it
>   back on without a reinstall), and that is a big price for one app.

After that, Ledge keeps itself current: it checks GitHub releases in the
background and installs the new version on your next restart. Turn it off under
**Settings -> Behaviour -> Updates**. A Microsoft Store build never checks —
the store owns updates there.

### Any OS, from source (npm)

No installer, so nothing for SmartScreen to flag — the files arrive through npm
rather than a browser download, so they never get the Mark-of-the-Web that
SmartScreen keys on. Needs Node 20+ and roughly 1 GB of disk for
`node_modules`.

```bash
git clone https://github.com/anionzo/Ledge.git
cd Ledge
npm ci
npm start          # builds, then launches the app
```

Ledge lives in the tray — right-click the tray icon for Settings or Quit.
`npm start` rebuilds first, so it is also what you run after pulling changes.

> Honest limits: this route skips the installer, so there is no Start-menu
> shortcut, no launch-at-login entry written by the installer, and **no
> auto-update** — `git pull && npm start` is the update. And if Smart App
> Control is in *enforcement* mode it may block the unsigned `electron.exe`
> inside `node_modules` too; that has not been tested against a live
> enforcement machine. The only real fix for both is a code-signing
> certificate — see [`docs/BUILD.md`](docs/BUILD.md).

### macOS / Linux
The build configuration is ready (DMG / AppImage + deb), but signed artifacts
are produced by CI on their own runners — see
[`docs/BUILD.md`](docs/BUILD.md). Until a release includes them, build locally
on the target OS with `npm run build:mac` / `npm run build:linux`.

---

## Develop

```bash
npm install
npm run dev          # electron-vite dev server + the app
npm run typecheck    # tsc, main + renderer projects
npm test             # vitest (236 tests)
```

See [`docs/BUILD.md`](docs/BUILD.md) for packaging installers and the CI release
flow.

## Architecture

```
electron/
  main/         app lifecycle, PanelHost (one edge-docked window), tray, hotkeys, IPC
  platform/     the cross-platform seam — {win32,darwin,linux} adapters
  features/
    clipboard/  watcher, item store, native drag-out, ledge:// image protocol
    quota/      one file per provider behind a QuotaProvider interface, pricing, cache
  store/        settings + balance-history persistence (atomic, encrypted)
  preload/      the typed window.ledge bridge
shared/         the IPC contract + shared types + the model price table
src/
  hub/          the unified renderer — quota strip on top, clipboard below
  gauge/ shelf/ settings/  feature components composed into the hub
  ui/           shared primitives (Ring, BalanceMeter, Sheet, …)
  design/       tokens.css — the "Instrument" design system
  i18n/         31 locale packs
```

Design and decisions are recorded in the repo's [Knowns](KNOWNS.md) store
(`.knowns/decisions`).

## Credits & license

Ledge is licensed under **Apache-2.0** (see [`LICENSE`](LICENSE)). It is derived
from **Edge-Drop** (Apache-2.0) and **agent-notch** (MIT); full attribution is in
[`NOTICE`](NOTICE) and the original license texts are in [`licenses/`](licenses).
