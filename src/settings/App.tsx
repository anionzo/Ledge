/**
 * The settings window.
 *
 * One window, five tabs. Edge-Drop and agent-notch each had their own
 * preferences; the merge is only real if the user never has to know which of
 * the two a setting used to belong to. So the tabs are cut by *what the
 * setting is about* — behaviour, panels, agents, appearance — not by which
 * panel it configures, and Panels deliberately puts both side by side.
 *
 * This window is opaque and ordinary. It is not a floating instrument, so it
 * uses `--bz-ground` rather than glass, and it is the one surface in the
 * product where prose is allowed to be a paragraph.
 */
import { useState, type ReactElement } from 'react'
import { useLocale, useSettings, useThemeAttributes } from '../lib/bridge'
import { useToastQueue } from '../lib/toasts'
import { t } from '../i18n'
import { Icon, ToastStack, type IconName } from '../ui'
import type { SettingsTabProps } from './context'
import { AboutTab } from './tabs/AboutTab'
import { AgentsTab } from './tabs/AgentsTab'
import { AppearanceTab } from './tabs/AppearanceTab'
import { BehaviourTab } from './tabs/BehaviourTab'
import { PanelsTab } from './tabs/PanelsTab'
import { UpdateBanner } from './components/UpdateBanner'
import './styles/settings.css'

type TabId = 'behaviour' | 'panels' | 'agents' | 'appearance' | 'about'

/** The rail, in order. Icons are the achromatic set — no per-tab colour. */
const TABS: { id: TabId; icon: IconName }[] = [
  { id: 'behaviour', icon: 'settings' },
  { id: 'panels', icon: 'stack' },
  { id: 'agents', icon: 'refresh' },
  { id: 'appearance', icon: 'image' },
  { id: 'about', icon: 'info' }
]

/**
 * Keyed by id rather than carried on the tab objects, so the pane lookup is a
 * record access that cannot come back undefined and needs no fallback.
 */
const PANES: Record<TabId, (props: SettingsTabProps) => ReactElement> = {
  behaviour: (props) => <BehaviourTab {...props} />,
  panels: (props) => <PanelsTab {...props} />,
  agents: (props) => <AgentsTab {...props} />,
  appearance: (props) => <AppearanceTab {...props} />,
  about: (props) => <AboutTab {...props} />
}

export function App() {
  const { settings, capabilities, version, update, saving, error } = useSettings()
  useThemeAttributes(settings)
  useLocale(settings)

  const [active, setActive] = useState<TabId>('behaviour')
  const toasts = useToastQueue()

  // Nothing is rendered from defaults. A settings window that paints the
  // built-in values and then snaps to the user's real ones a frame later has
  // shown them a lie, however briefly.
  if (!settings || !capabilities || version === undefined) {
    return (
      <div className="bz-settings" data-loading>
        <p className="bz-settings-loading">{error ? t('settings.save_failed') : ''}</p>
      </div>
    )
  }

  const tabProps: SettingsTabProps = { settings, capabilities, version, update }

  return (
    <div className="bz-settings">
      <nav className="bz-settings-rail" aria-label={t('settings.tabs')}>
        <div className="bz-settings-brand">
          <span className="bz-settings-brand-name">{t('app.name')}</span>
          <span className="bz-settings-brand-version bz-num">{version}</span>
        </div>

        {/*
          A tablist rather than a list of links: five panes in one window, one
          visible at a time. Arrow keys move between tabs and the roving
          tabindex keeps the whole rail a single tab stop, so reaching the
          content does not mean pressing Tab five times.
        */}
        <div
          className="bz-settings-tabs"
          role="tablist"
          aria-orientation="vertical"
          onKeyDown={(event) => {
            const index = TABS.findIndex((tab) => tab.id === active)
            const delta = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
            if (delta === 0) return
            event.preventDefault()
            const next = TABS[(index + delta + TABS.length) % TABS.length]
            if (next) setActive(next.id)
          }}
        >
          {TABS.map((tab) => {
            const selected = tab.id === active
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`bz-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`bz-pane-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                className="bz-settings-tab"
                onClick={() => setActive(tab.id)}
              >
                <Icon name={tab.icon} size={13} />
                <span>{t(`settings.tab.${tab.id}`)}</span>
              </button>
            )
          })}
        </div>

        {/* A save indicator, not a save button. Every control writes on change;
            this is the receipt. */}
        <div className="bz-settings-status" aria-live="polite">
          {saving ? t('settings.saving') : error ? t('settings.save_failed') : ''}
        </div>
      </nav>

      <main
        className="bz-settings-pane"
        role="tabpanel"
        id={`bz-pane-${active}`}
        aria-labelledby={`bz-tab-${active}`}
        tabIndex={0}
      >
        {/* Mounted once, outside the per-tab switch, so it survives a tab
            change instead of flashing out and back in — an update banner
            every tab sees, not one Behaviour or About happens to own. */}
        <UpdateBanner />
        <h1 className="bz-settings-heading">{t(`settings.tab.${active}`)}</h1>
        {PANES[active](tabProps)}
      </main>

      <ToastStack
        toasts={toasts.toasts}
        onDismiss={toasts.dismiss}
        dismissLabel={t('common.dismiss')}
        side="right"
      />
    </div>
  )
}
