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
  /**
   * Which cap `weekly` actually reflects — "Weekly", "Weekly (Opus)" or
   * "Weekly (Sonnet)" — so the number stays attributable to a specific limit
   * instead of showing an anonymous "Weekly" that could be any of the three.
   */
  weeklyLabel: string
}

/**
 * "weekly_opus" -> "Opus". Presentational only: the kind is a machine name and
 * the label sits next to a percentage in a narrow row, so it is title-cased
 * and stripped of its prefix rather than shown raw.
 */
function weeklyKindName(kind: string): string {
  const rest = kind.replace(/^weekly[_-]?/, '').replace(/[_-]+/g, ' ').trim()
  if (!rest) return 'all'
  return rest.charAt(0).toUpperCase() + rest.slice(1)
}

/** One named weekly-cap candidate, read from a `{ utilization | percent, resets_at }` block. */
function readWeeklyCandidate(
  payload: unknown,
  key: string,
  label: string
): { percent: number | null; resetsAt: string | null; label: string } {
  const block = recordAt(payload, key)
  if (!block) return { percent: null, resetsAt: null, label }
  return {
    percent: coercePercent(block.utilization ?? block.percent),
    resetsAt: toIsoInstant(block.resets_at),
    label
  }
}

/**
 * The payload has been through two shapes. The current one is a `limits`
 * array keyed by `kind`; an older build returned `five_hour` / `seven_day`
 * objects. Both are read, newest first, because users on a pinned CLI version
 * still hit the old shape.
 *
 * The weekly cap is not just the blended `seven_day` figure: the live payload
 * also carries `seven_day_opus` and `seven_day_sonnet`, per-model weekly caps
 * that cap independently and can bind before the blended figure does — an
 * Opus-heavy user can be at 95% on their Opus cap while `seven_day` still
 * reads a comfortable 13%. Whichever of the three is highest wins, and
 * `weeklyLabel` names it. A missing key stays missing: it is only considered
 * once `coercePercent` proves a real number, never defaulted to 0.
 */
export function parseClaudeWindows(payload: unknown): ClaudeWindows {
  const session: Window = { percent: null, resetsAt: null }
  const weekly: Window = { percent: null, resetsAt: null }
  let weeklyLabel = 'Weekly'

  for (const entry of arrayAt(payload, 'limits')) {
    const item = asRecord(entry)
    if (!item) continue
    const percent = coercePercent(item.percent ?? item.utilization)
    if (percent == null) continue
    const kind = typeof item.kind === 'string' ? item.kind : ''
    if (kind === 'session') {
      session.percent = percent
      session.resetsAt = toIsoInstant(item.resets_at)
    } else if (kind.startsWith('weekly')) {
      // Any weekly-ish kind, not just `weekly_all`. The same reason the
      // object shape has to consider `seven_day_opus` applies here: whichever
      // weekly cap is highest is the one about to stop the user, so a
      // per-model entry must be able to win. Matching on the prefix rather
      // than an allow-list means a cap this build has never heard of still
      // counts, which is the safe direction to be wrong in.
      if (weekly.percent == null || percent > weekly.percent) {
        weekly.percent = percent
        weekly.resetsAt = toIsoInstant(item.resets_at)
        weeklyLabel = kind === 'weekly_all' ? 'Weekly' : `Weekly (${weeklyKindName(kind)})`
      }
    }
  }

  const fiveHour = recordAt(payload, 'five_hour')
  if (session.percent == null && fiveHour) {
    session.percent = coercePercent(fiveHour.utilization ?? fiveHour.percent)
    session.resetsAt = toIsoInstant(fiveHour.resets_at)
  }

  if (weekly.percent == null) {
    const candidates = [
      readWeeklyCandidate(payload, 'seven_day', 'Weekly'),
      readWeeklyCandidate(payload, 'seven_day_opus', 'Weekly (Opus)'),
      readWeeklyCandidate(payload, 'seven_day_sonnet', 'Weekly (Sonnet)')
    ].filter((c): c is { percent: number; resetsAt: string | null; label: string } => c.percent != null)

    if (candidates.length > 0) {
      const winner = candidates.reduce((max, c) => (c.percent > max.percent ? c : max))
      weekly.percent = winner.percent
      weekly.resetsAt = winner.resetsAt
      weeklyLabel = winner.label
    }
  }

  return { session, weekly, weeklyLabel }
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
    weekly: windows
      ? makeWindow(windows.weeklyLabel, windows.weekly.percent, windows.weekly.resetsAt)
      : null,
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
      ? reading(ctx, 'logged-out', 'No OAuth credentials — run `claude`, then /login')
      : reading(ctx, 'not-installed', 'Claude Code is not installed on this machine')
  }

  const oauth = parseCredentials(rawCredentials)
  if (!oauth) {
    return reading(
      ctx,
      'logged-out',
      'OAuth credentials unreadable — run `claude`, then /login'
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
      return reading(ctx, 'logged-out', 'OAuth token rejected — run `claude`, then /login')
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
