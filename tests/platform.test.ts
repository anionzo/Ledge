/**
 * Platform seam tests.
 *
 * Two jobs:
 *
 *  1. **Selection.** `getPlatform()` returns the right adapter for the running
 *     platform, memoises it, and falls back to Linux for anything it does not
 *     recognise.
 *
 *  2. **Conformance.** All three adapters implement the whole of
 *     `PlatformAdapter` with nothing missing. This is the test that catches
 *     the real failure mode of a seam like this: a method added to the
 *     interface and wired up on the developer's own OS, then discovered
 *     missing on the other two at runtime, by a user.
 *
 * The adapters are constructed directly rather than through `getPlatform()`,
 * so every one of them is exercised on every CI platform. That works because
 * nothing in the platform layer imports `electron` or `koffi` statically —
 * both go through `shared/nativeRequire`, which returns `null` when the module
 * is unavailable and lets the adapters fall back to their no-op paths. No
 * mocking required; see the comment at the top of that file.
 */
import { describe, expect, it, afterEach } from 'vitest'

import {
  createAdapter,
  getPlatform,
  resetPlatformCache,
  resolvePlatformId
} from '../electron/platform/index'
import type { PlatformAdapter, PlatformId } from '../electron/platform/types'
import { desktopEntry } from '../electron/platform/linux/autostart'
import {
  isValidProgramName,
  looksLikePath,
  parseExecutableToken
} from '../electron/platform/shared/pathValidation'
import { clampTimeout, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS } from '../electron/platform/shared/exec'

const ALL_IDS: PlatformId[] = ['win32', 'darwin', 'linux']

/** Swap `process.platform`, which is a non-writable own property. */
function withPlatform<T>(value: string, fn: () => T): T {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { value, configurable: true })
  try {
    return fn()
  } finally {
    if (original) Object.defineProperty(process, 'platform', original)
  }
}

afterEach(() => {
  resetPlatformCache()
})

// ── Selection ──────────────────────────────────────────────────────────────

describe('resolvePlatformId', () => {
  it('maps the three supported platforms to themselves', () => {
    expect(resolvePlatformId('win32')).toBe('win32')
    expect(resolvePlatformId('darwin')).toBe('darwin')
    expect(resolvePlatformId('linux')).toBe('linux')
  })

  it('falls back to linux for anything unrecognised', () => {
    // Every other POSIX-ish platform Node runs on, plus nonsense.
    for (const other of ['freebsd', 'openbsd', 'sunos', 'aix', 'android', 'haiku', '']) {
      expect(resolvePlatformId(other)).toBe('linux')
    }
  })
})

describe('getPlatform', () => {
  it('selects the adapter matching process.platform', () => {
    expect(getPlatform().id).toBe(resolvePlatformId(process.platform))
  })

  it('memoises: repeated calls return the same instance', () => {
    expect(getPlatform()).toBe(getPlatform())
  })

  it('selects per platform once the cache is cleared', () => {
    for (const [platform, expected] of [
      ['win32', 'win32'],
      ['darwin', 'darwin'],
      ['linux', 'linux'],
      ['freebsd', 'linux']
    ] as const) {
      resetPlatformCache()
      const id = withPlatform(platform, () => getPlatform().id)
      expect(id).toBe(expected)
    }
  })
})

// ── Conformance ────────────────────────────────────────────────────────────

/** Every member of `PlatformAdapter`, so a new one cannot be half-wired. */
const REQUIRED_METHODS = [
  'applyNoActivate',
  'applyAlwaysOnTop',
  'applyHiddenFromSwitcher',
  'isFullscreenAppActive',
  'getAutostart',
  'setAutostart',
  'readSecret',
  'runCommand',
  'which'
] as const

const REQUIRED_CAPABILITIES = [
  'clickThrough',
  'noActivate',
  'fullscreenDetection',
  'autostart',
  'encryptedStorage',
  'alwaysOnTopOverFullscreen'
] as const

const REQUIRED_PATHS = [
  'appData',
  'claudeHome',
  'codexHome',
  'cursorGlobalStorage',
  'openCodeAuth',
  'grokHome'
] as const

describe.each(ALL_IDS)('the %s adapter', (id) => {
  const adapter: PlatformAdapter = createAdapter(id)

  it('reports its own id', () => {
    expect(adapter.id).toBe(id)
  })

  it.each(REQUIRED_METHODS)('implements %s', (method) => {
    expect(typeof adapter[method]).toBe('function')
  })

  it.each(REQUIRED_CAPABILITIES)('declares a boolean %s capability', (flag) => {
    expect(typeof adapter.capabilities[flag]).toBe('boolean')
  })

  it('declares no capabilities beyond the interface', () => {
    expect(Object.keys(adapter.capabilities).sort()).toEqual([...REQUIRED_CAPABILITIES].sort())
  })

  it.each(REQUIRED_PATHS)('resolves a non-empty %s path', (key) => {
    const fn = adapter.paths[key]
    expect(typeof fn).toBe('function')
    const value = fn()
    expect(typeof value).toBe('string')
    expect(value.length).toBeGreaterThan(0)
  })

  it('never throws for window operations on a missing or dead window', () => {
    // A destroyed window is the realistic case: these run from timers and IPC
    // handlers that can fire during shutdown.
    const dead = { isDestroyed: () => true } as unknown as Parameters<
      PlatformAdapter['applyAlwaysOnTop']
    >[0]
    const nulled = null as unknown as typeof dead

    for (const win of [nulled, dead]) {
      expect(() => adapter.applyNoActivate(win, true)).not.toThrow()
      expect(() => adapter.applyNoActivate(win, false)).not.toThrow()
      expect(() => adapter.applyAlwaysOnTop(win, true)).not.toThrow()
      expect(() => adapter.applyHiddenFromSwitcher(win)).not.toThrow()
    }
  })

  it('answers isFullscreenAppActive synchronously with a boolean', () => {
    expect(typeof adapter.isFullscreenAppActive()).toBe('boolean')
  })

  it('reads autostart without throwing, even outside Electron', async () => {
    await expect(adapter.getAutostart()).resolves.toEqual(expect.any(Boolean))
  })

  it('rejects an invalid secret lookup without spawning anything', async () => {
    const result = await adapter.readSecret({ service: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('error')
  })

  it('returns null from which() for a name that cannot be a program', async () => {
    // Shell metacharacters are rejected by name validation before any lookup.
    await expect(adapter.which('rm -rf /')).resolves.toBeNull()
    await expect(adapter.which('foo;bar')).resolves.toBeNull()
    await expect(adapter.which('')).resolves.toBeNull()
  })

  it('refuses a command whose program does not resolve', async () => {
    const result = await adapter.runCommand('ledge-no-such-program-9c1f --version')
    expect(result.ok).toBe(false)
    expect(result.code).toBeNull()
    expect(result.stderr).toMatch(/not found on PATH/i)
  })

  it('refuses a command that is only shell metacharacters', async () => {
    for (const command of ['', '   ', '; echo pwned', '"unterminated --flag', '&& whoami']) {
      const result = await adapter.runCommand(command)
      expect(result.ok).toBe(false)
      expect(result.stdout).toBe('')
    }
  })
})

// ── Per-platform capability contract ───────────────────────────────────────

describe('capability declarations', () => {
  it('windows: click-through, autostart and over-fullscreen are all available', () => {
    const caps = createAdapter('win32').capabilities
    expect(caps.clickThrough).toBe(true)
    expect(caps.autostart).toBe(true)
    expect(caps.alwaysOnTopOverFullscreen).toBe(true)
    // noActivate and fullscreenDetection are koffi-dependent, so only their
    // type is fixed — on a machine without koffi they are legitimately false.
    expect(typeof caps.noActivate).toBe('boolean')
    expect(typeof caps.fullscreenDetection).toBe('boolean')
  })

  it('macos: everything but fullscreen detection', () => {
    const caps = createAdapter('darwin').capabilities
    expect(caps.clickThrough).toBe(true)
    expect(caps.noActivate).toBe(true)
    expect(caps.autostart).toBe(true)
    expect(caps.alwaysOnTopOverFullscreen).toBe(true)
    // Honest false: no pure-Electron way to read a foreign window's frame.
    expect(caps.fullscreenDetection).toBe(false)
  })

  it('linux: click-through is unavailable, and so is focus suppression', () => {
    const caps = createAdapter('linux').capabilities
    // setIgnoreMouseEvents is documented macOS/Windows only. This is the flag
    // electron/main branches on to resize the panel instead.
    expect(caps.clickThrough).toBe(false)
    expect(caps.noActivate).toBe(false)
    expect(caps.fullscreenDetection).toBe(false)
    expect(caps.alwaysOnTopOverFullscreen).toBe(false)
    // The XDG autostart file is fully supported, unlike the rest.
    expect(caps.autostart).toBe(true)
  })

  it('encryptedStorage is measured at runtime, not declared', () => {
    // Outside Electron safeStorage is unreachable, so the honest answer on
    // every adapter is false. The point of the assertion is that all three
    // agree, i.e. none of them hardcoded it.
    for (const id of ALL_IDS) {
      expect(createAdapter(id).capabilities.encryptedStorage).toBe(false)
    }
  })
})

// ── Command hardening ──────────────────────────────────────────────────────

describe('executable validation', () => {
  it('takes the first token as the program', () => {
    expect(parseExecutableToken('claude usage --json')).toBe('claude')
    expect(parseExecutableToken('  spaced-out  --flag ')).toBe('spaced-out')
  })

  it('understands a quoted program path with spaces', () => {
    expect(parseExecutableToken('"C:\\Program Files\\App\\a.exe" --flag')).toBe(
      'C:\\Program Files\\App\\a.exe'
    )
  })

  it('refuses to guess where an unterminated quote ends', () => {
    expect(parseExecutableToken('"C:\\Program Files\\a.exe --flag')).toBeNull()
    expect(parseExecutableToken('')).toBeNull()
    expect(parseExecutableToken('   ')).toBeNull()
    expect(parseExecutableToken(undefined)).toBeNull()
  })

  it('rejects program names carrying shell syntax or control characters', () => {
    expect(isValidProgramName('claude')).toBe(true)
    expect(isValidProgramName('node-22.1')).toBe(true)
    for (const bad of ['a;b', 'a&b', 'a|b', 'a$b', 'a`b', 'a b', 'a\nb', 'a\u0000b', '', '../x']) {
      expect(isValidProgramName(bad)).toBe(false)
    }
  })

  it('tells a path apart from a PATH lookup', () => {
    expect(looksLikePath('claude')).toBe(false)
    expect(looksLikePath('./claude')).toBe(true)
    expect(looksLikePath('/usr/bin/claude')).toBe(true)
    expect(looksLikePath('C:\\bin\\claude.exe')).toBe(true)
  })
})

describe('clampTimeout', () => {
  it('defaults when unset or nonsensical', () => {
    for (const bad of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(clampTimeout(bad as number | undefined)).toBe(DEFAULT_TIMEOUT_MS)
    }
  })

  it('caps a runaway value so a poll loop cannot wedge', () => {
    expect(clampTimeout(10 * MAX_TIMEOUT_MS)).toBe(MAX_TIMEOUT_MS)
    expect(clampTimeout(1234)).toBe(1234)
  })
})

// ── Linux autostart entry ──────────────────────────────────────────────────

describe('the linux autostart desktop entry', () => {
  const entry = desktopEntry()

  it('is a valid Type=Application desktop entry', () => {
    expect(entry.startsWith('[Desktop Entry]\n')).toBe(true)
    expect(entry).toMatch(/^Type=Application$/m)
    expect(entry).toMatch(/^Name=Ledge$/m)
    expect(entry).toMatch(/^Terminal=false$/m)
  })

  it('carries a real, quoted Exec path', () => {
    const exec = /^Exec="(.+)" --hidden$/m.exec(entry)
    expect(exec).not.toBeNull()
    expect(exec?.[1].length).toBeGreaterThan(0)
  })

  it('marks itself enabled for GNOME, which disables by key rather than by deleting', () => {
    expect(entry).toMatch(/^X-GNOME-Autostart-enabled=true$/m)
  })
})
