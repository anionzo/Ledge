/**
 * The platform seam.
 *
 * Everything the app needs that behaves differently on Windows, macOS and
 * Linux goes through this interface. `electron/platform/index.ts` picks one
 * implementation at startup; nothing else in the codebase reads
 * `process.platform`.
 *
 * Degradation contract: a capability that does not exist on the current OS
 * returns a falsy/empty result and reports `false` from its `supports` flag.
 * It never throws. A panel that loses fullscreen detection should still open;
 * it just stops auto-hiding.
 */
import type { BrowserWindow } from 'electron'
import type { PlatformCapabilities, PlatformId } from '../../shared/types/platform'

export type { PlatformCapabilities, PlatformId }

export interface SecretLookup {
  /** Keychain service / credential target name. */
  service: string
  /** Account name, when the store needs one. */
  account?: string
}

export type SecretResult =
  | { ok: true; value: string }
  | { ok: false; reason: 'not-found' | 'permission-denied' | 'unsupported' | 'error'; message?: string }

export interface CommandResult {
  ok: boolean
  stdout: string
  stderr: string
  code: number | null
}

export interface RunCommandOptions {
  timeoutMs?: number
  /** Absolute path to the executable. Relative names are rejected. */
  cwd?: string
  env?: Record<string, string>
}

export interface PlatformAdapter {
  readonly id: PlatformId
  readonly capabilities: PlatformCapabilities

  /**
   * Stop the window taking focus away from whatever the user is typing in.
   * On Windows this sets `WS_EX_NOACTIVATE` through koffi; on macOS it uses
   * `setFocusable(false)`; on Linux it is a no-op because the behaviour is up
   * to the window manager.
   */
  applyNoActivate(win: BrowserWindow, enabled: boolean): void

  /**
   * Pin above other windows, including fullscreen ones where the OS allows.
   */
  applyAlwaysOnTop(win: BrowserWindow, enabled: boolean): void

  /** Hide from the taskbar / Dock / window list. */
  applyHiddenFromSwitcher(win: BrowserWindow): void

  /**
   * True when a fullscreen app or game currently owns the foreground, which
   * means both panels should stay out of the way. Returns false — never
   * throws — when detection is unavailable.
   */
  isFullscreenAppActive(): boolean

  /** Read launch-at-login state as the OS currently has it. */
  getAutostart(): Promise<boolean>
  setAutostart(enabled: boolean): Promise<void>

  /**
   * Read a secret from the OS credential store. Used by the Claude provider on
   * macOS, where Claude Code keeps its OAuth credentials in the Keychain
   * rather than in `~/.claude/.credentials.json`.
   */
  readSecret(lookup: SecretLookup): Promise<SecretResult>

  /**
   * Run a user-configured command and capture stdout. The implementation is
   * responsible for validating the executable path before spawning — see
   * `pathValidation` in each platform folder.
   */
  runCommand(command: string, options?: RunCommandOptions): Promise<CommandResult>

  /** Resolve `name` on PATH, or null. */
  which(name: string): Promise<string | null>

  /** Per-OS locations the quota providers need to look in. */
  paths: PlatformPaths
}

export interface PlatformPaths {
  /** Where this app keeps its own data. */
  appData(): string
  /** `~/.claude`, honouring CLAUDE_CONFIG_DIR when set. */
  claudeHome(): string
  /** `~/.codex`. */
  codexHome(): string
  /** Cursor IDE's `globalStorage` directory, which holds `state.vscdb`. */
  cursorGlobalStorage(): string
  /** OpenCode's auth file. */
  openCodeAuth(): string
  /** Grok CLI home. */
  grokHome(): string
}
