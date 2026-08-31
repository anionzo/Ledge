/**
 * Agents.
 *
 * Which providers the Gauge reads, and the custom ones the user adds.
 *
 * A custom provider gets its number one of three ways — a shell command whose
 * stdout parses as JSON, an HTTP GET read by dot-path, or numbers typed by
 * hand — and reports it in one of two shapes: a used-percentage (a ring) or a
 * prepaid balance (a balance bar). The editor shows only the fields the chosen
 * source and shape actually use, so the user is never guessing which one the
 * Gauge will believe.
 */
import { useState } from 'react'
import type {
  CustomProviderConfig,
  CustomProviderMode,
  CustomProviderShape
} from '../../../shared/types/settings'
import type { SettingsTabProps } from '../context'
import { BUILTIN_PROVIDERS } from '../context'
import { invoke } from '../../lib/bridge'
import { Button, Chip, Icon } from '../../ui'
import {
  Field,
  Section,
  Segmented,
  Select,
  Slider,
  Switch,
  TextField,
  useFieldId
} from '../components/Controls'
import { t } from '../../i18n'
import '../styles/agents-tab.css'

export function AgentsTab({ settings, update }: SettingsTabProps) {
  const { enabledProviders, customProviders } = settings.gauge

  const addProvider = () => {
    // A slug from the clock rather than a counter: two providers added and one
    // removed must not be able to collide on `custom_2`.
    const id = `custom_${Date.now().toString(36)}`
    const fresh: CustomProviderConfig = {
      id,
      name: t('settings.agents.new_name'),
      mode: 'manual',
      shape: 'percent',
      command: '',
      url: '',
      token: '',
      jsonPath: '',
      manualSessionPercent: null,
      manualWeeklyPercent: null,
      manualBalance: null,
      currency: 'USD'
    }
    void update({ gauge: { customProviders: [...customProviders, fresh] } })
  }

  const patchProvider = (id: string, patch: Partial<CustomProviderConfig>) => {
    void update({
      gauge: {
        customProviders: customProviders.map((provider) =>
          provider.id === id ? { ...provider, ...patch } : provider
        )
      }
    })
  }

  /**
   * Removing a provider drops it from the list and clears its enabled flag in
   * the same write.
   *
   * `settings:update` takes a `DeepPartial`, which merges rather than replaces,
   * so the key cannot be deleted from here — but leaving it `true` would strand
   * an "enabled" entry for a provider that no longer exists (the orphan bug).
   * Setting it `false` alongside the removal is the consistent state main can
   * persist, so no orphan is ever left switched on.
   */
  const removeProvider = (id: string) => {
    void update({
      gauge: {
        customProviders: customProviders.filter((provider) => provider.id !== id),
        enabledProviders: { [id]: false }
      }
    })
  }

  return (
    <>
      <Section title={t('settings.agents.builtin')}>
        {BUILTIN_PROVIDERS.map((provider) => (
          <ProviderToggle
            key={provider.id}
            name={provider.name}
            checked={enabledProviders[provider.id] !== false}
            onChange={(on) =>
              void update({ gauge: { enabledProviders: { [provider.id]: on } } })
            }
          />
        ))}
      </Section>

      <Section title={t('settings.agents.custom')}>
        {customProviders.length === 0 && (
          <p className="bz-agents-empty">{t('settings.agents.empty')}</p>
        )}

        {customProviders.map((provider) => (
          <CustomProvider
            key={provider.id}
            provider={provider}
            enabled={enabledProviders[provider.id] !== false}
            onToggle={(on) =>
              void update({ gauge: { enabledProviders: { [provider.id]: on } } })
            }
            onPatch={(patch) => patchProvider(provider.id, patch)}
            onRemove={() => removeProvider(provider.id)}
          />
        ))}

        <div className="bz-agents-add">
          <Button icon="plus" onClick={addProvider}>
            {t('settings.agents.add')}
          </Button>
        </div>
      </Section>
    </>
  )
}

function ProviderToggle({
  name,
  checked,
  onChange
}: {
  name: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  const id = useFieldId('provider')
  return (
    <Field
      label={name}
      htmlFor={id}
      control={<Switch id={id} checked={checked} label={name} onChange={onChange} />}
    />
  )
}

function CustomProvider({
  provider,
  enabled,
  onToggle,
  onPatch,
  onRemove
}: {
  provider: CustomProviderConfig
  enabled: boolean
  onToggle: (next: boolean) => void
  onPatch: (patch: Partial<CustomProviderConfig>) => void
  onRemove: () => void
}) {
  const nameId = useFieldId('cp-name')
  const commandId = useFieldId('cp-cmd')
  const urlId = useFieldId('cp-url')
  const tokenId = useFieldId('cp-token')
  const pathId = useFieldId('cp-path')
  const enabledId = useFieldId('cp-on')
  const sessionId = useFieldId('cp-session')
  const weeklyId = useFieldId('cp-weekly')
  const amountId = useFieldId('cp-amount')
  const currencyId = useFieldId('cp-currency')

  const [probe, setProbe] = useState<{ ok: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const modeOptions: { value: CustomProviderMode; label: string }[] = [
    { value: 'command', label: t('settings.agents.mode.command') },
    { value: 'http', label: t('settings.agents.mode.http') },
    { value: 'manual', label: t('settings.agents.mode.manual') }
  ]

  const shapeOptions: { value: CustomProviderShape; label: string }[] = [
    { value: 'percent', label: t('settings.agents.shape.percent') },
    { value: 'balance', label: t('settings.agents.shape.balance') }
  ]

  const currencyOptions: { value: 'USD' | 'CNY'; label: string }[] = [
    { value: 'USD', label: 'USD' },
    { value: 'CNY', label: 'CNY' }
  ]

  const test = () => {
    setTesting(true)
    setProbe(null)
    invoke('gauge:probe-command', provider.command)
      .then(setProbe)
      .catch((cause: unknown) =>
        setProbe({ ok: false, message: cause instanceof Error ? cause.message : String(cause) })
      )
      .finally(() => setTesting(false))
  }

  return (
    <div className="bz-custom-provider">
      <div className="bz-custom-head">
        <Icon name="settings" size={13} />
        <span className="bz-custom-name">{provider.name}</span>
        <span className="bz-custom-spacer" />
        <Switch
          id={enabledId}
          checked={enabled}
          label={`${provider.name} — ${t('settings.panels.enabled')}`}
          onChange={onToggle}
        />
        <Button
          size="sm"
          icon="trash"
          variant="danger"
          label={t('settings.agents.remove')}
          onClick={onRemove}
        />
      </div>

      <Field
        label={t('settings.agents.name')}
        htmlFor={nameId}
        stacked
        control={
          <TextField
            id={nameId}
            value={provider.name}
            label={t('settings.agents.name')}
            onCommit={(name) => onPatch({ name })}
          />
        }
      />

      <Field
        label={t('settings.agents.mode')}
        control={
          <Segmented
            value={provider.mode}
            options={modeOptions}
            label={t('settings.agents.mode')}
            onChange={(mode) => {
              setProbe(null)
              onPatch({ mode })
            }}
          />
        }
      />

      {/* Shape decides ring vs balance bar, so it belongs to every source that
          reports a number — but manual balance is entered as an amount, not a
          command, so command mode keeps its shape implicit as a percentage. */}
      {provider.mode !== 'command' && (
        <Field
          label={t('settings.agents.shape')}
          control={
            <Segmented
              value={provider.shape}
              options={shapeOptions}
              label={t('settings.agents.shape')}
              onChange={(shape) => onPatch({ shape })}
            />
          }
        />
      )}

      {provider.mode === 'command' && (
        <>
          <Field
            label={t('settings.agents.command')}
            help={t('settings.agents.command.help')}
            htmlFor={commandId}
            stacked
            control={
              <div className="bz-custom-command">
                <TextField
                  id={commandId}
                  value={provider.command}
                  label={t('settings.agents.command')}
                  placeholder="my-cli usage --json"
                  mono
                  onCommit={(command) => {
                    setProbe(null)
                    onPatch({ command })
                  }}
                />
                <Button
                  size="sm"
                  onClick={test}
                  disabled={provider.command.trim() === '' || testing}
                >
                  {testing ? t('settings.agents.testing') : t('settings.agents.test')}
                </Button>
              </div>
            }
          />

          {probe && (
            <p className="bz-custom-probe" data-ok={probe.ok || undefined}>
              <Icon name={probe.ok ? 'check' : 'alert'} size={12} />
              <span>{probe.message}</span>
            </p>
          )}
        </>
      )}

      {provider.mode === 'http' && (
        <>
          <Field
            label={t('settings.agents.url')}
            help={t('settings.agents.url.help')}
            htmlFor={urlId}
            stacked
            control={
              <TextField
                id={urlId}
                value={provider.url}
                label={t('settings.agents.url')}
                placeholder="https://gateway.example/api/quota"
                mono
                onCommit={(url) => onPatch({ url })}
              />
            }
          />
          <Field
            label={t('settings.agents.token')}
            htmlFor={tokenId}
            stacked
            control={
              <TextField
                id={tokenId}
                value={provider.token}
                label={t('settings.agents.token')}
                placeholder="sk-…"
                mono
                password
                onCommit={(token) => onPatch({ token })}
              />
            }
          />
          <Field
            label={t('settings.agents.json_path')}
            help={t('settings.agents.json_path.help')}
            htmlFor={pathId}
            stacked
            control={
              <TextField
                id={pathId}
                value={provider.jsonPath}
                label={t('settings.agents.json_path')}
                placeholder="data.quota"
                mono
                onCommit={(jsonPath) => onPatch({ jsonPath })}
              />
            }
          />
          <p className="bz-custom-hint">
            <Chip icon="info" quiet>
              {t('settings.agents.http.help')}
            </Chip>
          </p>
        </>
      )}

      {provider.mode === 'manual' && provider.shape === 'percent' && (
        <>
          <Field
            label={t('settings.agents.manual_session')}
            htmlFor={sessionId}
            control={
              <Slider
                id={sessionId}
                value={provider.manualSessionPercent ?? 0}
                min={0}
                max={100}
                label={t('settings.agents.manual_session')}
                format={(n) => t('settings.panels.percent', { n })}
                onCommit={(manualSessionPercent) => onPatch({ manualSessionPercent })}
              />
            }
          />
          <Field
            label={t('settings.agents.manual_weekly')}
            htmlFor={weeklyId}
            control={
              <Slider
                id={weeklyId}
                value={provider.manualWeeklyPercent ?? 0}
                min={0}
                max={100}
                label={t('settings.agents.manual_weekly')}
                format={(n) => t('settings.panels.percent', { n })}
                onCommit={(manualWeeklyPercent) => onPatch({ manualWeeklyPercent })}
              />
            }
          />
        </>
      )}

      {provider.mode === 'manual' && provider.shape === 'balance' && (
        <>
          <Field
            label={t('settings.agents.amount')}
            help={t('settings.agents.manual.help')}
            htmlFor={amountId}
            stacked
            control={
              <TextField
                id={amountId}
                value={provider.manualBalance ?? ''}
                label={t('settings.agents.amount')}
                placeholder="110.00"
                mono
                onCommit={(next) => onPatch({ manualBalance: next.trim() === '' ? null : next })}
              />
            }
          />
          <Field
            label={t('settings.agents.currency')}
            htmlFor={currencyId}
            control={
              <Select
                id={currencyId}
                value={provider.currency}
                options={currencyOptions}
                label={t('settings.agents.currency')}
                onChange={(currency) => onPatch({ currency })}
              />
            }
          />
        </>
      )}
    </div>
  )
}
