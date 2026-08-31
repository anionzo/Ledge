/**
 * About.
 *
 * Version, and a plain statement of what this machine can and cannot do.
 *
 * The capability list is the point of this tab. Every other tab hides controls
 * the OS cannot honour, which is right — but it leaves the user with no way to
 * find out *why* the switch they read about is not there. This is that
 * answer, in one place, stated without apology.
 */
import type { PlatformCapabilities } from '../../../shared/types/platform'
import type { SettingsTabProps } from '../context'
import { Section } from '../components/Controls'
import { Button, Icon } from '../../ui'
import { invoke } from '../../lib/bridge'
import { t } from '../../i18n'
import '../styles/about-tab.css'

/** Rendered in this order — the ones that change the most behaviour first. */
const CAPABILITY_KEYS: (keyof PlatformCapabilities)[] = [
  'clickThrough',
  'noActivate',
  'alwaysOnTopOverFullscreen',
  'fullscreenDetection',
  'autostart',
  'encryptedStorage'
]

export function AboutTab({ capabilities, version }: SettingsTabProps) {
  return (
    <>
      <Section title={t('settings.tab.about')}>
        <div className="bz-about-head">
          <p className="bz-about-name">{t('app.name')}</p>
          <p className="bz-about-tagline">{t('settings.about.tagline')}</p>
          <p className="bz-about-version bz-num">{t('settings.about.version', { version })}</p>
        </div>
      </Section>

      <Section title={t('settings.about.capabilities')}>
        <ul className="bz-capabilities">
          {CAPABILITY_KEYS.map((key) => {
            const supported = capabilities[key]
            return (
              <li key={key} className="bz-capability" data-supported={supported || undefined}>
                <Icon
                  name={supported ? 'check' : 'minus'}
                  size={12}
                  label={supported ? t('settings.about.cap.yes') : t('settings.about.cap.no')}
                />
                <span>{t(`settings.about.cap.${key}`)}</span>
              </li>
            )
          })}
        </ul>
      </Section>

      {/* Outside a Section: quitting is not a setting, and giving it a heading
          would file it as one. */}
      <div className="bz-about-actions">
        <Button icon="quit" variant="danger" onClick={() => void invoke('app:quit')}>
          {t('settings.about.quit')}
        </Button>
      </div>
    </>
  )
}
