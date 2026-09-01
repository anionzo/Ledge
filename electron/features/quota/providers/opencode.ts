/**
 * OpenCode Zen quota, ported from `getOpenCodeUsage` in scrapers.js.
 *
 * UNDOCUMENTED ENDPOINT. `https://opencode.ai/zen/go/v1/usage` is the usage
 * route the OpenCode Go client uses. It is not a documented public API and
 * the `usage` object's window names have already changed once (`rolling` vs
 * `rollingUsage`), which is why every lookup below tries both spellings.
 *
 * The credential is a plain JSON file — `platform.paths.openCodeAuth()`
 * resolves `$XDG_DATA_HOME/opencode/auth.json` or the per-OS default — so
 * there is no credential-store path here.
 */
import fs from 'node:fs'
import type { QuotaProvider, ReadContext } from '../provider'
import type { QuotaReading, QuotaState } from '../../../../shared/types/quota'
import { httpsRequest } from '../http'
import {
  asRecord,
  coercePercent,
  errorMessage,
  makeReading,
  makeWindow,
  parseJsonSafe,
  recordAt,
  toIsoInstant
} from '../util'

const USAGE_URL = 'https://opencode.ai/zen/go/v1/usage'
const ID = 'opencode'
const DISPLAY_NAME = 'OpenCode'

interface WindowValues {
  percent: number | null
  resetsAt: string | null
}

function reading(
  ctx: ReadContext,
  state: QuotaState,
  message: string | null,
  session?: WindowValues,
  plan?: WindowValues
): QuotaReading {
  return makeReading({
    providerId: ID,
    displayName: DISPLAY_NAME,
    modelName: 'OpenCode Go',
    state,
    message,
    session: session ? makeWindow('Rolling window', session.percent, session.resetsAt) : null,
    weekly: plan ? makeWindow('Plan period', plan.percent, plan.resetsAt) : null,
    now: ctx.now,
    alertThreshold: ctx.alertThreshold
  })
}

/**
 * Pull a usable bearer credential out of one `auth.json` entry.
 *
 * Upstream stores two different shapes under the same `opencode-go` /
 * `opencode` keys: `{type:'api', key}` for a plain API key, and
 * `{type:'oauth', access, refresh, expires}` for a signed-in OAuth session —
 * which has no `key` field at all. Reading only `.key` therefore reported
 * every OAuth user as logged out. An OAuth `access` token is a bearer
 * credential exactly like the API key is, so it is used the same way here.
 * `refresh` is deliberately not used: this provider has no token-refresh
 * flow, so an expired `access` token simply surfaces as the ordinary 401
 * handled below rather than a silently wrong reading.
 */
function credentialFrom(entry: Record<string, unknown> | null): string | null {
  if (!entry) return null
  const key = entry.key
  if (typeof key === 'string' && key.trim()) return key.trim()
  if (entry.type === 'oauth') {
    const access = entry.access
    if (typeof access === 'string' && access.trim()) return access.trim()
  }
  return null
}

/**
 * Take the first window that yields a usable percentage. Keys are tried in
 * order because the API has used more than one name for the same window.
 */
function pickWindow(usage: unknown, keys: readonly string[]): WindowValues | null {
  for (const key of keys) {
    const win = recordAt(usage, key)
    if (!win) continue
    const percent = coercePercent(win.percent ?? win.usagePercent)
    if (percent == null) continue
    return { percent, resetsAt: toIsoInstant(win.resetsAt ?? win.resetAt) }
  }
  return null
}

async function read(ctx: ReadContext): Promise<QuotaReading> {
  let authPath = ''
  try {
    authPath = ctx.platform.paths.openCodeAuth()
  } catch (err) {
    return reading(ctx, 'error', errorMessage(err, 'Could not locate the OpenCode auth file'))
  }

  if (!authPath || !fs.existsSync(authPath)) {
    return reading(ctx, 'not-installed', 'OpenCode is not installed on this machine')
  }

  let key: string | null = null
  try {
    const doc = parseJsonSafe(fs.readFileSync(authPath, 'utf8'))
    const go = recordAt(doc, 'opencode-go')
    const legacy = recordAt(doc, 'opencode')
    key = credentialFrom(go) ?? credentialFrom(legacy)
  } catch {
    // Never echo the file; it may hold an API key or an OAuth access token.
    return reading(ctx, 'logged-out', 'auth.json unreadable — connect OpenCode Go')
  }

  if (!key) {
    return reading(ctx, 'logged-out', 'No OpenCode Go credential — connect OpenCode Go')
  }

  try {
    const res = await httpsRequest({
      url: USAGE_URL,
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
        'User-Agent': 'Ledge-usage-reader/1.0 OpenCode/1.0'
      },
      timeoutMs: 12_000
    })

    if (res.status === 401) {
      return reading(ctx, 'logged-out', 'API key rejected — reconnect OpenCode Go')
    }
    if (res.status === 403) {
      return reading(ctx, 'error', 'Usage blocked for this account (HTTP 403)')
    }

    const usage = asRecord(res.json)?.usage
    const session = pickWindow(usage, ['rolling', 'rollingUsage'])
    const weekly = pickWindow(usage, ['weekly', 'weeklyUsage'])
    const monthly = pickWindow(usage, ['monthly', 'monthlyUsage'])
    // A plan can be capped weekly, monthly or both; the tighter of the two is
    // the one that will actually stop the user, so that is what is shown.
    const plan =
      monthly &&
      (!weekly ||
        (monthly.percent ?? -1) > (weekly.percent ?? -1))
        ? monthly
        : weekly

    if (res.status !== 200 || (!session && !plan)) {
      return reading(ctx, 'error', `Usage endpoint unavailable (HTTP ${res.status})`)
    }

    return reading(
      ctx,
      'ok',
      null,
      session ?? { percent: null, resetsAt: null },
      plan ?? { percent: null, resetsAt: null }
    )
  } catch (err) {
    return reading(ctx, 'error', errorMessage(err, 'OpenCode usage read failed'))
  }
}

export const openCodeProvider: QuotaProvider = {
  id: ID,
  displayName: DISPLAY_NAME,
  ttlMs: 60_000,
  read
}
