/**
 * Launch-at-login on Linux, via an XDG autostart desktop entry.
 *
 * Electron's `app.setLoginItemSettings` is documented as macOS and Windows
 * only — on Linux it silently does nothing, so a toggle wired to it would
 * appear to work and never launch anything. The portable mechanism is the XDG
 * Desktop Application Autostart Specification: a `.desktop` file in
 * `$XDG_CONFIG_HOME/autostart` (default `~/.config/autostart`), which GNOME,
 * KDE, XFCE, LXQt and Cinnamon all read.
 *
 * Two details that are easy to get wrong:
 *
 *  - **`Exec` must be the real launcher, not `process.execPath`.** Inside an
 *    AppImage, `execPath` points into `/tmp/.mount_XXXX/`, a mount that
 *    disappears when the app exits — an autostart entry pointing there is
 *    broken by the next boot. `$APPIMAGE` holds the path of the AppImage file
 *    itself and is the only correct value in that case.
 *
 *  - **`X-GNOME-Autostart-enabled`.** GNOME's Tweaks and Startup Applications
 *    UI disables an entry by setting this to `false` rather than deleting the
 *    file. Writing it explicitly as `true` on enable means re-enabling from
 *    Ledge actually re-enables, and reading it on `getAutostart` means a user
 *    who turned Ledge off in GNOME sees the toggle off in Ledge too. The
 *    spec's own `Hidden=true` is honoured on read for the same reason.
 *
 * Every operation is wrapped: a read-only `~/.config`, a full disk, or a
 * `$HOME` that does not exist all degrade to "autostart is off" rather than
 * throwing.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getElectron } from '../shared/nativeRequire'
import { xdgConfigHome } from './paths'

/** Reverse-DNS filename, per the spec's recommendation for uniqueness. */
const DESKTOP_FILE = 'ledge.desktop'

function autostartDir(): string {
  return join(xdgConfigHome(), 'autostart')
}

function desktopFilePath(): string {
  return join(autostartDir(), DESKTOP_FILE)
}

/**
 * The command the desktop environment should run.
 *
 * `$APPIMAGE` first (see the module comment), then Electron's idea of the
 * executable, then `process.execPath` as a last resort for a plain
 * `npm run dev` session.
 */
function execPath(): string {
  const appImage = process.env.APPIMAGE?.trim()
  if (appImage) return appImage
  try {
    const fromElectron = getElectron()?.app?.getPath('exe')
    if (fromElectron) return fromElectron
  } catch {
    /* fall through */
  }
  return process.execPath
}

/**
 * Quote a path for a desktop entry's `Exec` key.
 *
 * The spec requires a quoted argument to escape `"`, backtick, `$` and `\`
 * with a backslash. A path with a space in it is common enough
 * (`~/Applications/My Apps/Ledge.AppImage`) that skipping the quotes produces
 * a silently broken entry, and on Windows-built paths the backslash rule is
 * what stops `C:\x` becoming an escape sequence.
 *
 * Newlines are stripped rather than escaped: a newline inside `Exec` would
 * terminate the key and let the rest of the path be parsed as its own line.
 */
function quoteExec(value: string): string {
  const oneLine = value.replace(/[\r\n]+/g, ' ')
  const escaped = oneLine.replace(/(["`$\\])/g, '\\$1')
  return `"${escaped}"`
}

function desktopEntry(): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    'Name=Ledge',
    'GenericName=Clipboard shelf and agent quota gauge',
    'Comment=One frame, two screen edges',
    // --hidden tells electron/main to start without opening the panels.
    `Exec=${quoteExec(execPath())} --hidden`,
    'Icon=ledge',
    'Terminal=false',
    'Categories=Utility;',
    // The panels are always-on-top overlays; there is nothing to restore into
    // a single instance, and a second copy would fight the first for the edge.
    'StartupNotify=false',
    'X-GNOME-Autostart-enabled=true',
    // KDE reads this to stagger startup; a small delay lets the panel find a
    // settled work area instead of one that is still missing the taskbar.
    'X-KDE-autostart-after=panel',
    ''
  ].join('\n')
}

/**
 * True when an enabled autostart entry exists.
 *
 * "Exists" is not enough: a file with `X-GNOME-Autostart-enabled=false` or
 * `Hidden=true` is present but switched off, and reporting it as on would put
 * the Settings toggle out of step with the desktop's own UI.
 */
export async function getAutostart(): Promise<boolean> {
  try {
    const path = desktopFilePath()
    if (!existsSync(path)) return false

    const contents = readFileSync(path, 'utf8')
    if (/^\s*Hidden\s*=\s*true\s*$/im.test(contents)) return false
    if (/^\s*X-GNOME-Autostart-enabled\s*=\s*false\s*$/im.test(contents)) return false
    return true
  } catch (err) {
    console.error('[platform/linux] reading the autostart entry failed:', err)
    return false
  }
}

/**
 * Write or remove the autostart entry.
 *
 * Disabling deletes the file rather than setting `Hidden=true`. Deleting is
 * unambiguous across desktops, whereas `Hidden` is a GNOME-leaning convention
 * that some environments ignore — and an ignored `Hidden` means the app the
 * user just switched off still launches at login.
 */
export async function setAutostart(enabled: boolean): Promise<void> {
  const path = desktopFilePath()
  try {
    if (!enabled) {
      rmSync(path, { force: true })
      return
    }
    mkdirSync(autostartDir(), { recursive: true })
    // 0o644: the desktop environment reads it as the same user; no reason for
    // it to be executable or group-writable.
    writeFileSync(path, desktopEntry(), { encoding: 'utf8', mode: 0o644 })
  } catch (err) {
    // A read-only or missing home is the usual cause. The caller re-reads with
    // getAutostart(), so the toggle snaps back rather than lying.
    console.error('[platform/linux] writing the autostart entry failed:', err)
  }
}

export { desktopEntry, desktopFilePath }
