/**
 * Appearance.
 *
 * Theme, language, motion — and a live preview, because the preview is the one
 * honest way to explain the product's central rule: the chrome is achromatic
 * and the rings are the only thing allowed to be coloured. Three rings in a
 * row make that visible in a way a paragraph does not.
 */
import type { ThemeMode } from '../../../shared/types/settings'
import type { SettingsTabProps } from '../context'
import { Field, Section, Segmented, Select, Switch, useFieldId } from '../components/Controls'
import { Ring } from '../../ui'
import { availableLocales, t } from '../../i18n'
import '../styles/appearance-tab.css'

export function AppearanceTab({ settings, update }: SettingsTabProps) {
  const languageId = useFieldId('language')
  const motionId = useFieldId('motion')

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: t('settings.appearance.theme.system') },
    { value: 'light', label: t('settings.appearance.theme.light') },
    { value: 'dark', label: t('settings.appearance.theme.dark') }
  ]

  /**
   * Only the locales actually registered are offered.
   *
   * The dictionary shape is ready for thirty more, but a picker listing
   * languages that fall straight back to English is worse than a short list.
   */
  const languageOptions = [
    { value: 'system', label: t('settings.appearance.language.system') },
    ...availableLocales().map((code) => ({ value: code, label: languageName(code) }))
  ]

  return (
    <>
      <Section title={t('settings.appearance.theme')}>
        <Field
          label={t('settings.appearance.theme')}
          control={
            <Segmented
              value={settings.theme}
              options={themeOptions}
              label={t('settings.appearance.theme')}
              onChange={(theme) => void update({ theme })}
            />
          }
        />
        <Field
          label={t('settings.appearance.language')}
          htmlFor={languageId}
          control={
            <Select
              id={languageId}
              value={settings.language}
              options={languageOptions}
              label={t('settings.appearance.language')}
              onChange={(language) => void update({ language })}
            />
          }
        />
      </Section>

      <Section title={t('settings.appearance.motion')}>
        <Field
          label={t('settings.appearance.reduce_motion')}
          help={t('settings.appearance.reduce_motion.help')}
          htmlFor={motionId}
          control={
            <Switch
              id={motionId}
              checked={settings.reduceMotion}
              label={t('settings.appearance.reduce_motion')}
              onChange={(reduceMotion) => void update({ reduceMotion })}
            />
          }
        />
      </Section>

      <Section
        title={t('settings.appearance.preview')}
        description={t('settings.appearance.preview.help')}
      >
        <div className="bz-preview-rings">
          {/*
            One ring per severity band, at the size the Gauge's detail sheet
            uses. They re-render under the theme the user just picked, so the
            preview is the real component rather than a picture of it.
          */}
          <PreviewRing percent={24} severity="ok" />
          <PreviewRing percent={68} severity="warn" />
          <PreviewRing percent={94} severity="critical" />
          <PreviewRing percent={null} severity="ok" />
        </div>
      </Section>
    </>
  )
}

function PreviewRing({
  percent,
  severity
}: {
  percent: number | null
  severity: 'ok' | 'warn' | 'critical'
}) {
  const label =
    percent === null
      ? t('gauge.ring.unknown')
      : t('gauge.ring.aria', { name: t('settings.appearance.preview'), percent })
  return (
    <div className="bz-preview-ring">
      <Ring percent={percent} severity={severity} size={56} label={label} />
      <span className="bz-preview-ring-label">
        {percent === null ? t('gauge.ring.unknown') : severityLabel(severity)}
      </span>
    </div>
  )
}

/** The three severity bands, named rather than shown as bare enum values. */
function severityLabel(severity: 'ok' | 'warn' | 'critical'): string {
  return t(`settings.appearance.band.${severity}`)
}

/**
 * Endonyms where the platform can give them.
 *
 * A language list is one of the few places a user reads a name in a language
 * they may not otherwise have selected, so "Français" beats "French".
 */
function languageName(code: string): string {
  try {
    const display = new Intl.DisplayNames([code], { type: 'language' })
    return display.of(code) ?? code
  } catch {
    return code
  }
}
