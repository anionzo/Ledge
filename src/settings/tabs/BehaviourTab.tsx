/**
 * Behaviour — the settings that are about the app rather than about a panel.
 *
 * Three of the four sections are capability-gated. Where the OS cannot honour
 * a setting the whole field is absent, not disabled: on Linux there is no
 * launch-at-login to write and no fullscreen state to detect, and offering
 * switches for them would be the app lying about what it can do.
 */
import type { SettingsTabProps } from '../context'
import {
  AUTO_DELETE_HOURS,
  DEFAULT_SETTINGS,
  type AutoDeleteHours
} from '../../../shared/types/settings'
import { useState } from 'react'
import { Field, HotkeyField, Section, Select, Switch, useFieldId } from '../components/Controls'
import { invoke, useInvoke } from '../../lib/bridge'
import { Button } from '../../ui'
import { t } from '../../i18n'

/**
 * The auto-delete ages, as the `<select>` wants them: strings, because that is
 * what an option value is, converted back on the way out. `0` is "never" and
 * `168` reads as "7 days" rather than "168 hours" — nobody counts a week in
 * hours.
 */
function autoDeleteLabel(hours: AutoDeleteHours): string {
  if (hours === 0) return t('settings.behaviour.auto_delete.never')
  if (hours === 168) return t('settings.behaviour.auto_delete.week')
  return t('settings.behaviour.auto_delete.hours', { n: hours })
}

export function BehaviourTab({ settings, capabilities, update }: SettingsTabProps) {
  const launchId = useFieldId('launch')
  const fullscreenId = useFieldId('fullscreen')
  const shelfKeyId = useFieldId('hk-shelf')
  const gaugeKeyId = useFieldId('hk-gauge')
  const encryptId = useFieldId('encrypt')
  const soundsId = useFieldId('sounds')
  const incognitoId = useFieldId('incognito')
  const hoverId = useFieldId('hover')
  const previewId = useFieldId('preview')
  const autoDeleteId = useFieldId('auto-delete')
  const clearRestartId = useFieldId('clear-restart')
  const autoUpdatesId = useFieldId('auto-updates')

  // Both sections can end up empty on a locked-down system; rendering a
  // heading over nothing is worse than rendering nothing.
  const showStartup = capabilities.autostart
  const showPresence = capabilities.fullscreenDetection

  // Same posture as the encryption switch below: a Store/MSIX build has its
  // updates managed for it, and a dev build has nothing to update from. In
  // both cases the toggle would be a switch wired to nothing, so the whole
  // section is absent and the banner in the settings chrome says why.
  const updater = useInvoke('updater:status')
  const showUpdates = updater.data?.supported === true

  // The banner in the settings chrome reports an update that announced itself.
  // This is the other direction: someone who wants to ask *now* rather than
  // wait out the background poll. It only ever reports the boring answer —
  // a found update is the banner's story, and saying it twice in two places
  // at once would be worse than saying it once.
  const [checkState, setCheckState] = useState<'idle' | 'checking' | 'current'>('idle')
  const runUpdateCheck = (): void => {
    setCheckState('checking')
    void invoke('updater:check')
      .then((next) => {
        setCheckState(next.availableVersion ?? next.downloadedVersion ? 'idle' : 'current')
      })
      .catch(() => {
        // The failure reason is already on the status object the banner
        // renders, so this row just stops claiming to be busy.
        setCheckState('idle')
      })
  }

  return (
    <>
      {showStartup && (
        <Section title={t('settings.behaviour.startup')}>
          <Field
            label={t('settings.behaviour.launch_at_login')}
            help={t('settings.behaviour.launch_at_login.help')}
            htmlFor={launchId}
            control={
              <Switch
                id={launchId}
                checked={settings.launchAtLogin}
                label={t('settings.behaviour.launch_at_login')}
                onChange={(launchAtLogin) => void update({ launchAtLogin })}
              />
            }
          />
        </Section>
      )}

      {showPresence && (
        <Section title={t('settings.behaviour.presence')}>
          <Field
            label={t('settings.behaviour.suppress_fullscreen')}
            help={t('settings.behaviour.suppress_fullscreen.help')}
            htmlFor={fullscreenId}
            control={
              <Switch
                id={fullscreenId}
                checked={settings.suppressOnFullscreen}
                label={t('settings.behaviour.suppress_fullscreen')}
                onChange={(suppressOnFullscreen) => void update({ suppressOnFullscreen })}
              />
            }
          />
        </Section>
      )}

      <Section
        title={t('settings.behaviour.hotkeys')}
        description={t('settings.behaviour.hotkey.help')}
      >
        <Field
          label={t('settings.behaviour.hotkey_shelf')}
          htmlFor={shelfKeyId}
          control={
            <HotkeyField
              id={shelfKeyId}
              value={settings.hotkeyToggleShelf}
              defaultValue={DEFAULT_SETTINGS.hotkeyToggleShelf}
              label={t('settings.behaviour.hotkey_shelf')}
              onCommit={(hotkeyToggleShelf) => void update({ hotkeyToggleShelf })}
            />
          }
        />
        <Field
          label={t('settings.behaviour.hotkey_gauge')}
          htmlFor={gaugeKeyId}
          control={
            <HotkeyField
              id={gaugeKeyId}
              value={settings.hotkeyToggleGauge}
              defaultValue={DEFAULT_SETTINGS.hotkeyToggleGauge}
              label={t('settings.behaviour.hotkey_gauge')}
              onCommit={(hotkeyToggleGauge) => void update({ hotkeyToggleGauge })}
            />
          }
        />
      </Section>

      <Section title={t('settings.behaviour.shelf')}>
        <Field
          label={t('settings.behaviour.hover_activation')}
          help={t('settings.behaviour.hover_activation.help')}
          htmlFor={hoverId}
          control={
            <Switch
              id={hoverId}
              checked={settings.shelf.hoverActivation}
              label={t('settings.behaviour.hover_activation')}
              onChange={(hoverActivation) => void update({ shelf: { hoverActivation } })}
            />
          }
        />
        <Field
          label={t('settings.behaviour.preview_enabled')}
          help={t('settings.behaviour.preview_enabled.help')}
          htmlFor={previewId}
          control={
            <Switch
              id={previewId}
              checked={settings.shelf.previewEnabled}
              label={t('settings.behaviour.preview_enabled')}
              onChange={(previewEnabled) => void update({ shelf: { previewEnabled } })}
            />
          }
        />
        <Field
          label={t('settings.behaviour.incognito')}
          help={t('settings.behaviour.incognito.help')}
          htmlFor={incognitoId}
          control={
            <Switch
              id={incognitoId}
              checked={settings.shelf.incognito}
              label={t('settings.behaviour.incognito')}
              onChange={(incognito) => void update({ shelf: { incognito } })}
            />
          }
        />
      </Section>

      <Section title={t('settings.behaviour.privacy')}>
        {/* Encryption is only offered where `safeStorage` reports a real
            OS-backed key store. Where it does not, the switch would promise
            protection the platform cannot give. */}
        {capabilities.encryptedStorage && (
          <Field
            label={t('settings.behaviour.encrypt_history')}
            help={t('settings.behaviour.encrypt_history.help')}
            htmlFor={encryptId}
            control={
              <Switch
                id={encryptId}
                checked={settings.shelf.encryptHistory}
                label={t('settings.behaviour.encrypt_history')}
                onChange={(encryptHistory) => void update({ shelf: { encryptHistory } })}
              />
            }
          />
        )}
        <Field
          label={t('settings.behaviour.auto_delete')}
          help={t('settings.behaviour.auto_delete.help')}
          htmlFor={autoDeleteId}
          control={
            <Select
              id={autoDeleteId}
              value={String(settings.shelf.autoDeleteHours)}
              label={t('settings.behaviour.auto_delete')}
              options={AUTO_DELETE_HOURS.map((hours) => ({
                value: String(hours),
                label: autoDeleteLabel(hours)
              }))}
              onChange={(next) => {
                // The option values come straight from AUTO_DELETE_HOURS, so
                // the parse cannot produce anything outside the union — and
                // the store re-checks it anyway before it is persisted.
                void update({ shelf: { autoDeleteHours: Number(next) as AutoDeleteHours } })
              }}
            />
          }
        />
        <Field
          label={t('settings.behaviour.clear_unpinned_restart')}
          help={t('settings.behaviour.clear_unpinned_restart.help')}
          htmlFor={clearRestartId}
          control={
            <Switch
              id={clearRestartId}
              checked={settings.shelf.clearUnpinnedOnRestart}
              label={t('settings.behaviour.clear_unpinned_restart')}
              onChange={(clearUnpinnedOnRestart) =>
                void update({ shelf: { clearUnpinnedOnRestart } })
              }
            />
          }
        />
        <Field
          label={t('settings.behaviour.sounds')}
          htmlFor={soundsId}
          control={
            <Switch
              id={soundsId}
              checked={settings.shelf.playSounds}
              label={t('settings.behaviour.sounds')}
              onChange={(playSounds) => void update({ shelf: { playSounds } })}
            />
          }
        />
      </Section>

      {showUpdates && (
        <Section title={t('settings.behaviour.updates')}>
          <Field
            label={t('settings.behaviour.auto_updates')}
            help={t('settings.behaviour.auto_updates.help')}
            htmlFor={autoUpdatesId}
            control={
              <Switch
                id={autoUpdatesId}
                checked={settings.autoUpdates}
                label={t('settings.behaviour.auto_updates')}
                onChange={(autoUpdates) => void update({ autoUpdates })}
              />
            }
          />
          <Field
            label={t('settings.update.check')}
            help={checkState === 'current' ? t('settings.update.current') : undefined}
            control={
              <Button
                size="sm"
                disabled={checkState === 'checking'}
                onClick={runUpdateCheck}
              >
                {checkState === 'checking'
                  ? t('settings.update.checking')
                  : t('settings.update.check')}
              </Button>
            }
          />
        </Section>
      )}
    </>
  )
}
