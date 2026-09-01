/**
 * Codex (OpenAI) quota, ported from `getCodexUsage` in scrapers.js.
 *
 * UNDOCUMENTED ENDPOINT. `https://chatgpt.com/backend-api/wham/usage` is an
 * internal ChatGPT backend route used by the Codex CLI. It is not a published
 * API, has no stability guarantee, and the `ChatGPT-Account-Id` header it
 * wants is undocumented too. Expect it to break.
 *
 * Credentials are a plain file on every OS — `~/.codex/auth.json`, or
 * `$CODEX_HOME/auth.json`, which `platform.paths.codexHome()` resolves. There
 * is no keychain path here, so unlike Claude this provider is the same shape
 * on all three platforms.
 */
import fs from 'node:fs'
import path from 'node:path'
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

const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'
const ID = 'codex'
const DISPLAY_NAME = 'Codex'

interface WindowValues {
  label: string
  percent: number | null
  resetsAt: string | null
}

/** Seconds, not milliseconds — this is the unit `limit_window_seconds` uses. */
const FIVE_HOURS_SECONDS = 5 * 60 * 60
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60

/**
 * Label a rate-limit window from the length the API itself reports, never
 * from which slot ("primary_window"/"secondary_window") it arrived in.
 *
 * The API hands back two anonymous slots, and which one carries the 5-hour
 * session versus the 7-day window has been observed to swap. Hard-coding
 * "primary = 5h session, secondary = Weekly" mislabels whichever window
 * lands in the other slot — `pace.ts`'s `windowLengthMs` reads this label
 * back out to pick a length, so the mislabel does not stop at the detail
 * sheet: a 7-day window measured as 5 hours clamps `elapsedFraction` to 0
 * for days at a time, and any usage above the 5-point floor reads
 * permanently "hot".
 *
 * Only the two lengths Codex is known to ship get a name; a window whose
 * `limit_window_seconds` is missing, non-numeric, zero, or some other value
 * gets a generic label instead of an invented one. That label still shows
 * the real percentage — it just does not match any shape `windowLengthMs`
 * recognises, so the pace chip honestly comes back null rather than a
 * guessed threshold.
 */
export function windowLabel(limitWindowSeconds: unknown): string {
  const seconds =
    typeof limitWindowSeconds === 'number' ? limitWindowSeconds : Number(limitWindowSeconds)
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Usage window'
  if (seconds === FIVE_HOURS_SECONDS) return '5h session'
  if (seconds === SEVEN_DAYS_SECONDS) return 'Weekly'
  return 'Usage window'
}

function reading(
  ctx: ReadContext,
  state: QuotaState,
  message: string | null,
  modelName: string | null = DISPLAY_NAME,
  session?: WindowValues,
  weekly?: WindowValues
): QuotaReading {
  return makeReading({
    providerId: ID,
    displayName: DISPLAY_NAME,
    modelName,
    state,
    message,
    session: session ? makeWindow(session.label, session.percent, session.resetsAt) : null,
    weekly: weekly ? makeWindow(weekly.label, weekly.percent, weekly.resetsAt) : null,
    now: ctx.now,
    alertThreshold: ctx.alertThreshold
  })
}

async function read(ctx: ReadContext): Promise<QuotaReading> {
  let home = ''
  try {
    home = ctx.platform.paths.codexHome()
  } catch (err) {
    return reading(ctx, 'error', errorMessage(err, 'Could not locate the Codex config directory'))
  }
  const authPath = path.join(home, 'auth.json')

  if (!fs.existsSync(authPath)) {
    return fs.existsSync(home)
      ? reading(ctx, 'logged-out', 'No auth.json — sign in with: codex login')
      : reading(ctx, 'not-installed', 'Codex is not installed on this machine')
  }

  let accessToken: string | null = null
  let accountId: string | null = null
  try {
    const doc = parseJsonSafe(fs.readFileSync(authPath, 'utf8'))
    const tokens = recordAt(doc, 'tokens')
    accessToken = typeof tokens?.access_token === 'string' ? tokens.access_token : null
    accountId = typeof tokens?.account_id === 'string' ? tokens.account_id : null
  } catch {
    // Never echo the file's contents; the reason is enough.
    return reading(ctx, 'logged-out', 'auth.json unreadable — sign in with: codex login')
  }

  if (!accessToken) {
    return reading(ctx, 'logged-out', 'No access token — sign in with: codex login')
  }

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'User-Agent': 'Ledge-usage-reader/1.0'
    }
    if (accountId) headers['ChatGPT-Account-Id'] = accountId

    const res = await httpsRequest({ url: USAGE_URL, headers, timeoutMs: 10_000 })

    if (res.status === 401 || res.status === 403) {
      return reading(ctx, 'logged-out', 'OAuth token rejected — sign in with: codex login')
    }
    if (res.status !== 200 || !res.json) {
      return reading(ctx, 'error', `Usage endpoint unavailable (HTTP ${res.status})`)
    }

    const rateLimit = recordAt(res.json, 'rate_limit')
    const primary = asRecord(rateLimit?.primary_window) ?? {}
    const secondary = asRecord(rateLimit?.secondary_window) ?? {}
    // Both spellings have been observed in the wild across CLI versions.
    const sessionPercent = coercePercent(primary.used_percent ?? primary.usage_percent)
    const weeklyPercent = coercePercent(secondary.used_percent ?? secondary.usage_percent)

    const planRaw = asRecord(res.json)?.plan_type
    const modelName =
      typeof planRaw === 'string' && planRaw.trim()
        ? `${DISPLAY_NAME} · ${planRaw.trim().toUpperCase()}`
        : DISPLAY_NAME

    if (sessionPercent == null && weeklyPercent == null) {
      return reading(ctx, 'error', 'Usage data in an unrecognised shape', modelName)
    }

    return reading(
      ctx,
      'ok',
      null,
      modelName,
      {
        label: windowLabel(primary.limit_window_seconds),
        percent: sessionPercent,
        resetsAt: toIsoInstant(primary.reset_at)
      },
      {
        label: windowLabel(secondary.limit_window_seconds),
        percent: weeklyPercent,
        resetsAt: toIsoInstant(secondary.reset_at)
      }
    )
  } catch (err) {
    return reading(ctx, 'error', errorMessage(err, 'Codex usage read failed'))
  }
}

export const codexProvider: QuotaProvider = {
  id: ID,
  displayName: DISPLAY_NAME,
  ttlMs: 60_000,
  read
}
