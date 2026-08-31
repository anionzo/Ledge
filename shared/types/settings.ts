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
  /**
   * Drop unpinned items older than this many hours. `0` is never, which is the
   * default — a clipboard shelf that silently eats history is worse than one
   * that grows, and `maxItems` already bounds the size.
   */
  autoDeleteHours: AutoDeleteHours
  /** Wipe every unpinned item when Ledge starts. Opt-in. */
  clearUnpinnedOnRestart: boolean
}

/** Ages offered by the auto-delete timer. `0` disables it. */
export type AutoDeleteHours = 0 | 1 | 6 | 24 | 168

/** The auto-delete choices, in menu order. */
export const AUTO_DELETE_HOURS: readonly AutoDeleteHours[] = [0, 1, 6, 24, 168]

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

/** A rectangle in DIP screen coordinates. Structurally an Electron Rectangle. */
export interface ScreenRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Which physical monitor the hub sticks to, and enough evidence to find it
 * again after a reboot.
 *
 * Windows re-assigns the numeric display id freely across sessions — unplug a
 * dock, wake from sleep, and the id the user picked yesterday now belongs to a
 * different panel. So the id alone is a session-fast hint; the saved work area
 * and scale factor are what actually identify the monitor on the next launch.
 */
export interface StickDisplayPrefs {
  /** Last resolved Electron display id. Trustworthy only within a session. */
  displayId: number | null
  /** Work area of the resolved display, for the fuzzy match after a reboot. */
  savedWorkArea: ScreenRect | null
  /** DPI scale of the resolved display, to break ties between twin monitors. */
  savedScaleFactor: number | null
}

export interface Settings {
  version: number
  theme: ThemeMode
  language: string
  reduceMotion: boolean
  /**
   * Opacity of the panel's glass material, 0.5–1. Lower lets the desktop
   * show through the frosted ground; 1 is a solid, fully opaque panel. The one
   * knob users reach for when the translucent chrome reads as too faint over a
   * busy wallpaper.
   */
  panelOpacity: number
  launchAtLogin: boolean
  /** Suppress both panels while a fullscreen app or game is in the foreground. */
  suppressOnFullscreen: boolean
  hotkeyToggleShelf: string
  hotkeyToggleGauge: string
  /**
   * Check GitHub releases and install updates in the background. Ignored on
   * Store/MSIX builds, where the store owns updates and reaching out ourselves
   * would violate its policy.
   */
  autoUpdates: boolean
  /** Which monitor the hub docks to. */
  stickDisplay: StickDisplayPrefs
  shelf: ShelfSettings
  gauge: GaugeSettings
}

/**
 * Bumped to 2 for `autoUpdates`, `stickDisplay`, `shelf.autoDeleteHours` and
 * `shelf.clearUnpinnedOnRestart`. Old files merge the new defaults in; nothing
 * needs rewriting, so the migration is a version stamp rather than a transform.
 */
export const SETTINGS_VERSION = 2

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  theme: 'system',
  language: 'system',
  reduceMotion: false,
  panelOpacity: 0.92,
  launchAtLogin: false,
  suppressOnFullscreen: true,
  hotkeyToggleShelf: 'CommandOrControl+Shift+V',
  hotkeyToggleGauge: 'CommandOrControl+Shift+U',
  autoUpdates: true,
  stickDisplay: {
    displayId: null,
    savedWorkArea: null,
    savedScaleFactor: null
  },
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
    indicatorStyle: 'curve',
    autoDeleteHours: 0,
    clearUnpinnedOnRestart: false
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
