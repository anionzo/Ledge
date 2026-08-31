/**
 * DeepSeek balance, a BALANCE-SHAPED provider rather than a window-shaped one.
 *
 * DOCUMENTED ENDPOINT — the rare case in this folder. Every other built-in
 * reader talks to a private, undocumented route reverse-engineered from a CLI;
 * DeepSeek publishes `GET https://api.deepseek.com/user/balance` with a plain
 * `Authorization: Bearer <key>`, so this one is stable and safe to rely on.
 *
 * DeepSeek reports MONEY LEFT, not a used-percentage. There is no session or
 * weekly window to fill and no ring to draw — the renderer shows a balance bar
 * instead. So `session`/`weekly`/`ringPercent` are null and severity is `ok`,
 * and the reading carries a `QuotaBalance` whose amounts are kept as EXACT
 * decimal strings (see util.moneyString): a prepaid balance must not lose a
 * fen/cent to a float.
 *
 * Credential source. DeepSeek ships no standardised CLI or credentials file, so
 * there is nothing like `~/.claude/.credentials.json` to read. We take an API
 * key from, in order:
 *   1. `$DEEPSEEK_API_KEY` — the variable the official OpenAI-compatible SDKs
 *      already look for.
 *   2. `~/.deepseek/config.json`, field `apiKey` or `api_key` — a plausible
 *      convention for users who keep a key on disk. The directory honours
 *      `DEEPSEEK_CONFIG_DIR`, mirroring how the other providers honour their
 *      own `*_CONFIG_DIR` / `*_HOME` overrides, which also makes it testable
 *      without writing into a real home.
 * The key is never logged, never put in a message, and never echoed from the
 * config file — only its presence is ever reported.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { QuotaProvider, ReadContext } from '../provider'
import type { QuotaBalance, QuotaReading, QuotaState } from '../../../../shared/types/quota'
import { httpsRequest } from '../http'
import { arrayAt, asRecord, errorMessage, makeReading, moneyString, parseJsonSafe } from '../util'

const BALANCE_URL = 'https://api.deepseek.com/user/balance'

const ID = 'deepseek'
const DISPLAY_NAME = 'DeepSeek'

function reading(
  ctx: ReadContext,
  state: QuotaState,
  message: string | null,
  balance?: QuotaBalance
): QuotaReading {
  // Balance-shaped: no windows, no ring. `makeReading` already leaves
  // ringPercent null and severity `ok` when session/weekly are absent; the
  // balance is attached on top because `makeReading` does not model it.
  const base = makeReading({
    providerId: ID,
    displayName: DISPLAY_NAME,
    modelName: DISPLAY_NAME,
    state,
    message,
    now: ctx.now,
    alertThreshold: ctx.alertThreshold
  })
  return balance ? { ...base, balance } : base
}

/**
 * Turn a `/user/balance` payload into a `QuotaBalance`, or null when the body
 * is not the documented shape. Pure and exported so the parse can be unit
 * tested without a network call.
 *
 * The FIRST entry of `balance_infos` stands in for the account balance, per the
 * task contract. Amounts pass through `moneyString` and stay strings; the
 * top-level `is_available` flag becomes `isAvailable`.
 */
export function parseDeepseekBalance(payload: unknown): QuotaBalance | null {
  const infos = arrayAt(payload, 'balance_infos')
  const first = asRecord(infos[0])
  if (!first) return null

  const totalBalance = moneyString(first.total_balance)
  // Without a total there is nothing to show; degrade rather than invent 0.
  if (totalBalance == null) return null

  const currency = first.currency
  if (currency !== 'USD' && currency !== 'CNY') return null

  const root = asRecord(payload)
  return {
    currency,
    totalBalance,
    grantedBalance: moneyString(first.granted_balance),
    toppedUpBalance: moneyString(first.topped_up_balance),
    isAvailable: root?.is_available === true
  }
}

/** `~/.deepseek`, honouring `DEEPSEEK_CONFIG_DIR`. */
function configDir(): string {
  const override = process.env.DEEPSEEK_CONFIG_DIR
  if (typeof override === 'string' && override.trim()) return override.trim()
  return path.join(os.homedir() || '', '.deepseek')
}

/**
 * Resolve an API key from the environment, then the on-disk config. Returns
 * null when neither has one. Never returns anything derived from the file
 * except the key itself, and the caller never logs it.
 */
function resolveApiKey(): string | null {
  const fromEnv = process.env.DEEPSEEK_API_KEY
  if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim()

  const configPath = path.join(configDir(), 'config.json')
  try {
    if (!fs.existsSync(configPath)) return null
    const doc = asRecord(parseJsonSafe(fs.readFileSync(configPath, 'utf8')))
    if (!doc) return null
    const key = doc.apiKey ?? doc.api_key
    return typeof key === 'string' && key.trim() ? key.trim() : null
  } catch {
    // An unreadable or malformed config is treated as "no key", never surfaced.
    return null
  }
}

async function read(ctx: ReadContext): Promise<QuotaReading> {
  const apiKey = resolveApiKey()
  if (!apiKey) {
    return reading(
      ctx,
      'logged-out',
      'No API key — set DEEPSEEK_API_KEY or add one to ~/.deepseek/config.json'
    )
  }

  try {
    const res = await httpsRequest({
      url: BALANCE_URL,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json'
      },
      timeoutMs: 10_000
    })

    if (res.status === 401 || res.status === 403) {
      return reading(ctx, 'logged-out', 'API key rejected — check DEEPSEEK_API_KEY')
    }
    if (res.status !== 200 || !res.json) {
      return reading(ctx, 'error', `Balance endpoint unavailable (HTTP ${res.status})`)
    }

    const balance = parseDeepseekBalance(res.json)
    if (!balance) {
      return reading(ctx, 'error', 'Balance data in an unrecognised shape')
    }
    return reading(ctx, 'ok', null, balance)
  } catch (err) {
    return reading(ctx, 'error', errorMessage(err, 'DeepSeek balance read failed'))
  }
}

export const deepseekProvider: QuotaProvider = {
  id: ID,
  displayName: DISPLAY_NAME,
  ttlMs: 60_000,
  read
}
