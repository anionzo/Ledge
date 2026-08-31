/**
 * What every tab needs.
 *
 * Passed as props rather than through React context: there are five consumers,
 * all of them children of one component, and a context would only add a layer
 * between the settings and the controls that write them.
 */
import type { DeepPartial } from '../../shared/ipc'
import type { PlatformCapabilities } from '../../shared/types/platform'
import type { Settings } from '../../shared/types/settings'

export interface SettingsTabProps {
  settings: Settings
  /**
   * What this operating system can actually honour.
   *
   * Tabs use it to *hide* controls, never to disable them. A greyed-out switch
   * invites the user to work out why it is greyed out; an absent one lets them
   * get on with the settings that do something.
   */
  capabilities: PlatformCapabilities
  version: string
  update: (patch: DeepPartial<Settings>) => Promise<void>
}

/**
 * Built-in providers, in the order they appear in the Agents tab.
 *
 * The names are proper nouns and are deliberately not run through `t()` — a
 * product name is the same in every locale, and translating it would make the
 * setting harder to match against the CLI the user actually installed.
 */
export const BUILTIN_PROVIDERS: { id: string; name: string }[] = [
  { id: 'claude', name: 'Claude Code' },
  { id: 'codex', name: 'Codex' },
  { id: 'gemini', name: 'Gemini CLI' },
  { id: 'cursor', name: 'Cursor' },
  { id: 'grok', name: 'Grok' },
  { id: 'opencode', name: 'OpenCode' },
  // Balance-shaped: reports prepaid credit left rather than a used-percentage.
  { id: 'deepseek', name: 'DeepSeek' }
]
