/**
 * DeepSeek (balance-shaped) and the http custom mode.
 *
 * The parse is exercised as a pure function so no real request is made; the
 * http custom mode mocks `httpsRequest` so the dot-path walk and the non-https
 * guard are tested without touching the network.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformAdapter } from '../electron/platform/types'
import type { ReadContext } from '../electron/features/quota/provider'
import type { CustomProviderConfig } from '../shared/types/settings'

// Mock the one HTTPS client so the http custom mode and deepseek never open a
// socket. `httpMock` is set per test; the non-https guard returns before it is
// ever consulted.
const httpMock = vi.fn()
vi.mock('../electron/features/quota/http', () => ({
  httpsRequest: (...args: unknown[]) => httpMock(...args),
  HttpError: class HttpError extends Error {},
  MAX_BODY_BYTES: 1_000_000,
  DEFAULT_TIMEOUT_MS: 10_000
}))

const { parseDeepseekBalance, deepseekProvider } = await import(
  '../electron/features/quota/providers/deepseek'
)
const { createCustomProvider } = await import('../electron/features/quota/providers/custom')

// A minimal ReadContext — neither the http mode nor deepseek touches the
// platform beyond what `makeReading` needs (now, alertThreshold).
function ctx(now = 1000): ReadContext {
  return {
    platform: {} as unknown as PlatformAdapter,
    alertThreshold: 80,
    now
  }
}

function customConfig(overrides: Partial<CustomProviderConfig> = {}): CustomProviderConfig {
  return {
    id: 'custom_http',
    name: 'Relay',
    mode: 'http',
    shape: 'percent',
    command: '',
    url: 'https://gateway.example.com/quota',
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
  httpMock.mockReset()
})

describe('parseDeepseekBalance', () => {
  it('reads the first balance_info into a QuotaBalance of string amounts', () => {
    const balance = parseDeepseekBalance({
      is_available: true,
      balance_infos: [
        {
          currency: 'CNY',
          total_balance: '110.00',
          granted_balance: '10.00',
          topped_up_balance: '100.00'
        },
        // A second currency block must be ignored — only the first is used.
        { currency: 'USD', total_balance: '15.00' }
      ]
    })

    expect(balance).not.toBeNull()
    expect(balance!.currency).toBe('CNY')
    expect(balance!.totalBalance).toBe('110.00')
    expect(balance!.grantedBalance).toBe('10.00')
    expect(balance!.toppedUpBalance).toBe('100.00')
    expect(balance!.isAvailable).toBe(true)
    // Money must never become a float.
    expect(typeof balance!.totalBalance).toBe('string')
    expect(typeof balance!.grantedBalance).toBe('string')
  })

  it('stringifies a numeric amount rather than keeping it a number', () => {
    const balance = parseDeepseekBalance({
      is_available: false,
      balance_infos: [{ currency: 'USD', total_balance: 42.5 }]
    })
    expect(balance!.totalBalance).toBe('42.5')
    expect(typeof balance!.totalBalance).toBe('string')
    expect(balance!.grantedBalance).toBeNull()
    expect(balance!.isAvailable).toBe(false)
  })

  it('returns null for an unrecognised or empty shape', () => {
    expect(parseDeepseekBalance({})).toBeNull()
    expect(parseDeepseekBalance({ balance_infos: [] })).toBeNull()
    // Missing total: nothing to show, so no invented zero.
    expect(parseDeepseekBalance({ balance_infos: [{ currency: 'USD' }] })).toBeNull()
    // Unknown currency is rejected rather than coerced.
    expect(
      parseDeepseekBalance({ balance_infos: [{ currency: 'EUR', total_balance: '5' }] })
    ).toBeNull()
  })
})

describe('deepseek provider credential', () => {
  const saved = {
    key: process.env.DEEPSEEK_API_KEY,
    dir: process.env.DEEPSEEK_CONFIG_DIR
  }
  beforeAll(() => {
    delete process.env.DEEPSEEK_API_KEY
    // A directory that does not exist, so the on-disk config lookup misses.
    process.env.DEEPSEEK_CONFIG_DIR = '/ledge-deepseek-tests-nonexistent'
  })
  afterAll(() => {
    if (saved.key === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = saved.key
    if (saved.dir === undefined) delete process.env.DEEPSEEK_CONFIG_DIR
    else process.env.DEEPSEEK_CONFIG_DIR = saved.dir
  })

  it('is logged-out with no key, and never makes a request', async () => {
    const reading = await deepseekProvider.read(ctx())
    expect(reading.state).toBe('logged-out')
    expect(reading.message).toMatch(/DEEPSEEK_API_KEY/)
    expect(reading.ringPercent).toBeNull()
    expect(reading.balance ?? null).toBeNull()
    expect(httpMock).not.toHaveBeenCalled()
  })

  it('reads a live balance when a key is present', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-deepseek-test'
    httpMock.mockResolvedValue({
      status: 200,
      json: {
        is_available: true,
        balance_infos: [{ currency: 'USD', total_balance: '7.77', granted_balance: '0' }]
      }
    })
    const reading = await deepseekProvider.read(ctx())
    delete process.env.DEEPSEEK_API_KEY

    expect(reading.state).toBe('ok')
    expect(reading.balance?.totalBalance).toBe('7.77')
    expect(reading.balance?.currency).toBe('USD')
    // Balance-shaped: no ring.
    expect(reading.ringPercent).toBeNull()
    expect(reading.severity).toBe('ok')
  })

  it('maps 401 to logged-out', async () => {
    process.env.DEEPSEEK_API_KEY = 'sk-deepseek-test'
    httpMock.mockResolvedValue({ status: 401, json: null })
    const reading = await deepseekProvider.read(ctx())
    delete process.env.DEEPSEEK_API_KEY
    expect(reading.state).toBe('logged-out')
  })
})

describe('custom http mode', () => {
  it('reads a value at the configured dot-path', async () => {
    httpMock.mockResolvedValue({ status: 200, json: { data: { quota: 55 } } })
    const provider = createCustomProvider(customConfig({ jsonPath: 'data.quota' }))
    const reading = await provider.read(ctx())

    expect(reading.state).toBe('ok')
    expect(reading.ringPercent).toBe(55)
    // The token, when set, rides only in the request header.
    expect(httpMock).toHaveBeenCalledTimes(1)
  })

  it('emits a balance when the shape is balance, keeping the amount a string', async () => {
    httpMock.mockResolvedValue({ status: 200, json: { wallet: { usd: '12.34' } } })
    const provider = createCustomProvider(
      customConfig({ shape: 'balance', jsonPath: 'wallet.usd', currency: 'USD' })
    )
    const reading = await provider.read(ctx())

    expect(reading.state).toBe('ok')
    expect(reading.balance?.totalBalance).toBe('12.34')
    expect(typeof reading.balance?.totalBalance).toBe('string')
    expect(reading.ringPercent).toBeNull()
  })

  it('rejects a non-https URL without making a request', async () => {
    const provider = createCustomProvider(customConfig({ url: 'http://gateway.example.com/quota' }))
    const reading = await provider.read(ctx())

    expect(reading.state).toBe('error')
    expect(reading.message).toMatch(/https/)
    expect(httpMock).not.toHaveBeenCalled()
  })

  it('sends the Bearer token in the header, never in a message', async () => {
    httpMock.mockResolvedValue({ status: 200, json: { quota: 20 } })
    const provider = createCustomProvider(
      customConfig({ token: 'secret-token-value', jsonPath: 'quota' })
    )
    const reading = await provider.read(ctx())

    expect(reading.state).toBe('ok')
    const [[options]] = httpMock.mock.calls as [[{ headers: Record<string, string> }]]
    expect(options.headers.Authorization).toBe('Bearer secret-token-value')
    expect(reading.message ?? '').not.toContain('secret-token-value')
  })

  it('maps 401 to logged-out', async () => {
    httpMock.mockResolvedValue({ status: 401, json: null })
    const provider = createCustomProvider(customConfig({ jsonPath: 'quota' }))
    const reading = await provider.read(ctx())
    expect(reading.state).toBe('logged-out')
  })
})
