/**
 * User-facing settings — one unified store for both panels.
 *
 * Edge-Drop and agent-notch each shipped their own config file. Ledge keeps a
 * single object so the Settings window has one source of truth and one save
 * path. Panel-specific fields live under `shelf` and `gauge`.
 */

/** Which screen edge a panel is docked to. */
export type PanelSide = 'left' | 'right'

/**
 * How a panel gets out of the way when closed.
 *
 * - `clickthrough` keeps the window at full size, fully transparent, and lets
 *   the cursor pass through it (`setIgnoreMouseEvents`). Windows and macOS only.
 * - `resize` shrinks the window down to `gripPx` so there is nothing left to
 *   block clicks. The fallback for Linux, where `setIgnoreMouseEvents` is not
 *   supported.
 */
export type CollapseStrategy = 'clickthrough' | 'resize'

/** Vertical placement of the hover trigger strip along the edge. */
export type TriggerAlign = 'top' | 'center' | 'bottom'

export type ThemeMode = 'system' | 'light' | 'dark'

export interface ShelfSettings {
  enabled: boolean
  side: PanelSide
  /** Cursor must come within this many px of the edge to arm the opener. */
  edgeProximityPx: number
  /** Fraction of the display height the panel occupies, 0.5–0.8. */
  heightRatio: number
  triggerAlign: TriggerAlign
  /** Max items kept in history before the oldest unpinned entry is dropped. */
  maxItems: number
  /** Encrypt history at rest via safeStorage. */
  encryptHistory: boolean
  playSounds: boolean
  /** Pause capturing new clipboard items (incognito). History is untouched. */
  incognito: boolean
  /** Open the shelf on edge hover. When off, only the hotkey opens it. */
  hoverActivation: boolean
  /** Relative UI text size for the shelf. */
  textScale: TextScale
  /** Show the preview flyout when an item is focused/opened. */
  previewEnabled: boolean
  /** The "copied" feedback style shown at the edge when the OS clipboard changes. */
  indicatorStyle: IndicatorStyle
}

/** Relative UI text size. */
export type TextScale = 'sm' | 'md' | 'lg'

/** Copy-feedback flourish shown at the docked edge when a new item is captured. */
export type IndicatorStyle = 'off' | 'curve' | 'flare'

export interface GaugeSettings {
  enabled: boolean
  side: PanelSide
  /** Provider ids the user has switched on. */
  enabledProviders: Record<string, boolean>
  /** Ring turns critical at or above this used-percentage. */
  alertThreshold: number
  /** Poll interval for quota refresh, in ms. */
  refreshIntervalMs: number
  customProviders: CustomProviderConfig[]
}

/**
 * How a custom provider gets its number.
 *
 * - `command` — run a shell command, parse JSON from stdout.
 * - `http` — GET a URL with an optional Bearer token, read one value out of the
 *   JSON body by dot-path. Covers Sub2API and the whole new-api / one-api /
 *   one-hub family of relays without a bespoke reader for each.
 * - `manual` — the user typed the numbers in.
 */
export type CustomProviderMode = 'command' | 'http' | 'manual'

/** What the custom reader's value means, which decides ring vs. balance bar. */
export type CustomProviderShape = 'percent' | 'balance'

export interface CustomProviderConfig {
  /** Always `custom_<slug>`. */
  id: string
  name: string
  mode: CustomProviderMode
  shape: CustomProviderShape
  /** `command` mode: shell command whose stdout is parsed as JSON. */
  command: string
  /** `http` mode: request URL. Must be https. */
  url: string
  /** `http` mode: Bearer token. Stored via safeStorage, never in plain config. */
  token: string
  /** `http` mode: dot-path to the number in the JSON body, e.g. `data.quota`. */
  jsonPath: string
  /** `manual` mode / `percent` shape: entered percentages. */
  manualSessionPercent: number | null
  manualWeeklyPercent: number | null
  /** `manual` mode / `balance` shape: entered balance and currency. */
  manualBalance: string | null
  currency: 'USD' | 'CNY'
}

export interface Settings {
  version: number
  theme: ThemeMode
  language: string
  reduceMotion: boolean
  launchAtLogin: boolean
  /** Suppress both panels while a fullscreen app or game is in the foreground. */
  suppressOnFullscreen: boolean
  hotkeyToggleShelf: string
  hotkeyToggleGauge: string
  shelf: ShelfSettings
  gauge: GaugeSettings
}

export const SETTINGS_VERSION = 1

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  theme: 'system',
  language: 'system',
  reduceMotion: false,
  launchAtLogin: false,
  suppressOnFullscreen: true,
  hotkeyToggleShelf: 'CommandOrControl+Shift+V',
  hotkeyToggleGauge: 'CommandOrControl+Shift+U',
  shelf: {
    enabled: true,
    // The unified hub docks right by default — nearest the Windows tray and the
    // clock, where a status surface is expected to live.
    side: 'right',
    edgeProximityPx: 3,
    heightRatio: 0.72,
    triggerAlign: 'center',
    maxItems: 200,
    encryptHistory: true,
    playSounds: true,
    incognito: false,
    hoverActivation: true,
    textScale: 'md',
    previewEnabled: true,
    indicatorStyle: 'curve'
  },
  gauge: {
    enabled: true,
    side: 'right',
    enabledProviders: {
      claude: true,
      codex: true,
      gemini: true,
      cursor: true,
      grok: true,
      opencode: true,
      deepseek: true
    },
    alertThreshold: 80,
    refreshIntervalMs: 60_000,
    customProviders: []
  }
}
