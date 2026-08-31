/**
 * Ports `agent-notch/tests/quota-state.test.js` (staleness) and the caching
 * assertions from `agent-notch/tests/scrapers.test.js` (single-flight,
 * backoff) onto the Ledge `QuotaReading` shape.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { QuotaReading, QuotaSnapshot } from '../shared/types/quota'
import { STALE_TTL_MS } from '../shared/types/quota'
import type { PlatformAdapter } from '../electron/platform/types'
import type { QuotaProvider, ReadContext } from '../electron/features/quota/provider'
import {
  ReadingCache,
  backoffDelay,
  keepLastKnown,
  readingFingerprint,
  snapshotChanged,
  snapshotFingerprint
} from '../electron/features/quota/cache'
import { makeReading, makeWindow } from '../electron/features/quota/util'

const NOWHERE = '/definitely/not/a/real/path/for/ledge-tests'

function fakePlatform(overrides: Partial<PlatformAdapter> = {}): PlatformAdapter {
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
    readSecret: async () => ({ ok: false as const, reason: 'not-found' as const }),
    runCommand: async () => ({ ok: false, stdout: '', stderr: '', code: 1 }),
    which: async () => null,
    paths: {
      appData: () => NOWHERE,
      claudeHome: () => NOWHERE,
      codexHome: () => NOWHERE,
      cursorGlobalStorage: () => NOWHERE,
      openCodeAuth: () => `${NOWHERE}/auth.json`,
      grokHome: () => NOWHERE
    }
  }
  return { ...base, ...overrides } as unknown as PlatformAdapter
}

function ctxAt(now: number): ReadContext {
  return { platform: fakePlatform(), alertThreshold: 80, now }
}

function okReading(providerId: string, now: number, session: number, weekly: number): QuotaReading {
  return makeReading({
    providerId,
    displayName: providerId,
    state: 'ok',
    session: makeWindow('5h session', session, null),
    weekly: makeWindow('Weekly', weekly, null),
    now,
    alertThreshold: 80
  })
}

function failedReading(providerId: string, now: number, message: string): QuotaReading {
  return makeReading({
    providerId,
    displayName: providerId,
    state: 'error',
    message,
    now,
    alertThreshold: 80
  })
}

const START = Date.parse('2026-08-31T10:00:00.000Z')

describe('ReadingCache', () => {
  let cache: ReadingCache

  beforeEach(() => {
    cache = new ReadingCache()
  })

  it('is single-flight and caches within the provider TTL', async () => {
    let calls = 0
    const provider: QuotaProvider = {
      id: 'test_single_flight',
      displayName: 'Single flight',
      ttlMs: 60_000,
      read: async (ctx) => {
        calls += 1
        await new Promise((resolve) => setTimeout(resolve, 10))
        return okReading('test_single_flight', ctx.now, 20, 10)
      }
    }

    const [first, second] = await Promise.all([
      cache.read(provider, ctxAt(1000)),
      cache.read(provider, ctxAt(1000))
    ])
    const cached = await cache.read(provider, ctxAt(2000))

    expect(calls).toBe(1)
    expect(first!.observedAt).toBe(second!.observedAt)
    expect(cached.ringPercent).toBe(20)
  })

  it('backs off after a failed read instead of polling every cycle', async () => {
    let calls = 0
    const provider: QuotaProvider = {
      id: 'test_backoff',
      displayName: 'Backoff',
      ttlMs: 60_000,
      read: async (ctx) => {
        calls += 1
        return makeReading({
          providerId: 'test_backoff',
          displayName: 'Backoff',
          state: 'not-installed',
          message: 'nope',
          now: ctx.now,
          alertThreshold: 80
        })
      }
    }

    await cache.read(provider, ctxAt(1000))
    await cache.read(provider, ctxAt(2000))
    expect(calls).toBe(1)

    await cache.read(provider, ctxAt(61_001))
    expect(calls).toBe(2)
  })

  it('force bypasses the TTL', async () => {
    let calls = 0
    const provider: QuotaProvider = {
      id: 'test_force',
      displayName: 'Force',
      ttlMs: 60_000,
      read: async (ctx) => {
        calls += 1
        return okReading('test_force', ctx.now, 5, 5)
      }
    }
    await cache.read(provider, ctxAt(1000))
    await cache.read(provider, ctxAt(1001))
    expect(calls).toBe(1)
    await cache.read(provider, ctxAt(1002), { force: true })
    expect(calls).toBe(2)
  })

  it('converts a throwing provider into an error reading rather than rejecting', async () => {
    const provider: QuotaProvider = {
      id: 'test_throws',
      displayName: 'Throws',
      ttlMs: 60_000,
      read: async () => {
        throw new Error('boom')
      }
    }
    const reading = await cache.read(provider, ctxAt(1000))
    expect(reading.state).toBe('error')
    expect(reading.ringPercent).toBeNull()
    // The thrown message must not leak through verbatim.
    expect(reading.message).not.toContain('boom')
  })

  it('doubles the delay per consecutive failure and caps it', () => {
    expect(backoffDelay(60_000, 1)).toBe(60_000)
    expect(backoffDelay(60_000, 2)).toBe(120_000)
    expect(backoffDelay(60_000, 3)).toBe(240_000)
    expect(backoffDelay(60_000, 10)).toBe(5 * 60 * 1000)
    // A zero-TTL provider (manual custom entry) never waits.
    expect(backoffDelay(0, 4)).toBe(0)
  })

  it('resets the failure count once a read succeeds', async () => {
    let ok = false
    const provider: QuotaProvider = {
      id: 'test_recover',
      displayName: 'Recover',
      ttlMs: 60_000,
      read: async (ctx) =>
        ok
          ? okReading('test_recover', ctx.now, 12, 12)
          : failedReading('test_recover', ctx.now, 'offline')
    }
    await cache.read(provider, ctxAt(1000))
    expect(cache.failureCount('test_recover')).toBe(1)
    ok = true
    await cache.read(provider, ctxAt(2000), { force: true })
    expect(cache.failureCount('test_recover')).toBe(0)
  })
})

describe('keepLastKnown', () => {
  const known = [okReading('codex', START, 42, 30)]

  it('preserves a clearly marked recent reading when a refresh fails', () => {
    const next = [failedReading('codex', START + 1000, 'offline')]
    const merged = keepLastKnown(known, next, START + 60_000, 300_000)

    expect(merged[0]!.ringPercent).toBe(42)
    expect(merged[0]!.stale).toBe(true)
    expect(merged[0]!.message).toBe('offline')
    // Age is derivable from observedAt, which is preserved from the original
    // reading rather than being bumped to the retry time.
    expect(START + 60_000 - Date.parse(merged[0]!.observedAt)).toBe(60_000)
  })

  it('expires a stale reading after its TTL', () => {
    const next = [failedReading('codex', START + 300_001, 'offline')]
    const merged = keepLastKnown(known, next, START + 300_001, 300_000)

    expect(merged[0]!.state).toBe('error')
    expect(merged[0]!.ringPercent).toBeNull()
    expect(merged[0]!.stale).toBe(false)
  })

  it('defaults to the shared STALE_TTL_MS', () => {
    const next = [failedReading('codex', START, 'offline')]
    expect(keepLastKnown(known, next, START + STALE_TTL_MS - 1)[0]!.stale).toBe(true)
    expect(keepLastKnown(known, next, START + STALE_TTL_MS + 1)[0]!.stale).toBe(false)
  })

  it('clears stale state when fresh data arrives', () => {
    const stale = [{ ...known[0]!, stale: true }]
    const fresh = [okReading('codex', START + 1000, 43, 30)]
    const merged = keepLastKnown(stale, fresh, START + 1000, 300_000)

    expect(merged[0]!.stale).toBe(false)
    expect(merged[0]!.ringPercent).toBe(43)
    expect(readingFingerprint(known[0]!)).not.toBe(readingFingerprint(merged[0]!))
  })

  it('never retains one failure behind another', () => {
    const previousFailure = [failedReading('codex', START, 'first')]
    const next = [failedReading('codex', START + 1000, 'second')]
    const merged = keepLastKnown(previousFailure, next, START + 1000, 300_000)

    expect(merged[0]!.message).toBe('second')
    expect(merged[0]!.stale).toBe(false)
  })

  it('passes through providers with no previous reading', () => {
    const next = [failedReading('grok', START, 'offline')]
    const merged = keepLastKnown(known, next, START, 300_000)
    expect(merged).toHaveLength(1)
    expect(merged[0]!.providerId).toBe('grok')
    expect(merged[0]!.stale).toBe(false)
  })
})

describe('fingerprints', () => {
  function snap(readings: QuotaReading[], lastUpdated: string): QuotaSnapshot {
    return { readings, lastUpdated }
  }

  it('ignores lastUpdated so an unchanged snapshot does not trigger a push', () => {
    const a = snap([okReading('codex', START, 42, 30)], '2026-08-31T10:00:00.000Z')
    const b = snap([okReading('codex', START + 60_000, 42, 30)], '2026-08-31T10:01:00.000Z')
    expect(snapshotFingerprint(a)).toBe(snapshotFingerprint(b))
    expect(snapshotChanged(a, b)).toBe(false)
  })

  it('changes when a percentage, a state or staleness changes', () => {
    const base = snap([okReading('codex', START, 42, 30)], '2026-08-31T10:00:00.000Z')
    const movedPercent = snap([okReading('codex', START, 43, 30)], '2026-08-31T10:00:00.000Z')
    const wentStale = snap(
      [{ ...okReading('codex', START, 42, 30), stale: true }],
      '2026-08-31T10:00:00.000Z'
    )
    const failed = snap([failedReading('codex', START, 'offline')], '2026-08-31T10:00:00.000Z')

    expect(snapshotChanged(base, movedPercent)).toBe(true)
    expect(snapshotChanged(base, wentStale)).toBe(true)
    expect(snapshotChanged(base, failed)).toBe(true)
  })

  it('treats a missing snapshot as changed', () => {
    expect(snapshotFingerprint(null)).toBe('')
    expect(snapshotChanged(null, snap([okReading('codex', START, 1, 1)], 'x'))).toBe(true)
  })
})
