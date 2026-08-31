/**
 * Update banner.
 *
 * Mounted once in the settings chrome (`src/settings/App.tsx`), above the
 * per-tab heading, so an update is visible no matter which of the five tabs
 * happens to be open when it lands — the moment someone is most likely to be
 * looking is not necessarily the moment they are on Behaviour or About.
 *
 * It renders nothing at all — not even an empty strip that reserves space —
 * only when supported and idle: no update, nothing downloading, no error.
 * An always-visible "you are up to date" banner is the kind of ambient noise
 * this product avoids everywhere else, so that quiet state is silence, not a
 * dimmed checkmark.
 *
 * Unsupported (Store/MSIX build, or an unpackaged dev run) is NOT part of
 * that silent state: `BehaviourTab` hides its whole Updates section in both
 * cases rather than show a switch wired to nothing, and its own comment
 * points here for the explanation — so this banner is the one place that
 * tells the user why there is no update control to find.
 */
import { useState } from 'react'
import { invoke, useInvoke, usePush } from '../../lib/bridge'
import { t } from '../../i18n'
import { Button, Icon, type IconName } from '../../ui'
import type { UpdaterStatus } from '../../../shared/ipc'
import '../styles/update-banner.css'

export function UpdateBanner() {
  // The initial read: whatever main already knows at mount time, e.g. an
  // update that finished downloading in the background before Settings was
  // even opened.
  const { data: initial } = useInvoke('updater:status')

  // Every status change after mount arrives on the push instead of another
  // invoke — `initial` only ever resolves once. `live` starts undefined and,
  // once a push lands, permanently takes over from `initial`: the push is
  // always at least as current as the invoke snapshot it followed.
  const [live, setLive] = useState<UpdaterStatus | undefined>(undefined)
  usePush('updater:status', setLive)

  const status = live ?? initial

  // Disables the restart button the instant it is pressed. `quitAndInstall`
  // does not return — Ledge is gone a moment later — so this only guards
  // against a frantic double-click in that window, not a real async state.
  const [restarting, setRestarting] = useState(false)

  if (!status) return null

  const { supported, storeBuild, checking, downloading, availableVersion, downloadedVersion, error } =
    status

  let icon: IconName
  let message: string
  let tone: 'ready' | 'error' | undefined

  if (!supported) {
    // Store builds have their updates managed for them; a dev run has no
    // installed artifact to replace. Either way, no network call was ever
    // made — see `electron/main/updater.ts` — so there is nothing to check
    // or download, just a reason.
    icon = 'info'
    message = t(storeBuild ? 'settings.update.store' : 'settings.update.dev')
  } else if (downloadedVersion) {
    icon = 'check'
    tone = 'ready'
    message = t('settings.update.ready', { version: downloadedVersion })
  } else if (downloading) {
    icon = 'refresh'
    message = t('settings.update.downloading')
  } else if (checking) {
    icon = 'refresh'
    message = t('settings.update.checking')
  } else if (availableVersion) {
    icon = 'info'
    message = t('settings.update.available', { version: availableVersion })
  } else if (error) {
    icon = 'alert'
    tone = 'error'
    message = t('settings.update.failed', { reason: error })
  } else {
    // Supported, idle, no update, no error — the quiet state.
    return null
  }

  return (
    <div className="bz-update-banner" data-tone={tone} role="status" aria-live="polite">
      <Icon
        name={icon}
        size={13}
        className={checking || downloading ? 'bz-update-banner-spin' : undefined}
      />
      <span className="bz-update-banner-message">{message}</span>
      {downloadedVersion && (
        <Button
          variant="primary"
          size="sm"
          disabled={restarting}
          onClick={() => {
            setRestarting(true)
            void invoke('updater:quit-and-install')
          }}
        >
          {t('settings.update.restart')}
        </Button>
      )}
    </div>
  )
}
