/**
 * User-defined provider, ported from `getCustomUsage` in scrapers.js and
 * extended to three modes so one config can cover every self-hosted setup.
 *
 * Mode is an explicit discriminator on `CustomProviderConfig` now (the original
 * inferred it from whether `command` was set); an old config with no `mode` is
 * upgraded in `settings.ts`, and `resolveMode` here is the belt-and-braces
 * fallback for a config that reaches this function un-normalised:
 *
 *   - command: run it through `platform.runCommand`, parse stdout as JSON.
 *   - http:    GET a URL with an optional Bearer token, read one value out of
 *              the JSON body by dot-path. This is the important generalisation —
 *              it covers the whole gateway-relay family (Sub2API, new-api,
 *              one-api, one-hub, …) with a single reader instead of a bespoke
 *              provider per relay: they all expose "a number at a JSON path",
 *              differing only in host, header and path, which are exactly the
 *              three things this config supplies.
 *   - manual:  the numbers (percent) or balance the user typed in Settings.
 *
 * A custom source is `percent`-shaped (a used-percentage window, drawn as a
 * ring) or `balance`-shaped (money left, drawn as a balance bar) per
 * `config.shape`, matching DeepSeek's split.
 *
 * Secrets discipline, unchanged in spirit from the original: the command, its
 * stdout, the URL's token and the response body are all potentially
 * credential-bearing. None is ever logged or echoed into a message — errors
 * state what failed, never what was read.
 */
import type { QuotaProvider, ReadContext } from '../provider'
import type { QuotaBalance, QuotaReading, QuotaState } from '../../../../shared/types/quota'
import type { CommandResult } from '../../../platform/types'
import type {
  CustomProviderConfig,
  CustomProviderMode
} from '../../../../shared/types/settings'
import {
  asRecord,
  coercePercent,
  errorMessage,
  makeReading,
  makeWindow,
  moneyString,
  parseJsonSafe,
  toIsoInstant,
  valueAtPath
} from '../util'
import { httpsRequest } from '../http'

/** Custom commands get a short leash; the gauge refreshes every minute. */
const COMMAND_TIMEOUT_MS = 5_000
const HTTP_TIMEOUT_MS = 10_000

interface WindowValues {
  percent: number | null
  resetsAt: string | null
}

function reading(
  config: CustomProviderConfig,
  ctx: ReadContext,
  state: QuotaState,
  message: string | null,
  displayName: string,
  session?: WindowValues,
  weekly?: WindowValues
): QuotaReading {
  return makeReading({
    providerId: config.id,
    displayName,
    modelName: null,
    state,
    message,
    session: session ? makeWindow('Session', session.percent, session.resetsAt) : null,
    weekly: weekly ? makeWindow('Weekly', weekly.percent, weekly.resetsAt) : null,
    now: ctx.now,
    alertThreshold: ctx.alertThreshold
  })
}

/** A balance-shaped ok reading — no windows, no ring, a balance bar instead. */
function balanceReading(
  config: CustomProviderConfig,
  ctx: ReadContext,
  displayName: string,
  balance: QuotaBalance
): QuotaReading {
  const base = reading(config, ctx, 'ok', null, displayName)
  return { ...base, balance }
}

function baseName(config: CustomProviderConfig): string {
  return config.name.trim() || 'Custom CLI'
}

async function readCommand(
  config: CustomProviderConfig,
  ctx: ReadContext,
  command: string
): Promise<QuotaReading> {
  const name = baseName(config)
  let result: CommandResult
  try {
    result = await ctx.platform.runCommand(command, { timeoutMs: COMMAND_TIMEOUT_MS })
  } catch (err) {
    return reading(config, ctx, 'error', errorMessage(err, 'Custom command failed'), name)
  }

  if (!result.ok) {
    // stderr may contain anything, including credentials the command printed.
    return reading(
      config,
      ctx,
      'error',
      `Custom command exited with code ${result.code ?? 'unknown'}`,
      name
    )
  }

  const parsed = asRecord(parseJsonSafe(result.stdout))
  if (!parsed) {
    return reading(
      config,
      ctx,
      'error',
      'Custom command did not print JSON — expected {"sessionUsedPercent":n,"weeklyUsedPercent":n}',
      name
    )
  }

  const session = coercePercent(parsed.sessionUsedPercent ?? parsed.session)
  const weekly = coercePercent(parsed.weeklyUsedPercent ?? parsed.weekly)
  if (session == null && weekly == null) {
    return reading(
      config,
      ctx,
      'error',
      'Custom command JSON had no usable session or weekly percentage',
      name
    )
  }

  // A command may override the label and supply reset instants. Unlike the
  // original, resets are ISO 8601 instants rather than pre-formatted text,
  // because `QuotaWindow.resetsAt` is an instant and the UI does the wording.
  const label = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : name
  return reading(
    config,
    ctx,
    'ok',
    null,
    label,
    { percent: session, resetsAt: toIsoInstant(parsed.sessionResetsAt) },
    { percent: weekly, resetsAt: toIsoInstant(parsed.weeklyResetsAt) }
  )
}

/**
 * http mode: GET the URL, read one value by dot-path, shape it as a percentage
 * window or a balance. Generalises every JSON gateway relay — see the file
 * header — rather than special-casing each one.
 */
async function readHttp(config: CustomProviderConfig, ctx: ReadContext): Promise<QuotaReading> {
  const name = baseName(config)
  const url = config.url.trim()
  if (!url) {
    return reading(config, ctx, 'error', 'No URL set for this HTTP source — add one in Settings', name)
  }
  // Enforce https up front, with a clean message, rather than only relying on
  // httpsRequest to throw: a bearer token must never leave over cleartext, and
  // a redirect or typo to http:// is a config error, not a transient one.
  let isHttps = false
  try {
    isHttps = new URL(url).protocol === 'https:'
  } catch {
    return reading(config, ctx, 'error', 'HTTP source URL is not a valid URL', name)
  }
  if (!isHttps) {
    return reading(config, ctx, 'error', 'HTTP source must use https', name)
  }

  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = config.token.trim()
  // The token is only ever placed in a request header, never logged or echoed.
  if (token) headers.Authorization = `Bearer ${token}`

  let json: unknown
  try {
    const res = await httpsRequest({ url, headers, timeoutMs: HTTP_TIMEOUT_MS })
    if (res.status === 401 || res.status === 403) {
      return reading(config, ctx, 'logged-out', 'HTTP source rejected the token', name)
    }
    if (res.status !== 200 || res.json == null) {
      return reading(config, ctx, 'error', `HTTP source unavailable (HTTP ${res.status})`, name)
    }
    json = res.json
  } catch (err) {
    return reading(config, ctx, 'error', errorMessage(err, 'HTTP source read failed'), name)
  }

  const jsonPath = config.jsonPath.trim()
  const value = jsonPath ? valueAtPath(json, jsonPath) : json

  if (config.shape === 'balance') {
    const total = moneyString(value)
    if (total == null) {
      return reading(config, ctx, 'error', `No balance value at "${jsonPath || '(root)'}"`, name)
    }
    // A generic relay does not report an availability flag, so infer it from
    // the presence of a balance: if we could read one, treat the account as
    // usable. Amount stays a string throughout — never parsed into a float.
    return balanceReading(config, ctx, name, {
      currency: config.currency,
      totalBalance: total,
      grantedBalance: null,
      toppedUpBalance: null,
      isAvailable: true
    })
  }

  const percent = coercePercent(value)
  if (percent == null) {
    return reading(config, ctx, 'error', `No usable percentage at "${jsonPath || '(root)'}"`, name)
  }
  return reading(config, ctx, 'ok', null, name, { percent, resetsAt: null })
}

function readManual(config: CustomProviderConfig, ctx: ReadContext): QuotaReading {
  const name = baseName(config)

  if (config.shape === 'balance') {
    const total = moneyString(config.manualBalance)
    if (total == null) {
      return reading(config, ctx, 'error', 'No balance yet — enter a balance in Settings', name)
    }
    return balanceReading(config, ctx, name, {
      currency: config.currency,
      totalBalance: total,
      grantedBalance: null,
      toppedUpBalance: null,
      isAvailable: true
    })
  }

  const session = coercePercent(config.manualSessionPercent)
  const weekly = coercePercent(config.manualWeeklyPercent)
  if (session == null && weekly == null) {
    return reading(
      config,
      ctx,
      'error',
      'No quota source yet — set a percentage in Settings or add a command',
      name
    )
  }
  return reading(
    config,
    ctx,
    'ok',
    null,
    name,
    { percent: session, resetsAt: null },
    { percent: weekly, resetsAt: null }
  )
}

/**
 * Resolve the effective mode. Trusts an explicit `config.mode`, but a `command`
 * mode with an empty command is really manual (nothing to run), and a config
 * that predates the field falls back to the original inference.
 */
function resolveMode(config: CustomProviderConfig): CustomProviderMode {
  const mode = config.mode
  if (mode === 'http') return 'http'
  if (mode === 'command') return config.command.trim() ? 'command' : 'manual'
  if (mode === 'manual') return 'manual'
  // Un-normalised legacy config: infer from whether a command is set.
  return config.command.trim() ? 'command' : 'manual'
}

/**
 * Build a provider for one user-configured entry.
 *
 * Manual entries get `ttlMs: 0` so an edit in Settings shows up on the next
 * refresh: there is nothing to rate-limit, the value is already in memory, and
 * caching it would mean the gauge disagreed with the settings window. Command
 * and http entries reach out, so they get the normal minute TTL.
 */
export function createCustomProvider(config: CustomProviderConfig): QuotaProvider {
  const mode = resolveMode(config)
  return {
    id: config.id,
    displayName: baseName(config),
    ttlMs: mode === 'manual' ? 0 : 60_000,
    read: (ctx: ReadContext): Promise<QuotaReading> => {
      if (mode === 'command') return readCommand(config, ctx, config.command.trim())
      if (mode === 'http') return readHttp(config, ctx)
      return Promise.resolve(readManual(config, ctx))
    }
  }
}
