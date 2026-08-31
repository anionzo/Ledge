/**
 * Which providers are active, given the user's Gauge settings.
 *
 * Replaces the original's `BUILTIN_READERS` array plus the inline custom-agent
 * mapping in `getAllInstalledAgentUsage`. Kept separate from `index.ts` so the
 * filtering is testable without running a refresh, and so nothing has to
 * construct a `ReadContext` just to ask what is enabled.
 */
import type { GaugeSettings, CustomProviderConfig } from '../../../shared/types/settings'
import type { QuotaProvider } from './provider'
import { claudeProvider } from './providers/claude'
import { codexProvider } from './providers/codex'
import { cursorProvider } from './providers/cursor'
import { deepseekProvider } from './providers/deepseek'
import { geminiProvider } from './providers/gemini'
import { grokProvider } from './providers/grok'
import { openCodeProvider } from './providers/opencode'
import { createCustomProvider } from './providers/custom'

export { createCustomProvider }

/**
 * Display order, carried over from the original `BUILTIN_READERS`.
 * The gauge renders in this order, so it is deliberate rather than incidental.
 */
export const BUILTIN_PROVIDERS: readonly QuotaProvider[] = Object.freeze([
  codexProvider,
  claudeProvider,
  geminiProvider,
  cursorProvider,
  openCodeProvider,
  grokProvider,
  // Balance-shaped, appended after the window-shaped built-ins. Toggled through
  // `enabledProviders` like any other; enabled by default for saved settings
  // that predate it, thanks to the `!== false` rule in isProviderEnabled.
  deepseekProvider
])

/**
 * A provider is on unless the user explicitly turned it off.
 *
 * `!== false` rather than `=== true`, matching the original: a provider added
 * in a later release is enabled by default for users whose saved settings
 * predate it, instead of silently never appearing.
 */
export function isProviderEnabled(
  enabled: Readonly<Record<string, boolean>> | undefined,
  id: string
): boolean {
  return enabled?.[id] !== false
}

/** Ignore half-written custom entries rather than surfacing a broken card. */
function isUsableCustom(config: CustomProviderConfig): boolean {
  return Boolean(config && typeof config.id === 'string' && config.id.trim())
}

/**
 * Build the active provider list. Disabled providers are filtered out *before*
 * any read runs — no credential is touched for a provider the user turned off.
 */
export function buildProviders(gauge: GaugeSettings): QuotaProvider[] {
  const custom = Array.isArray(gauge.customProviders) ? gauge.customProviders : []
  const customProviders = custom.filter(isUsableCustom).map(createCustomProvider)
  return [...BUILTIN_PROVIDERS, ...customProviders].filter((provider) =>
    isProviderEnabled(gauge.enabledProviders, provider.id)
  )
}
