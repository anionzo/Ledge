/**
 * Behaviour — the settings that are about the app rather than about a panel.
 *
 * Three of the four sections are capability-gated. Where the OS cannot honour
 * a setting the whole field is absent, not disabled: on Linux there is no
 * launch-at-login to write and no fullscreen state to detect, and offering
 * switches for them would be the app lying about what it can do.
 */
import type { SettingsTabProps } from '../context'
import { DEFAULT_SETTINGS } from '../../../shared/types/settings'
import { Field, HotkeyField, Section, Switch, useFieldId } from '../components/Controls'
import { t } from '../../i18n'

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

  // Both sections can end up empty on a locked-down system; rendering a
  // heading over nothing is worse than rendering nothing.
  const showStartup = capabilities.autostart
  const showPresence = capabilities.fullscreenDetection

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
    </>
  )
}
