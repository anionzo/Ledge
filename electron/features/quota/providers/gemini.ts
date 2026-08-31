/**
 * Google Antigravity / Gemini quota, ported from `getGeminiUsage` in
 * scrapers.js, including the OAuth refresh path.
 *
 * UNDOCUMENTED ENDPOINT — twice over:
 *   - `https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist` and
 *     `:retrieveUserQuotaSummary`. The `v1internal` in the path is Google
 *     saying out loud that this is not for us. It is the private Code Assist
 *     surface the Antigravity client calls, and the `Antigravity/4.3.0` User-
 *     Agent is load-bearing. Both the route and the response shape can change
 *     without notice.
 *   - the credential itself lives in the OS credential store under the target
 *     `gemini:antigravity`, which is an implementation detail of that client.
 *
 * The token refresh goes to `https://oauth2.googleapis.com/token`, which *is*
 * documented — but it needs the Antigravity OAuth client id and secret, which
 * are not ours to ship. They are read from the environment
 * (`LEDGE_ANTIGRAVITY_CLIENT_ID` / `_SECRET`); with no client configured the
 * refresh cannot happen and the provider reports `logged-out` rather than
 * pretending. See the note below about the original's `.env` loader.
 *
 * Cross-platform change: the original shelled out to a bundled `wincred.ps1`
 * to read a Windows Generic Credential. That is now `platform.readSecret`,
 * which maps to Credential Manager, the macOS Keychain or the Secret Service
 * depending on the OS, so the same code runs everywhere.
 */
import type { QuotaProvider, ReadContext } from '../provider'
import type { QuotaReading, QuotaState } from '../../../../shared/types/quota'
import { httpsRequest } from '../http'
import { readAntigravityCredits } from './antigravityCredits'
import {
  arrayAt,
  asRecord,
  errorMessage,
  makeReading,
  makeWindow,
  parseJsonSafe,
  recordAt,
  remainingToUsed,
  stringAt,
  toIsoInstant
} from '../util'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CLOUD_CODE_URL = 'https://cloudcode-pa.googleapis.com/v1internal'
const ANTIGRAVITY_UA = 'Antigravity/4.3.0'
const CREDENTIAL_SERVICE = 'gemini:antigravity'

const ID = 'gemini'
const DISPLAY_NAME = 'Antigravity'

/**
 * Access tokens are good for an hour, so they are cached across refresh
 * cycles rather than re-minted every minute. Module-level, exactly as in the
 * original; `resetGeminiTokenCache` exists so tests do not leak state.
 */
let accessCache: { token: string | null; expiresAt: number } = { token: null, expiresAt: 0 }

export function resetGeminiTokenCache(): void {
  accessCache = { token: null, expiresAt: 0 }
}

/** Distinguishes "you need to sign in" from "something went wrong". */
class SignedOutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SignedOutError'
  }
}

/** The OS refused the credential read; the user can retry. */
class PermissionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PermissionError'
  }
}

interface WindowValues {
  percent: number | null
  resetsAt: string | null
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
    session: session ? makeWindow('5h session', session.percent, session.resetsAt) : null,
    weekly: weekly ? makeWindow('Weekly', weekly.percent, weekly.resetsAt) : null,
    now: ctx.now,
    alertThreshold: ctx.alertThreshold
  })
}

/**
 * The Antigravity OAuth client.
 *
 * NOT PORTED: the original's `loadDotEnv`, which read a `.env` sitting next
 * to the app bundle and injected it into `process.env`. Reading a dotfile
 * adjacent to installed application code is a supply-chain footgun — anything
 * that can write next to the app can inject secrets into the process — and it
 * relied on `__dirname`, which does not survive bundling. The environment is
 * read directly instead; a launcher that wants a `.env` can load one itself.
 */
function oauthClient(): { clientId: string; clientSecret: string } {
  const env = process.env
  const clientId = (env.LEDGE_ANTIGRAVITY_CLIENT_ID ?? '').trim()
  const clientSecret = (env.LEDGE_ANTIGRAVITY_CLIENT_SECRET ?? '').trim()
  return { clientId, clientSecret }
}

function parseGoogleExpiry(raw: unknown): number {
  if (typeof raw !== 'string' && typeof raw !== 'number') return 0
  const ms = Date.parse(String(raw))
  return Number.isNaN(ms) ? 0 : ms
}

/**
 * Return a usable access token, refreshing through Google if the stored one
 * has expired. Throws `SignedOutError` when the user must re-authenticate and
 * `PermissionError` when the OS blocked the credential read.
 */
async function getAccessToken(ctx: ReadContext): Promise<string> {
  if (accessCache.token && ctx.now < accessCache.expiresAt - 60_000) {
    return accessCache.token
  }

  const secret = await ctx.platform.readSecret({ service: CREDENTIAL_SERVICE })
  if (!secret.ok) {
    if (secret.reason === 'permission-denied') {
      throw new PermissionError('Allow Ledge to read the Antigravity credential, then retry')
    }
    throw new SignedOutError('No Antigravity credential — sign in with: agy')
  }

  const token = recordAt(parseJsonSafe(secret.value), 'token')
  const accessToken = typeof token?.access_token === 'string' ? token.access_token : null
  const refreshToken = typeof token?.refresh_token === 'string' ? token.refresh_token : null
  if (!accessToken && !refreshToken) {
    throw new SignedOutError('Antigravity credential unusable — sign in with: agy')
  }

  const expiryMs = parseGoogleExpiry(token?.expiry)
  if (accessToken && expiryMs > ctx.now + 60_000) {
    accessCache = { token: accessToken, expiresAt: expiryMs }
    return accessToken
  }

  if (!refreshToken) {
    throw new SignedOutError('Antigravity token expired — sign in with: agy')
  }

  const { clientId, clientSecret } = oauthClient()
  if (!clientId || !clientSecret) {
    // Refusing to guess is the point: without a client we cannot refresh, so
    // we say so instead of showing a stale or invented number.
    throw new SignedOutError('Antigravity OAuth client not configured — cannot refresh token')
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret
  }).toString()

  const res = await httpsRequest({
    method: 'POST',
    url: GOOGLE_TOKEN_URL,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body,
    timeoutMs: 15_000
  })

  const refreshed = asRecord(res.json)
  const newToken = typeof refreshed?.access_token === 'string' ? refreshed.access_token : null
  if (res.status !== 200 || !newToken) {
    // Deliberately does not include the response body: a failed token
    // exchange can echo the refresh token back in its error payload.
    throw new SignedOutError(`Token refresh failed (HTTP ${res.status}) — sign in with: agy`)
  }
  const expiresIn = Number(refreshed?.expires_in) || 3600
  accessCache = { token: newToken, expiresAt: ctx.now + expiresIn * 1000 }
  return newToken
}

/**
 * Google reports a *remaining* fraction per bucket, and a tier can have
 * several buckets in the same window. The one closest to exhaustion is the
 * one that will actually stop the user working, so that is the one shown.
 */
function hottestBucket(buckets: unknown[]): WindowValues | null {
  let best: WindowValues | null = null
  for (const entry of buckets) {
    const bucket = asRecord(entry)
    if (!bucket) continue
    const used = remainingToUsed(bucket.remainingFraction)
    if (used == null) continue
    if (!best || best.percent == null || used > best.percent) {
      best = { percent: used, resetsAt: toIsoInstant(bucket.resetTime) }
    }
  }
  return best
}

/** Is the Antigravity/Gemini client present at all? */
async function isInstalled(ctx: ReadContext): Promise<boolean> {
  // The original probed `~/.gemini` and `%LOCALAPPDATA%\agy`. Neither path is
  // in the platform contract, and both are OS-specific, so presence on PATH
  // is used instead — it is the one signal that means the same thing on all
  // three platforms.
  const agy = await ctx.platform.which('agy')
  if (agy) return true
  const gemini = await ctx.platform.which('gemini')
  return Boolean(gemini)
}

async function read(ctx: ReadContext): Promise<QuotaReading> {
  // Primary path: read the credit balance straight from Antigravity's local
  // state.vscdb. It needs no token, no OAuth client and no network, so it works
  // where the API path (which needs an Antigravity OAuth client nobody ships)
  // cannot. The API path below stays as a fallback for a future build that has
  // the client configured.
  try {
    const credits = await readAntigravityCredits(ctx.platform)
    if (credits) {
      return makeReading({
        providerId: ID,
        displayName: DISPLAY_NAME,
        modelName: DISPLAY_NAME,
        state: 'ok',
        message: null,
        session: null,
        weekly: null,
        balance: {
          currency: 'credits',
          totalBalance: String(credits.available),
          grantedBalance: null,
          toppedUpBalance: null,
          isAvailable: credits.available > 0
        },
        now: ctx.now,
        alertThreshold: ctx.alertThreshold
      })
    }
  } catch {
    // Fall through to the API path; a bad DB read must never fail the provider.
  }

  let access: string
  try {
    access = await getAccessToken(ctx)
  } catch (err) {
    if (err instanceof PermissionError) {
      return reading(ctx, 'permission-required', err.message)
    }
    if (err instanceof SignedOutError) {
      const installed = await isInstalled(ctx)
      return installed
        ? reading(ctx, 'logged-out', err.message)
        : reading(ctx, 'not-installed', 'Antigravity is not installed on this machine')
    }
    return reading(ctx, 'error', errorMessage(err, 'Antigravity sign-in check failed'))
  }

  try {
    const headers = {
      Authorization: `Bearer ${access}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': ANTIGRAVITY_UA
    }

    // loadCodeAssist tells us the tier name and the project the quota hangs
    // off. Without the project id, retrieveUserQuotaSummary answers for the
    // default project, which may not be the one in use.
    const loaded = await httpsRequest({
      method: 'POST',
      url: `${CLOUD_CODE_URL}:loadCodeAssist`,
      headers,
      body: '{}',
      timeoutMs: 15_000
    })

    if (loaded.status === 401 || loaded.status === 403) {
      // Force a fresh mint on the next cycle.
      resetGeminiTokenCache()
      return reading(ctx, 'logged-out', 'OAuth token rejected — sign in with: agy')
    }

    const project = stringAt(loaded.json, 'cloudaicompanionProject')
    const paidTier = stringAt(recordAt(loaded.json, 'paidTier'), 'name')
    const currentTier = stringAt(recordAt(loaded.json, 'currentTier'), 'name')
    const modelName = paidTier ?? currentTier ?? DISPLAY_NAME

    const payload = project
      ? JSON.stringify({
          project: project.startsWith('projects/') ? project : `projects/${project}`
        })
      : '{}'

    const summary = await httpsRequest({
      method: 'POST',
      url: `${CLOUD_CODE_URL}:retrieveUserQuotaSummary`,
      headers,
      body: payload,
      timeoutMs: 20_000
    })

    const groups = arrayAt(summary.json, 'groups')
    if (summary.status !== 200 || groups.length === 0) {
      return reading(ctx, 'error', `Quota endpoint unavailable (HTTP ${summary.status})`, modelName)
    }

    const sessionBuckets: unknown[] = []
    const weeklyBuckets: unknown[] = []
    for (const group of groups) {
      for (const entry of arrayAt(group, 'buckets')) {
        const bucket = asRecord(entry)
        if (!bucket) continue
        const window = String(bucket.window ?? bucket.bucketId ?? '').toLowerCase()
        if (window.includes('5h')) sessionBuckets.push(bucket)
        if (window.includes('weekly')) weeklyBuckets.push(bucket)
      }
    }

    const session = hottestBucket(sessionBuckets)
    const weekly = hottestBucket(weeklyBuckets)
    if (!session && !weekly) {
      return reading(ctx, 'error', 'Quota data in an unrecognised shape', modelName)
    }

    return reading(
      ctx,
      'ok',
      null,
      modelName,
      session ?? { percent: null, resetsAt: null },
      weekly ?? { percent: null, resetsAt: null }
    )
  } catch (err) {
    return reading(ctx, 'error', errorMessage(err, 'Antigravity usage read failed'))
  }
}

export const geminiProvider: QuotaProvider = {
  id: ID,
  displayName: DISPLAY_NAME,
  ttlMs: 60_000,
  read
}
