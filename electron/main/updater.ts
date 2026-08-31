/**
 * Silent GitHub auto-update.
 *
 * Adapted from Edge-Drop electron/main/updater.ts (Apache-2.0).
 *
 * `electron-updater` has been a dependency since Ledge's package.json was
 * first assembled but had zero call sites until this file — `build.publish`
 * already points at the GitHub repo `anionzo/Ledge`, so wiring this up is
 * only a matter of turning the library on carefully:
 *
 *   - Store/MSIX builds never call it (`isStoreBuild()`), because the Store
 *     owns updates for those installs and reaching out to GitHub ourselves
 *     would violate its policy.
 *   - An unpackaged `npm run dev` run never calls it either — there is no
 *     installer to replace, and hitting the network on every dev launch
 *     would be an unwelcome side effect of building the app.
 *   - Both of the above are true "no-op" states: no listener is attached to
 *     `autoUpdater`, no timer is scheduled, nothing touches the network. The
 *     `UpdaterStatus` returned just says `supported: false` so the Settings
 *     banner can render nothing.
 *   - A failed check or download is a logged warning and an `error` string on
 *     the status object — never a dialog, never a crash, and never a retry
 *     storm: the periodic re-check already covers "try again later".
 */
import { app } from 'electron'
import {
  autoUpdater,
  type ProgressInfo,
  type UpdateDownloadedEvent,
  type UpdateInfo
} from 'electron-updater'
import type { UpdaterStatus } from '../../shared/ipc'
import type { Settings } from '../../shared/types/settings'
import { isStoreBuild } from './config'

export interface UpdaterController {
  status(): UpdaterStatus
  check(): Promise<UpdaterStatus>
  download(): Promise<UpdaterStatus>
  quitAndInstall(): void
  dispose(): void
}

export interface UpdaterDeps {
  getSettings: () => Settings
  /** Push a status change to every renderer. Main passes its `broadcast`. */
  onStatus: (status: UpdaterStatus) => void
}

/** Let the app finish painting its windows before the first network call. */
const INITIAL_CHECK_DELAY_MS = 10_000
/** GitHub releases do not need polling more often than this. */
const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000 // 4 hours

const UNSUPPORTED_STATUS: UpdaterStatus = {
  storeBuild: false,
  supported: false,
  checking: false,
  downloading: false,
  availableVersion: null,
  downloadedVersion: null,
  error: null
}

export function initAutoUpdater(deps: UpdaterDeps): UpdaterController {
  const storeBuild = isStoreBuild()

  // Both "no-op" cases return here, before touching `autoUpdater` at all —
  // no listener attached, nothing scheduled. `!app.isPackaged` covers `npm
  // run dev` and `electron-vite preview`, where there is no installed
  // artifact for an update to replace.
  if (storeBuild || !app.isPackaged) {
    const status: UpdaterStatus = { ...UNSUPPORTED_STATUS, storeBuild }
    return {
      status: () => status,
      check: () => Promise.resolve(status),
      download: () => Promise.resolve(status),
      quitAndInstall: () => {},
      dispose: () => {}
    }
  }

  let status: UpdaterStatus = {
    storeBuild: false,
    supported: true,
    checking: false,
    downloading: false,
    availableVersion: null,
    downloadedVersion: null,
    error: null
  }

  const emit = (patch: Partial<UpdaterStatus>): void => {
    status = { ...status, ...patch }
    deps.onStatus(status)
  }

  // electron-updater ships electron-log-shaped logging by default, which
  // would write to disk on its own schedule. Ledge does its own logging
  // (console.warn below) and surfaces failures through `UpdaterStatus`
  // instead, so the built-in logger is switched off rather than left to do
  // something the rest of the app cannot see.
  autoUpdater.logger = null

  // The user's own toggle decides whether a found update downloads itself or
  // waits for an explicit `download()` call from the Settings banner. Read
  // live at the moment a check runs (see `check()` below) rather than once
  // here, so flipping the setting takes effect on the very next check without
  // requiring a restart.
  autoUpdater.autoDownload = deps.getSettings().autoUpdates

  // Never install without the user pressing "Restart to update": quitting
  // Ledge normally (tray → Quit, or the OS shutting it down) must not swap
  // the binary out from under a user who never asked for that. The explicit
  // `quitAndInstall()` below is the only path that installs.
  autoUpdater.autoInstallOnAppQuit = false

  // GitHub releases are public; electron-updater talks to the GitHub API and
  // CDN over HTTPS using the `owner`/`repo` electron-builder already baked
  // into `app-update.yml` from `package.json`'s `build.publish`. No token is
  // read or attached — a public repo's release feed needs none, and adding
  // one here would be exactly the kind of secret this file must never log.

  const onChecking = (): void => {
    emit({ checking: true, error: null })
  }
  const onAvailable = (info: UpdateInfo): void => {
    emit({ checking: false, availableVersion: info.version })
  }
  const onNotAvailable = (): void => {
    emit({ checking: false, availableVersion: null })
  }
  const onProgress = (_progress: ProgressInfo): void => {
    // `UpdaterStatus` has no percentage field — the banner only ever shows
    // "downloading" vs. not — so once the flag is up there is nothing new to
    // push on every subsequent tick.
    if (!status.downloading) emit({ downloading: true })
  }
  const onDownloaded = (info: UpdateDownloadedEvent): void => {
    emit({ downloading: false, downloadedVersion: info.version })
  }
  const onError = (error: Error): void => {
    console.warn('[updater] check/download failed', error)
    emit({ checking: false, downloading: false, error: error.message })
  }

  autoUpdater.on('checking-for-update', onChecking)
  autoUpdater.on('update-available', onAvailable)
  autoUpdater.on('update-not-available', onNotAvailable)
  autoUpdater.on('download-progress', onProgress)
  autoUpdater.on('update-downloaded', onDownloaded)
  autoUpdater.on('error', onError)

  const runCheck = (): Promise<UpdaterStatus> => {
    autoUpdater.autoDownload = deps.getSettings().autoUpdates
    return autoUpdater
      .checkForUpdates()
      .then(() => status)
      .catch((error: unknown) => {
        // `checkForUpdates` also rejects for network-layer failures that
        // never reach the `error` event (e.g. DNS). Route it through the same
        // warn-and-surface path so both failure shapes behave identically.
        const err = error instanceof Error ? error : new Error(String(error))
        onError(err)
        return status
      })
  }

  // Schedule the quiet background checks: once shortly after startup, then on
  // a slow recurring interval. `check()` below (the explicit "Check for
  // updates" button) runs independently of this schedule.
  const initialTimer: ReturnType<typeof setTimeout> = setTimeout(() => {
    void runCheck()
  }, INITIAL_CHECK_DELAY_MS)
  const intervalTimer: ReturnType<typeof setInterval> = setInterval(() => {
    void runCheck()
  }, RECHECK_INTERVAL_MS)

  return {
    status: () => status,

    check: runCheck,

    download: () => {
      if (status.downloading || status.downloadedVersion) return Promise.resolve(status)
      return autoUpdater
        .downloadUpdate()
        .then(() => status)
        .catch((error: unknown) => {
          const err = error instanceof Error ? error : new Error(String(error))
          onError(err)
          return status
        })
    },

    quitAndInstall: () => {
      // Guard against a stray call before anything finished downloading —
      // electron-updater would otherwise try to install nothing.
      if (!status.downloadedVersion) return
      autoUpdater.quitAndInstall(false, true)
    },

    dispose: () => {
      clearTimeout(initialTimer)
      clearInterval(intervalTimer)
      autoUpdater.off('checking-for-update', onChecking)
      autoUpdater.off('update-available', onAvailable)
      autoUpdater.off('update-not-available', onNotAvailable)
      autoUpdater.off('download-progress', onProgress)
      autoUpdater.off('update-downloaded', onDownloaded)
      autoUpdater.off('error', onError)
    }
  }
}
