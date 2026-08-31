# Building Ledge

Ledge is an Electron app, so a "build" has two stages:

1. **Bundle** the TypeScript/React source into `out/` (`npm run build`, via
   electron-vite — main, preload, and the renderer).
2. **Package** `out/` into a per-OS installer with
   [electron-builder](https://www.electron.build/) (NSIS `.exe`, macOS `.dmg`,
   Linux `.AppImage` + `.deb`).

## The key fact: you build each OS on that OS

electron-builder can only produce a **fully valid, signable** installer on the
matching operating system:

| Target | Where it can be built | Why |
| --- | --- | --- |
| Windows `.exe` (NSIS) | Windows (Linux/macOS partial via wine) | NSIS + Authenticode signing are Windows tools |
| macOS `.dmg` | **macOS only** | `codesign`, the DMG toolchain, and Apple **notarization** exist only on macOS |
| Linux `.AppImage` / `.deb` | Linux (or Docker) | native packaging tools |

You **cannot** build a distributable macOS DMG on Windows or Linux — Apple's
signing and notarization are macOS-only. That is not an Electron limitation; it
is how Apple's toolchain works.

So the answer to "how do the other platforms get built?" is: **CI runs each
platform's build on its own runner.** See `.github/workflows/release.yml` — a
matrix over `macos-latest`, `ubuntu-latest`, and `windows-latest`, each running
`electron-builder` for its own OS and uploading to the GitHub Release.

## Local builds

```bash
npm install          # first time; downloads the Electron binary
npm run build        # bundle to out/
npm run build:win    # NSIS installer  -> dist/Ledge Setup <ver>.exe   (on Windows)
npm run build:mac    # DMG             -> dist/Ledge-<ver>.dmg          (on macOS)
npm run build:linux  # AppImage + deb  -> dist/                        (on Linux)
```

Output goes to `dist/` (git-ignored).

> **Windows note:** on some drives (e.g. a restricted or network-mapped drive),
> electron-builder fails with `EPERM: operation not permitted, rename
> '…\win-unpacked.tmp' -> '…\win-unpacked'`. That is the OS blocking a directory
> rename, not a config error. Build to a normal local path on `C:` — e.g.
> `npx electron-builder --win nsis -c.directories.output=%TEMP%\ledge-dist`.

## Release build (all platforms) via CI

1. Bump `version` in `package.json`.
2. Tag and push:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
3. `release.yml` builds Windows + macOS + Linux in parallel and attaches the
   installers to the GitHub Release for that tag. `GH_TOKEN` is the built-in
   `secrets.GITHUB_TOKEN`; no extra setup is needed for **unsigned** artifacts.

## Code signing & notarization (optional, for trusted installs)

Without signing, users see a warning on first launch (Windows SmartScreen;
macOS Gatekeeper "unidentified developer"). To ship trusted installers, add
these **repository secrets** and re-enable signing in `release.yml`:

> **Smart App Control is a harder wall than SmartScreen.** SmartScreen warns
> and offers "Run anyway"; Smart App Control (Windows 11, on by default only
> for clean installs) blocks an unsigned binary outright with no override, and
> a user can only turn it off permanently — Windows will not re-enable it
> without a reinstall. So signing is what makes Ledge installable on those
> machines at all, not merely warning-free. The README points affected users at
> the from-source npm route in the meantime; note that an enforcing machine may
> block the unsigned `electron.exe` under `node_modules` as well, which has not
> been tested against one.
>
> Cheapest current path is **Azure Trusted Signing** (about $10/month, but it
> requires identity verification through Microsoft). A traditional OV/EV
> certificate from DigiCert or Sectigo runs into the hundreds per year and,
> since 2023, must live on a hardware token or cloud HSM — which is awkward to
> feed to CI.

**macOS** (requires an Apple Developer account, ~$99/yr):
- `CSC_LINK` — base64 of your `Developer ID Application` `.p12`
- `CSC_KEY_PASSWORD` — its password
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` — for notarization

Then remove the `CSC_IDENTITY_AUTO_DISCOVERY: false` line from the macOS job.
`resources/entitlements.mac.plist` already grants the hardened-runtime
entitlements Electron needs.

**Windows** (requires a code-signing certificate):
- `CSC_LINK` / `CSC_KEY_PASSWORD` for the `.pfx`

## Auto-update

`package.json` `build.publish` points at the GitHub repo, and
`electron/main/updater.ts` is wired to it: a packaged build checks GitHub 10 s
after start and every 4 hours after that, downloads per `settings.autoUpdates`,
and installs only when the user presses **Restart to update** in Settings.

Nothing happens on an unpackaged run (`npm run dev`, `npm start`) or on a
Store/MSIX build — no listener is attached and no request is made. Publishing a
release therefore needs `latest.yml` beside the installer, which
`electron-builder --publish always` uploads for you.

Note that `electron-updater` is CommonJS and must be imported as a default
import; the named form typechecks, builds, and then kills the app at launch.
The comment in `updater.ts` explains it.
