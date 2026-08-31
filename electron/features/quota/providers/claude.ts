/**
 * Claude Code quota, ported from `getClaudeUsage` in agent-notch's scrapers.js.
 *
 * UNDOCUMENTED ENDPOINT. `https://api.anthropic.com/api/oauth/usage` is the
 * private endpoint the Claude Code CLI itself calls, gated behind the
 * `anthropic-beta: oauth-2025-04-20` header. It is not part of the public
 * Anthropic API, it is not versioned for third parties, and it can change or
 * disappear without notice. Every failure path below therefore degrades to a
 * stated reason rather than a guess.
 *
 * Cross-platform credential lookup — the main change from the original,
 * which was Windows-only:
 *
 *   - Windows and Linux: Claude Code writes `~/.claude/.credentials.json`.
 *   - macOS: it stores them in the login Keychain under the service name
 *     `Claude Code-credentials`.
 *
 * Claude Code also keeps a file fallback on macOS (it writes the same JSON to
 * `~/.claude/.credentials.json` when the Keychain is unavailable), so we try
 * the file FIRST on every OS and only fall back to `readSecret`. That
 * ordering is deliberate: reading a file is far cheaper than a Keychain
 * lookup, and on macOS it avoids provoking an OS authorisation prompt in the
 * common case where the file is already there.
 *
 * If the Keychain read is refused, the reading's state is `permission-required`
 * rather than `logged-out`, so the UI can offer a retry instead of telling the
 * user to sign in again when they are in fact already signed in.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { QuotaProvider, ReadContext } from '../provider'
import type { QuotaReading, QuotaState } from '../../../../shared/types/quota'
import { httpsRequest } from '../http'
import {
  accessExpired,
  arrayAt,
  asRecord,
  coercePercent,
  errorMessage,
  makeReading,
  makeWindow,
  parseJsonSafe,
  recordAt,
  toIsoInstant
} from '../util'

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const OAUTH_BETA = 'oauth-2025-04-20'
/** The endpoint rejects requests that do not look like the CLI. */
const USER_AGENT = 'claude-cli/2.1.246 (external, cli)'
/** Keychain service name Claude Code uses on macOS. */
const KEYCHAIN_SERVICE = 'Claude Code-credentials'

const ID = 'claude'
const DISPLAY_NAME = 'Claude Code'

interface ClaudeOauth {
  accessToken: string | null
  expiresAt: unknown
}

/**
 * Pull the OAuth block out of a credentials document.
 * Returns null when the document is present but not usable — never throws,
 * and never surfaces any part of the document in an error.
 */
function parseCredentials(raw: string | null): ClaudeOauth | null {
  const doc = parseJsonSafe(raw)
  const oauth = recordAt(doc, 'claudeAiOauth')
  if (!oauth) return null
  const accessToken = typeof oauth.accessToken === 'string' ? oauth.accessToken : null
  const refreshToken = typeof oauth.refreshToken === 'string' ? oauth.refreshToken : null
  if (!accessToken && !refreshToken) return null
  return { accessToken, expiresAt: oauth.expiresAt }
}

interface Window {
  percent: number | null
  resetsAt: string | null
}

export interface ClaudeWindows {
  session: Window
  weekly: Window
}

/**
 * The payload has been through two shapes. The current one is a `limits`
 * array keyed by `kind`; an older build returned `five_hour` / `seven_day`
 * objects. Both are read, newest first, because users on a pinned CLI version
 * still hit the old shape.
 */
export function parseClaudeWindows(payload: unknown): ClaudeWindows {
  const session: Window = { percent: null, resetsAt: null }
  const weekly: Window = { percent: null, resetsAt: null }

  for (const entry of arrayAt(payload, 'limits')) {
    const item = asRecord(entry)
    if (!item) continue
    const percent = coercePercent(item.percent ?? item.utilization)
    if (percent == null) continue
    if (item.kind === 'session') {
      session.percent = percent
      session.resetsAt = toIsoInstant(item.resets_at)
    } else if (item.kind === 'weekly_all') {
      weekly.percent = percent
      weekly.resetsAt = toIsoInstant(item.resets_at)
    }
  }

  const fiveHour = recordAt(payload, 'five_hour')
  if (session.percent == null && fiveHour) {
    session.percent = coercePercent(fiveHour.utilization ?? fiveHour.percent)
    session.resetsAt = toIsoInstant(fiveHour.resets_at)
  }
  const sevenDay = recordAt(payload, 'seven_day')
  if (weekly.percent == null && sevenDay) {
    weekly.percent = coercePercent(sevenDay.utilization ?? sevenDay.percent)
    weekly.resetsAt = toIsoInstant(sevenDay.resets_at)
  }
  return { session, weekly }
}

function reading(
  ctx: ReadContext,
  state: QuotaState,
  message: string | null,
  windows?: ClaudeWindows
): QuotaReading {
  return makeReading({
    providerId: ID,
    displayName: DISPLAY_NAME,
    modelName: DISPLAY_NAME,
    state,
    message,
    session: windows
      ? makeWindow('5h session', windows.session.percent, windows.session.resetsAt)
      : null,
    weekly: windows ? makeWindow('Weekly', windows.weekly.percent, windows.weekly.resetsAt) : null,
    now: ctx.now,
    alertThreshold: ctx.alertThreshold
  })
}

async function read(ctx: ReadContext): Promise<QuotaReading> {
  let home = ''
  try {
    home = ctx.platform.paths.claudeHome()
  } catch (err) {
    return reading(ctx, 'error', errorMessage(err, 'Could not locate the Claude config directory'))
  }
  const credPath = path.join(home, '.credentials.json')

  // 1. The file, on every OS. Cheap, and on macOS it avoids a Keychain prompt.
  let rawCredentials: string | null = null
  try {
    if (fs.existsSync(credPath)) rawCredentials = fs.readFileSync(credPath, 'utf8')
  } catch {
    // An unreadable file is not fatal — fall through to the credential store.
    rawCredentials = null
  }

  // 2. The OS credential store. This is where macOS keeps them by default.
  if (!rawCredentials) {
    const secret = await ctx.platform.readSecret({ service: KEYCHAIN_SERVICE })
    if (secret.ok) {
      rawCredentials = secret.value
    } else if (secret.reason === 'permission-denied') {
      // The user dismissed the Keychain prompt, or the app is not authorised.
      // This is recoverable: show a retry, not an empty slot.
      return reading(
        ctx,
        'permission-required',
        'Allow Ledge to read the Claude Code credential in your keychain, then retry'
      )
    }
  }

  if (!rawCredentials) {
    const installed = fs.existsSync(home)
    return installed
      ? reading(ctx, 'logged-out', 'No OAuth credentials — sign in with: claude auth login')
      : reading(ctx, 'not-installed', 'Claude Code is not installed on this machine')
  }

  const oauth = parseCredentials(rawCredentials)
  if (!oauth) {
    return reading(
      ctx,
      'logged-out',
      'OAuth credentials unreadable — sign in with: claude auth login'
    )
  }
  if (!oauth.accessToken || accessExpired(oauth.expiresAt, ctx.now)) {
    // The CLI refreshes its own token; we never do it on the user's behalf.
    return reading(ctx, 'logged-out', 'OAuth token expired — open Claude Code to refresh sign-in')
  }

  try {
    const res = await httpsRequest({
      url: USAGE_URL,
      headers: {
        Authorization: `Bearer ${oauth.accessToken}`,
        Accept: 'application/json',
        'anthropic-beta': OAUTH_BETA,
        'anthropic-version': '2023-06-01',
        'x-app': 'cli',
        'User-Agent': USER_AGENT
      },
      timeoutMs: 10_000
    })

    if (res.status === 401 || res.status === 403) {
      return reading(ctx, 'logged-out', 'OAuth token rejected — sign in with: claude auth login')
    }
    if (res.status !== 200 || !res.json) {
      return reading(ctx, 'error', `Usage endpoint unavailable (HTTP ${res.status})`)
    }

    const windows = parseClaudeWindows(res.json)
    if (windows.session.percent == null && windows.weekly.percent == null) {
      // The endpoint answered but in a shape we do not recognise. Report that
      // rather than showing a zero.
      return reading(ctx, 'error', 'Usage data in an unrecognised shape')
    }
    return reading(ctx, 'ok', null, windows)
  } catch (err) {
    return reading(ctx, 'error', errorMessage(err, 'Claude usage read failed'))
  }
}

export const claudeProvider: QuotaProvider = {
  id: ID,
  displayName: DISPLAY_NAME,
  ttlMs: 60_000,
  read
}
