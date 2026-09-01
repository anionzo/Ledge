/**
 * Ports the behavioural assertions from `agent-notch/tests/scrapers.test.js`
 * and adds the rule the original could only imply: a provider that cannot
 * read its quota returns a `QuotaReading` in a non-`ok` state. It never
 * throws, and it never invents a percentage.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { severityFor, STALE_TTL_MS } from '../shared/types/quota'
import type { QuotaReading } from '../shared/types/quota'
import type { CustomProviderConfig, GaugeSettings } from '../shared/types/settings'
import { DEFAULT_SETTINGS } from '../shared/types/settings'
import type { CommandResult, PlatformAdapter, SecretResult } from '../electron/platform/types'
import type { ReadContext } from '../electron/features/quota/provider'
import { BUILTIN_PROVIDERS, buildProviders } from '../electron/features/quota/registry'
import { createCustomProvider } from '../electron/features/quota/providers/custom'
import { claudeProvider, parseClaudeWindows } from '../electron/features/quota/providers/claude'
import { resetGeminiTokenCache } from '../electron/features/quota/providers/gemini'
import { readVscdbItems } from '../electron/features/quota/providers/cursor'
import { parseDeepseekBalance } from '../electron/features/quota/providers/deepseek'
import { httpsRequest } from '../electron/features/quota/http'
import {
  coercePercent,
  makeReading,
  makeWindow,
  redact,
  remainingToUsed,
  toIsoInstant
} from '../electron/features/quota/util'
import {
  configureQuota,
  getSnapshot,
  probeCommand,
  refresh,
  resetQuotaEngine
} from '../electron/features/quota'

/** A directory that is guaranteed not to exist. */
const NOWHERE = path.join(os.tmpdir(), 'ledge-quota-tests-nonexistent-dir')

interface FakeOptions {
  claudeHome?: string
  codexHome?: string
  cursorGlobalStorage?: string
  openCodeAuth?: string
  grokHome?: string
  readSecret?: (lookup: { service: string }) => Promise<SecretResult>
  runCommand?: (command: string) => Promise<CommandResult>
  which?: (name: string) => Promise<string | null>
}

function fakePlatform(options: FakeOptions = {}): PlatformAdapter {
  const base = {
    id: 'linux' as const,
    capabilities: {
      clickThrough: false,
      noActivate: false,
      fullscreenDetection: false,
      autostart: true,
      encryptedStorage: false,
      alwaysOnTopOverFullscreen: false
    },
    applyNoActivate: () => {},
    applyAlwaysOnTop: () => {},
    applyHiddenFromSwitcher: () => {},
    isFullscreenAppActive: () => false,
    getAutostart: async () => false,
    setAutostart: async () => {},
    readSecret:
      options.readSecret ?? (async () => ({ ok: false as const, reason: 'not-found' as const })),
    runCommand:
      options.runCommand ??
      (async () => ({ ok: false, stdout: '', stderr: 'not run', code: 1 }) as CommandResult),
    which: options.which ?? (async () => null),
    paths: {
      appData: () => NOWHERE,
      claudeHome: () => options.claudeHome ?? NOWHERE,
      codexHome: () => options.codexHome ?? NOWHERE,
      cursorGlobalStorage: () => options.cursorGlobalStorage ?? NOWHERE,
      openCodeAuth: () => options.openCodeAuth ?? path.join(NOWHERE, 'auth.json'),
      grokHome: () => options.grokHome ?? NOWHERE
    }
  }
  return base as unknown as PlatformAdapter
}

function ctx(platform: PlatformAdapter = fakePlatform(), now = 1000): ReadContext {
  return { platform, alertThreshold: 80, now }
}

function gauge(overrides: Partial<GaugeSettings> = {}): GaugeSettings {
  return { ...DEFAULT_SETTINGS.gauge, ...overrides }
}

function customConfig(overrides: Partial<CustomProviderConfig> = {}): CustomProviderConfig {
  const command = overrides.command ?? ''
  return {
    id: 'custom_demo',
    name: 'Demo',
    // Mirror the settings-store default so a bare config behaves like the
    // pre-mode inference: a command means `command`, otherwise `manual`.
    mode: command.trim() ? 'command' : 'manual',
    shape: 'percent',
    command,
    url: '',
    token: '',
    jsonPath: '',
    manualSessionPercent: null,
    manualWeeklyPercent: null,
    manualBalance: null,
    currency: 'USD',
    ...overrides
  }
}

afterEach(() => {
  resetQuotaEngine()
  resetGeminiTokenCache()
})

// The DeepSeek provider reads its key from the real environment / home, not
// through the injected platform. Pin both to a known-empty state for the whole
// file so the built-in-provider loops are deterministic regardless of the
// machine running the suite.
const savedDeepseekEnv = {
  key: process.env.DEEPSEEK_API_KEY,
  dir: process.env.DEEPSEEK_CONFIG_DIR
}
beforeAll(() => {
  delete process.env.DEEPSEEK_API_KEY
  process.env.DEEPSEEK_CONFIG_DIR = NOWHERE
})
afterAll(() => {
  if (savedDeepseekEnv.key === undefined) delete process.env.DEEPSEEK_API_KEY
  else process.env.DEEPSEEK_API_KEY = savedDeepseekEnv.key
  if (savedDeepseekEnv.dir === undefined) delete process.env.DEEPSEEK_CONFIG_DIR
  else process.env.DEEPSEEK_CONFIG_DIR = savedDeepseekEnv.dir
})

// ---------------------------------------------------------------------------
// Ported directly from scrapers.test.js
// ---------------------------------------------------------------------------

describe('severity bands', () => {
  it('the alert threshold controls warn and critical', () => {
    // The original's `quotaStatus` put the warning band at threshold-30; the
    // shared `severityFor` fixes warn at 50. The critical assertions are the
    // original's, unchanged.
    expect(severityFor(49, 80)).toBe('ok')
    expect(severityFor(50, 80)).toBe('warn')
    expect(severityFor(79, 80)).toBe('warn')
    expect(severityFor(80, 80)).toBe('critical')
    expect(severityFor(69, 70)).toBe('warn')
    expect(severityFor(70, 70)).toBe('critical')
  })

  it('an unknown percentage is never scored as critical', () => {
    expect(severityFor(null, 80)).toBe('ok')
  })
})

describe('makeReading', () => {
  it('rings the highest available quota window', () => {
    const reading = makeReading({
      providerId: 'test',
      displayName: 'Test',
      state: 'ok',
      session: makeWindow('5h session', 31, null),
      weekly: makeWindow('Weekly', 67, null),
      now: 1000,
      alertThreshold: 90
    })
    expect(reading.ringPercent).toBe(67)
    expect(reading.severity).toBe('warn')
  })

  it('falls back to whichever window is known', () => {
    const sessionOnly = makeReading({
      providerId: 'test',
      displayName: 'Test',
      state: 'ok',
      session: makeWindow('5h session', 31, null),
      weekly: makeWindow('Weekly', null, null),
      now: 1000,
      alertThreshold: 80
    })
    expect(sessionOnly.ringPercent).toBe(31)
  })

  it('never rings a reading that is not ok', () => {
    const reading = makeReading({
      providerId: 'test',
      displayName: 'Test',
      state: 'logged-out',
      message: 'signed out',
      // Even if a window somehow carried a number, a non-ok state must not ring.
      session: makeWindow('5h session', 99, null),
      now: 1000,
      alertThreshold: 80
    })
    expect(reading.ringPercent).toBeNull()
    expect(reading.severity).toBe('ok')
    expect(reading.stale).toBe(false)
  })
})

describe('registry', () => {
  it('ships seven built-in providers', () => {
    expect(BUILTIN_PROVIDERS).toHaveLength(7)
    expect(BUILTIN_PROVIDERS.map((p) => p.id)).toEqual([
      'codex',
      'claude',
      'gemini',
      'cursor',
      'opencode',
      'grok',
      'deepseek'
    ])
  })

  it('filters disabled providers before any reader runs', () => {
    const providers = buildProviders(
      gauge({
        enabledProviders: {
          codex: false,
          claude: false,
          gemini: false,
          cursor: false,
          opencode: false,
          grok: false,
          deepseek: false
        }
      })
    )
    expect(providers).toEqual([])
  })

  it('enables a provider absent from saved settings', () => {
    const providers = buildProviders(gauge({ enabledProviders: { codex: false } }))
    expect(providers.map((p) => p.id)).not.toContain('codex')
    expect(providers.map((p) => p.id)).toContain('claude')
  })

  it('adds one provider per custom entry and skips unusable ones', () => {
    const providers = buildProviders(
      gauge({
        enabledProviders: {
          codex: false,
          claude: false,
          gemini: false,
          cursor: false,
          opencode: false,
          grok: false,
          deepseek: false
        },
        customProviders: [
          customConfig({ id: 'custom_a', name: 'A' }),
          customConfig({ id: '  ', name: 'broken' })
        ]
      })
    )
    expect(providers.map((p) => p.id)).toEqual(['custom_a'])
  })
})

// ---------------------------------------------------------------------------
// Per-provider: a failed read is a reading, not a throw
// ---------------------------------------------------------------------------

describe('every provider degrades instead of throwing', () => {
  it.each(BUILTIN_PROVIDERS.map((p) => [p.id, p] as const))(
    '%s reports a non-ok state with no invented number',
    async (_id, provider) => {
      const reading: QuotaReading = await provider.read(ctx())
      expect(reading.state).not.toBe('ok')
      expect(reading.providerId).toBe(provider.id)
      expect(reading.ringPercent).toBeNull()
      expect(reading.session?.usedPercent ?? null).toBeNull()
      expect(reading.weekly?.usedPercent ?? null).toBeNull()
      expect(reading.severity).toBe('ok')
      expect(reading.stale).toBe(false)
      expect(typeof reading.observedAt).toBe('string')
    }
  )

  it('reports not-installed when nothing is on disk', async () => {
    for (const provider of BUILTIN_PROVIDERS) {
      // DeepSeek is a documented HTTP API with no CLI to install, so "no
      // credential" is `logged-out`, not `not-installed` — it has no on-disk
      // presence to distinguish absent from signed-out.
      if (provider.id === 'deepseek') continue
      const reading = await provider.read(ctx())
      expect(reading.state).toBe('not-installed')
    }
  })
})

describe('claude provider', () => {
  let home: string

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'ledge-claude-'))
  })
  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true })
  })

  it('reports permission-required when the keychain read is refused', async () => {
    // The directory exists but holds no credentials file, so the provider
    // falls through to the credential store — which refuses.
    const platform = fakePlatform({
      claudeHome: home,
      readSecret: async () => ({ ok: false, reason: 'permission-denied', message: 'denied' })
    })
    const reading = await claudeProvider.read(ctx(platform))

    expect(reading.state).toBe('permission-required')
    expect(reading.ringPercent).toBeNull()
    expect(reading.message).toMatch(/retry/i)
  })

  it('prefers the credentials file over the credential store', async () => {
    let secretReads = 0
    fs.writeFileSync(
      path.join(home, '.credentials.json'),
      JSON.stringify({ claudeAiOauth: { accessToken: 'tok', expiresAt: 0 } })
    )
    const platform = fakePlatform({
      claudeHome: home,
      readSecret: async () => {
        secretReads += 1
        return { ok: false, reason: 'not-found' }
      }
    })
    // expiresAt of 0 means expired, so this stops before any network call.
    const reading = await claudeProvider.read(ctx(platform))

    expect(secretReads).toBe(0)
    expect(reading.state).toBe('logged-out')
    expect(reading.message).toMatch(/expired/i)
  })

  it('reports logged-out, not not-installed, when the home exists but has no credential', async () => {
    const reading = await claudeProvider.read(ctx(fakePlatform({ claudeHome: home })))
    expect(reading.state).toBe('logged-out')
  })

  it('never echoes credential content in a message', async () => {
    fs.writeFileSync(path.join(home, '.credentials.json'), '{ this is not json')
    const reading = await claudeProvider.read(ctx(fakePlatform({ claudeHome: home })))
    expect(reading.state).toBe('logged-out')
    expect(reading.message).not.toContain('this is not json')
  })

  it('reads both the current and the legacy usage payload shapes', () => {
    const modern = parseClaudeWindows({
      limits: [
        { kind: 'session', percent: 42, resets_at: '2026-08-31T12:00:00.000Z' },
        { kind: 'weekly_all', utilization: 71, resets_at: 1_798_000_000 }
      ]
    })
    expect(modern.session.percent).toBe(42)
    expect(modern.session.resetsAt).toBe('2026-08-31T12:00:00.000Z')
    expect(modern.weekly.percent).toBe(71)
    expect(modern.weekly.resetsAt).not.toBeNull()

    const legacy = parseClaudeWindows({
      five_hour: { utilization: 12, resets_at: '2026-08-31T12:00:00.000Z' },
      seven_day: { percent: 34, resets_at: null }
    })
    expect(legacy.session.percent).toBe(12)
    expect(legacy.weekly.percent).toBe(34)
    expect(legacy.weekly.resetsAt).toBeNull()
  })

  it('proves nothing from an empty payload', () => {
    const empty = parseClaudeWindows({})
    expect(empty.session.percent).toBeNull()
    expect(empty.weekly.percent).toBeNull()
  })

  it('reports the highest of the weekly caps and names which one binds', () => {
    // Real payload shape: the blended weekly figure looks comfortable, but
    // the per-model Opus cap is nearly exhausted — that is what should show.
    const windows = parseClaudeWindows({
      five_hour: { utilization: 33 },
      seven_day: { utilization: 13 },
      seven_day_opus: { utilization: 95 }
    })
    expect(windows.session.percent).toBe(33)
    expect(windows.weekly.percent).toBe(95)
    expect(windows.weeklyLabel).toBe('Weekly (Opus)')
  })

  it('falls back to the blended weekly cap when no per-model cap exceeds it', () => {
    const windows = parseClaudeWindows({
      seven_day: { utilization: 50 },
      seven_day_sonnet: { utilization: 20 }
    })
    expect(windows.weekly.percent).toBe(50)
    expect(windows.weeklyLabel).toBe('Weekly')
  })

  it('never defaults a missing per-model cap to 0', () => {
    // Only seven_day_opus is present: seven_day and seven_day_sonnet must stay
    // absent from consideration, not silently treated as 0.
    const windows = parseClaudeWindows({ seven_day_opus: { utilization: 40 } })
    expect(windows.weekly.percent).toBe(40)
    expect(windows.weeklyLabel).toBe('Weekly (Opus)')
  })
})

describe('parseDeepseekBalance', () => {
  it('prefers the funded entry when a zero USD entry sorts first', () => {
    const balance = parseDeepseekBalance({
      is_available: true,
      balance_infos: [
        { currency: 'USD', total_balance: '0.00', granted_balance: '0.00', topped_up_balance: '0.00' },
        { currency: 'CNY', total_balance: '110.00', granted_balance: '10.00', topped_up_balance: '100.00' }
      ]
    })
    expect(balance).not.toBeNull()
    expect(balance!.currency).toBe('CNY')
    expect(balance!.totalBalance).toBe('110.00')
  })

  it('prefers the funded entry regardless of which order it comes in', () => {
    const balance = parseDeepseekBalance({
      is_available: true,
      balance_infos: [
        { currency: 'CNY', total_balance: '110.00' },
        { currency: 'USD', total_balance: '0.00' }
      ]
    })
    expect(balance).not.toBeNull()
    expect(balance!.currency).toBe('CNY')
    expect(balance!.totalBalance).toBe('110.00')
  })

  it('falls back to the first parseable entry when every entry is zero', () => {
    const balance = parseDeepseekBalance({
      balance_infos: [
        { currency: 'USD', total_balance: '0.00' },
        { currency: 'CNY', total_balance: '0.00' }
      ]
    })
    expect(balance).not.toBeNull()
    expect(balance!.currency).toBe('USD')
    expect(balance!.totalBalance).toBe('0.00')
  })

  it('never invents a currency, and returns null when nothing parses', () => {
    expect(parseDeepseekBalance({ balance_infos: [] })).toBeNull()
    expect(
      parseDeepseekBalance({ balance_infos: [{ currency: 'EUR', total_balance: '5.00' }] })
    ).toBeNull()
  })
})

describe('cursor provider', () => {
  let storage: string

  beforeEach(() => {
    storage = fs.mkdtempSync(path.join(os.tmpdir(), 'ledge-cursor-'))
  })
  afterEach(() => {
    fs.rmSync(storage, { recursive: true, force: true })
  })

  it('reports logged-out when the state database is missing', async () => {
    const provider = BUILTIN_PROVIDERS.find((p) => p.id === 'cursor')!
    const reading = await provider.read(ctx(fakePlatform({ cursorGlobalStorage: storage })))
    expect(reading.state).toBe('logged-out')
    expect(reading.ringPercent).toBeNull()
  })

  it('reports error, not a number, when state.vscdb is not a database', async () => {
    fs.writeFileSync(path.join(storage, 'state.vscdb'), 'not a sqlite file')
    const provider = BUILTIN_PROVIDERS.find((p) => p.id === 'cursor')!
    const reading = await provider.read(ctx(fakePlatform({ cursorGlobalStorage: storage })))
    expect(reading.state).toBe('error')
    expect(reading.ringPercent).toBeNull()
  })
})

/**
 * `node:sqlite` is unflagged from Node 24 (which Electron 44 ships). Skip this
 * block on an older test runtime rather than failing the suite there.
 */
const sqliteAvailable = await (async () => {
  try {
    const specifier: string = 'node:sqlite'
    const mod = (await import(/* @vite-ignore */ specifier)) as { DatabaseSync?: unknown }
    return typeof mod.DatabaseSync === 'function'
  } catch {
    return false
  }
})()

describe.skipIf(!sqliteAvailable)('readVscdbItems (node:sqlite, no Python)', () => {
  let dir: string
  let dbPath: string

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledge-vscdb-'))
    dbPath = path.join(dir, 'state.vscdb')
    const specifier: string = 'node:sqlite'
    const { DatabaseSync } = (await import(/* @vite-ignore */ specifier)) as {
      DatabaseSync: new (p: string) => {
        exec(sql: string): void
        close(): void
      }
    }
    const db = new DatabaseSync(dbPath)
    db.exec('CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB)')
    db.exec(
      "INSERT INTO ItemTable (key, value) VALUES ('cursorAuth/accessToken', 'tok-123'), ('cursorAuth/stripeMembershipType', 'pro')"
    )
    db.close()
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('reads the keys it needs and leaves the file untouched', async () => {
    const before = fs.statSync(dbPath).mtimeMs
    const items = await readVscdbItems(dbPath, [
      'cursorAuth/accessToken',
      'cursorAuth/stripeMembershipType',
      'missing/key'
    ])
    expect(items['cursorAuth/accessToken']).toBe('tok-123')
    expect(items['cursorAuth/stripeMembershipType']).toBe('pro')
    expect(items['missing/key']).toBeNull()
    expect(fs.statSync(dbPath).mtimeMs).toBe(before)
  })
})

describe('file-backed providers distinguish absent from signed-out', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledge-provider-'))
  })
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const provider = (id: string) => BUILTIN_PROVIDERS.find((p) => p.id === id)!

  it('codex: home present but no auth.json', async () => {
    const reading = await provider('codex').read(ctx(fakePlatform({ codexHome: dir })))
    expect(reading.state).toBe('logged-out')
  })

  it('codex: auth.json with no access token', async () => {
    fs.writeFileSync(path.join(dir, 'auth.json'), JSON.stringify({ tokens: { account_id: 'a' } }))
    const reading = await provider('codex').read(ctx(fakePlatform({ codexHome: dir })))
    expect(reading.state).toBe('logged-out')
    expect(reading.ringPercent).toBeNull()
  })

  it('opencode: auth.json with no key', async () => {
    const authPath = path.join(dir, 'auth.json')
    fs.writeFileSync(authPath, JSON.stringify({ 'opencode-go': {} }))
    const reading = await provider('opencode').read(ctx(fakePlatform({ openCodeAuth: authPath })))
    expect(reading.state).toBe('logged-out')
  })

  it('opencode: a malformed auth.json is never echoed back', async () => {
    const authPath = path.join(dir, 'auth.json')
    fs.writeFileSync(authPath, 'SECRETKEYTEXT-not-json')
    const reading = await provider('opencode').read(ctx(fakePlatform({ openCodeAuth: authPath })))
    expect(reading.state).not.toBe('ok')
    expect(reading.message ?? '').not.toContain('SECRETKEYTEXT')
  })

  it('grok: home present but no auth.json', async () => {
    const reading = await provider('grok').read(ctx(fakePlatform({ grokHome: dir })))
    expect(reading.state).toBe('logged-out')
  })

  it('grok: api-key-only profiles have no quota window and are skipped', async () => {
    fs.writeFileSync(
      path.join(dir, 'auth.json'),
      JSON.stringify({
        p1: { auth_mode: 'api_key', key: 'xai-secret' },
        p2: { auth_mode: 'web_login', key: 'x' }
      })
    )
    const reading = await provider('grok').read(ctx(fakePlatform({ grokHome: dir })))
    expect(reading.state).toBe('logged-out')
    expect(reading.ringPercent).toBeNull()
  })

  it('a throwing path resolver produces an error reading, not a throw', async () => {
    const platform = fakePlatform()
    for (const key of [
      'claudeHome',
      'codexHome',
      'grokHome',
      'cursorGlobalStorage',
      'openCodeAuth'
    ] as const) {
      platform.paths[key] = () => {
        throw new Error('no home directory')
      }
    }
    for (const id of ['claude', 'codex', 'grok', 'cursor', 'opencode']) {
      const reading = await provider(id).read(ctx(platform))
      expect(reading.state).toBe('error')
      expect(reading.ringPercent).toBeNull()
    }
  })
})

describe('gemini provider', () => {
  const provider = () => BUILTIN_PROVIDERS.find((p) => p.id === 'gemini')!

  beforeEach(() => {
    resetGeminiTokenCache()
  })

  it('reports logged-out when the client is on PATH but has no credential', async () => {
    const platform = fakePlatform({ which: async (name) => (name === 'agy' ? '/usr/bin/agy' : null) })
    const reading = await provider().read(ctx(platform))
    expect(reading.state).toBe('logged-out')
    expect(reading.ringPercent).toBeNull()
  })

  it('reports permission-required when the credential store refuses', async () => {
    const platform = fakePlatform({
      readSecret: async () => ({ ok: false, reason: 'permission-denied' })
    })
    const reading = await provider().read(ctx(platform))
    expect(reading.state).toBe('permission-required')
  })

  it('refuses to guess when the token is expired and cannot be refreshed', async () => {
    const platform = fakePlatform({
      which: async () => '/usr/bin/agy',
      readSecret: async () => ({
        ok: true,
        value: JSON.stringify({ token: { access_token: 'a', expiry: '2000-01-01T00:00:00Z' } })
      })
    })
    const reading = await provider().read(ctx(platform))
    expect(reading.state).toBe('logged-out')
    expect(reading.ringPercent).toBeNull()
  })
})

describe('custom provider', () => {
  it('uses manually entered percentages', async () => {
    const provider = createCustomProvider(
      customConfig({ manualSessionPercent: 25, manualWeeklyPercent: 60 })
    )
    const reading = await provider.read(ctx())
    expect(reading.state).toBe('ok')
    expect(reading.session?.usedPercent).toBe(25)
    expect(reading.weekly?.usedPercent).toBe(60)
    expect(reading.ringPercent).toBe(60)
  })

  it('reports error when neither a command nor a percentage is configured', async () => {
    const reading = await createCustomProvider(customConfig()).read(ctx())
    expect(reading.state).toBe('error')
    expect(reading.ringPercent).toBeNull()
    expect(reading.message).toMatch(/Settings/)
  })

  it('parses JSON from a command', async () => {
    const platform = fakePlatform({
      runCommand: async () => ({
        ok: true,
        stdout: '{"sessionUsedPercent": 10, "weeklyUsedPercent": 90}',
        stderr: '',
        code: 0
      })
    })
    const provider = createCustomProvider(customConfig({ command: 'my-cli usage' }))
    const reading = await provider.read(ctx(platform))
    expect(reading.state).toBe('ok')
    expect(reading.ringPercent).toBe(90)
  })

  it('reports error, never a zero, when the command prints non-JSON', async () => {
    const platform = fakePlatform({
      runCommand: async () => ({ ok: true, stdout: 'usage: 42%', stderr: '', code: 0 })
    })
    const provider = createCustomProvider(customConfig({ command: 'my-cli usage' }))
    const reading = await provider.read(ctx(platform))
    expect(reading.state).toBe('error')
    expect(reading.ringPercent).toBeNull()
    // stdout may contain a token the command printed; it must not be echoed.
    expect(reading.message).not.toContain('usage: 42%')
  })

  it('reports error when the command rejects', async () => {
    const platform = fakePlatform({
      runCommand: async () => {
        throw new Error('spawn ENOENT')
      }
    })
    const provider = createCustomProvider(customConfig({ command: 'nope' }))
    const reading = await provider.read(ctx(platform))
    expect(reading.state).toBe('error')
  })

  it('does not cache manual entries, so a settings edit takes effect at once', () => {
    expect(createCustomProvider(customConfig()).ttlMs).toBe(0)
    expect(createCustomProvider(customConfig({ command: 'x' })).ttlMs).toBe(60_000)
  })
})

// ---------------------------------------------------------------------------
// Engine surface
// ---------------------------------------------------------------------------

describe('quota engine', () => {
  const allOff = {
    codex: false,
    claude: false,
    gemini: false,
    cursor: false,
    opencode: false,
    grok: false,
    deepseek: false
  }

  it('returns an empty snapshot when everything is disabled', async () => {
    configureQuota({
      platform: fakePlatform(),
      getSettings: () => gauge({ enabledProviders: allOff }),
      now: () => 1000
    })
    const snapshot = await refresh()
    expect(snapshot.readings).toEqual([])
    expect(snapshot.lastUpdated).toBe(new Date(1000).toISOString())
  })

  it('runs providers concurrently and one failure never fails the batch', async () => {
    configureQuota({
      platform: fakePlatform({
        runCommand: async (command) => {
          if (command === 'boom') throw new Error('spawn failed')
          return { ok: true, stdout: '{"sessionUsedPercent": 5}', stderr: '', code: 0 }
        }
      }),
      getSettings: () =>
        gauge({
          enabledProviders: allOff,
          customProviders: [
            customConfig({ id: 'custom_bad', name: 'Bad', command: 'boom' }),
            customConfig({ id: 'custom_good', name: 'Good', command: 'fine' }),
            customConfig({ id: 'custom_manual', name: 'Manual', manualSessionPercent: 50 })
          ]
        }),
      now: () => 1000
    })

    const snapshot = await refresh()
    expect(snapshot.readings.map((r) => r.providerId)).toEqual([
      'custom_bad',
      'custom_good',
      'custom_manual'
    ])
    expect(snapshot.readings[0]!.state).toBe('error')
    expect(snapshot.readings[1]!.state).toBe('ok')
    expect(snapshot.readings[2]!.ringPercent).toBe(50)
  })

  it('retains a recent good reading behind a failure, then lets it expire', async () => {
    let now = 1000
    let healthy = true
    configureQuota({
      platform: fakePlatform({
        runCommand: async () =>
          healthy
            ? { ok: true, stdout: '{"sessionUsedPercent": 40}', stderr: '', code: 0 }
            : { ok: false, stdout: '', stderr: 'offline', code: 1 }
      }),
      getSettings: () =>
        gauge({
          enabledProviders: allOff,
          customProviders: [customConfig({ id: 'custom_x', name: 'X', command: 'usage' })]
        }),
      now: () => now
    })

    const first = await refresh({ force: true })
    expect(first.readings[0]!.ringPercent).toBe(40)

    healthy = false
    now += 60_000
    const second = await refresh({ force: true })
    expect(second.readings[0]!.ringPercent).toBe(40)
    expect(second.readings[0]!.stale).toBe(true)

    now += STALE_TTL_MS
    const third = await refresh({ force: true })
    expect(third.readings[0]!.ringPercent).toBeNull()
    expect(third.readings[0]!.state).toBe('error')
  })

  it('getSnapshot reuses the last snapshot rather than re-reading', async () => {
    let reads = 0
    configureQuota({
      platform: fakePlatform({
        runCommand: async () => {
          reads += 1
          return { ok: true, stdout: '{"weeklyUsedPercent": 7}', stderr: '', code: 0 }
        }
      }),
      getSettings: () =>
        gauge({
          enabledProviders: allOff,
          customProviders: [customConfig({ id: 'custom_y', name: 'Y', command: 'usage' })]
        }),
      now: () => 1000
    })

    const a = await getSnapshot()
    const b = await getSnapshot()
    expect(reads).toBe(1)
    expect(b).toBe(a)
  })
})

describe('probeCommand', () => {
  it('finds a command on PATH', async () => {
    configureQuota({
      platform: fakePlatform({ which: async (name) => (name === 'aider' ? '/usr/bin/aider' : null) }),
      getSettings: () => gauge()
    })
    expect(await probeCommand('aider')).toEqual({ found: true, path: '/usr/bin/aider' })
    expect(await probeCommand('nope')).toEqual({ found: false, path: null })
  })

  it('rejects anything that is not a plain command name', async () => {
    let called = false
    configureQuota({
      platform: fakePlatform({
        which: async () => {
          called = true
          return '/x'
        }
      }),
      getSettings: () => gauge()
    })
    expect(await probeCommand('aider; rm -rf /')).toEqual({ found: false, path: null })
    expect(await probeCommand('$(whoami)')).toEqual({ found: false, path: null })
    expect(await probeCommand('')).toEqual({ found: false, path: null })
    expect(called).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe('coercePercent', () => {
  it('accepts only a provable 0–100 value', () => {
    expect(coercePercent(0)).toBe(0)
    expect(coercePercent(42.4)).toBe(42)
    expect(coercePercent('67')).toBe(67)
    expect(coercePercent(100)).toBe(100)
  })

  it('clamps a provable over-limit value in (100, 200] to 100', () => {
    // Over the cap is a fact worth showing, not a reason to blank the ring: a
    // Cursor usage-based account at 112%, or Claude's own imprecise 100.4,
    // are genuinely "at the limit", and clamping to 100 also keeps the
    // critical-severity alert firing.
    expect(coercePercent(101)).toBe(100)
    expect(coercePercent(100.4)).toBe(100)
    expect(coercePercent(112)).toBe(100)
    expect(coercePercent('150')).toBe(100)
    expect(coercePercent(200)).toBe(100)
  })

  it('refuses a value so far over 100 it looks like a reader bug, not a user', () => {
    expect(coercePercent(200.1)).toBeNull()
    expect(coercePercent(500)).toBeNull()
  })

  it('refuses anything it cannot prove', () => {
    expect(coercePercent(null)).toBeNull()
    expect(coercePercent(undefined)).toBeNull()
    expect(coercePercent(true)).toBeNull()
    expect(coercePercent(-1)).toBeNull()
    expect(coercePercent(Number.NaN)).toBeNull()
    expect(coercePercent('abc')).toBeNull()
    // The original returned 0 here because Number('') is 0.
    expect(coercePercent('')).toBeNull()
    expect(coercePercent('   ')).toBeNull()
  })
})

describe('remainingToUsed', () => {
  it('inverts a remaining fraction', () => {
    expect(remainingToUsed(1)).toBe(0)
    expect(remainingToUsed(0.25)).toBe(75)
    expect(remainingToUsed(0)).toBe(100)
    expect(remainingToUsed('0.5')).toBeNull()
    expect(remainingToUsed(null)).toBeNull()
  })
})

describe('toIsoInstant', () => {
  it('normalises seconds, milliseconds and ISO strings', () => {
    expect(toIsoInstant('2026-08-31T10:00:00.000Z')).toBe('2026-08-31T10:00:00.000Z')
    expect(toIsoInstant(1_798_000_000)).toBe(new Date(1_798_000_000_000).toISOString())
    expect(toIsoInstant(1_798_000_000_000)).toBe(new Date(1_798_000_000_000).toISOString())
    expect(toIsoInstant('1798000000')).toBe(new Date(1_798_000_000_000).toISOString())
  })

  it('returns null rather than an epoch for junk', () => {
    expect(toIsoInstant(null)).toBeNull()
    expect(toIsoInstant('')).toBeNull()
    expect(toIsoInstant('   ')).toBeNull()
    expect(toIsoInstant('not a date')).toBeNull()
    expect(toIsoInstant({})).toBeNull()
  })
})

describe('redact', () => {
  it('strips anything that looks like a credential', () => {
    expect(redact('Authorization: Bearer abc.def.ghi')).not.toContain('abc.def.ghi')
    expect(redact('token sk-abcdefghijklmnop')).not.toContain('abcdefghijklmnop')
    expect(redact('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig')).not.toContain('eyJhbGci')
    expect(redact(`key ${'a'.repeat(60)}`)).not.toContain('a'.repeat(60))
  })

  it('leaves ordinary text alone and caps the length', () => {
    expect(redact('connect ETIMEDOUT')).toBe('connect ETIMEDOUT')
    expect(redact('x'.repeat(500)).length).toBeLessThanOrEqual(201)
  })
})

describe('httpsRequest', () => {
  it('refuses to send a request over plain http', async () => {
    await expect(httpsRequest({ url: 'http://example.com/usage' })).rejects.toThrow(/non-https/)
  })
})
