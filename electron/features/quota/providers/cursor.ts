/**
 * Cursor quota, ported from `getCursorUsage` in scrapers.js.
 *
 * UNDOCUMENTED ENDPOINT. `https://api2.cursor.sh/aiserver.v1.DashboardService/
 * GetCurrentPeriodUsage` is a Connect-RPC method the Cursor client calls for
 * its own dashboard. It is not a published API; the `Connect-Protocol-Version`
 * header is required and the response shape is whatever the current client
 * build expects.
 *
 * UNDOCUMENTED CREDENTIAL SOURCE, and the bigger fragility: the session token
 * is read out of Cursor's VS Code `state.vscdb`, the `ItemTable` key/value
 * store that Electron apps use for `globalState`. Cursor could rename the key
 * or move the store at any point.
 *
 * PYTHON REMOVED. The original shelled out to a bundled `electron/sqlite-item.py`
 * once per key, which meant Ledge would silently lose the Cursor gauge on any
 * machine without a `python` on PATH, and paid two process spawns per refresh.
 * This uses `node:sqlite`'s `DatabaseSync`, built into the Node 24 runtime
 * that Electron 44 ships. One read-only connection, both keys, closed
 * immediately. The import is guarded because `node:sqlite` is still flagged
 * experimental upstream and could be absent from a stripped runtime: if it is
 * missing we fail loudly with `state: 'error'` and a message that names the
 * cause, rather than quietly showing no Cursor card.
 *
 * The database is opened READ-ONLY. Ledge must never be able to corrupt a
 * user's Cursor state, and a read-only handle also cannot take the write lock
 * away from a running Cursor.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { QuotaProvider, ReadContext } from '../provider'
import type { QuotaReading, QuotaState } from '../../../../shared/types/quota'
import { httpsRequest } from '../http'
import { asRecord, coercePercent, errorMessage, makeReading, makeWindow, toIsoInstant } from '../util'

const USAGE_URL = 'https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage'
const TOKEN_KEY = 'cursorAuth/accessToken'
const PLAN_KEY = 'cursorAuth/stripeMembershipType'

const ID = 'cursor'
const DISPLAY_NAME = 'Cursor'

/**
 * Minimal structural types for `node:sqlite`.
 *
 * Declared locally rather than imported so the build does not depend on the
 * installed `@types/node` carrying the (still experimental) declarations. No
 * new dependency, and the shapes used here are tiny.
 */
type SqlValue = string | number | bigint | Uint8Array | null

interface StatementLike {
  get(...params: unknown[]): Record<string, SqlValue> | undefined
}

interface DatabaseLike {
  prepare(sql: string): StatementLike
  close(): void
}

interface SqliteModule {
  DatabaseSync: new (location: string, options?: { readOnly?: boolean }) => DatabaseLike
}

/** Raised when the runtime has no `node:sqlite`; surfaced as `error`. */
class SqliteUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SqliteUnavailableError'
  }
}

/**
 * The specifier is typed as `string`, not the literal, so TypeScript treats
 * this as a runtime import and does not demand ambient declarations for a
 * module the toolchain may not know about.
 */
async function loadSqlite(): Promise<SqliteModule> {
  const specifier: string = 'node:sqlite'
  let mod: unknown
  try {
    mod = await import(/* @vite-ignore */ specifier)
  } catch (err) {
    throw new SqliteUnavailableError(
      `node:sqlite is unavailable in this runtime (${errorMessage(err, 'import failed')})`
    )
  }
  const candidate = mod as Partial<SqliteModule>
  if (typeof candidate.DatabaseSync !== 'function') {
    throw new SqliteUnavailableError('node:sqlite is present but exports no DatabaseSync')
  }
  return candidate as SqliteModule
}

function decode(value: SqlValue): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value.trim() || null
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString('utf8').trim() || null
  }
  return String(value).trim() || null
}

/**
 * Read one or more `ItemTable` keys from a VS Code-style state store.
 * Exported for testing against a fixture database.
 */
export async function readVscdbItems(
  dbPath: string,
  keys: readonly string[]
): Promise<Record<string, string | null>> {
  const { DatabaseSync } = await loadSqlite()
  const out: Record<string, string | null> = {}
  let db: DatabaseLike | null = null
  try {
    db = new DatabaseSync(dbPath, { readOnly: true })
    const stmt = db.prepare('SELECT value FROM ItemTable WHERE key = ?')
    for (const key of keys) {
      const row = stmt.get(key)
      out[key] = row ? decode(row.value ?? null) : null
    }
  } finally {
    // Always close: a leaked handle keeps a file lock on the user's IDE state.
    try {
      db?.close()
    } catch {
      /* already closed */
    }
  }
  return out
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
    session: session ? makeWindow('Auto usage', session.percent, session.resetsAt) : null,
    weekly: weekly ? makeWindow('Billing period', weekly.percent, weekly.resetsAt) : null,
    now: ctx.now,
    alertThreshold: ctx.alertThreshold
  })
}

function titleCase(input: string): string {
  return input.replace(/\b\w/g, (c) => c.toUpperCase())
}

async function read(ctx: ReadContext): Promise<QuotaReading> {
  let globalStorage = ''
  try {
    globalStorage = ctx.platform.paths.cursorGlobalStorage()
  } catch (err) {
    return reading(ctx, 'error', errorMessage(err, 'Could not locate Cursor global storage'))
  }

  if (!globalStorage || !fs.existsSync(globalStorage)) {
    return reading(ctx, 'not-installed', 'Cursor is not installed on this machine')
  }
  const dbPath = path.join(globalStorage, 'state.vscdb')
  if (!fs.existsSync(dbPath)) {
    return reading(ctx, 'logged-out', 'No local Cursor session — sign in to Cursor')
  }

  let token: string | null = null
  let planHint: string | null = null
  try {
    const items = await readVscdbItems(dbPath, [TOKEN_KEY, PLAN_KEY])
    token = items[TOKEN_KEY] ?? null
    planHint = items[PLAN_KEY] ?? null
  } catch (err) {
    if (err instanceof SqliteUnavailableError) {
      return reading(ctx, 'error', err.message)
    }
    // A locked or WAL-mode database that will not open read-only lands here.
    return reading(ctx, 'error', errorMessage(err, 'Could not read Cursor session state'))
  }

  if (!token) {
    return reading(ctx, 'logged-out', 'No access token — sign in to Cursor')
  }

  const modelName = planHint ? `${DISPLAY_NAME} · ${titleCase(planHint)}` : DISPLAY_NAME

  try {
    const res = await httpsRequest({
      method: 'POST',
      url: USAGE_URL,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Connect-Protocol-Version': '1',
        'User-Agent': 'Mozilla/5.0'
      },
      body: '{}',
      timeoutMs: 15_000
    })

    if (res.status === 401) {
      return reading(ctx, 'logged-out', 'Cursor session expired — sign in to Cursor', modelName)
    }
    if (res.status === 403) {
      // 403 here is Cursor blocking the account (e.g. a plan/entitlement
      // gate), not a bad session token — re-authenticating cannot fix a
      // permission gate, so this must not tell the user to sign in again.
      return reading(ctx, 'error', 'Usage blocked for this account (HTTP 403) — not a sign-in problem', modelName)
    }

    const plan = asRecord(asRecord(res.json)?.planUsage)
    const total = coercePercent(plan?.totalPercentUsed)
    const auto = coercePercent(plan?.autoPercentUsed)
    if (res.status !== 200 || (total == null && auto == null)) {
      return reading(ctx, 'error', `Usage endpoint unavailable (HTTP ${res.status})`, modelName)
    }

    // Cursor bills per period rather than per session, so both windows share
    // the one billing-cycle reset instant.
    //
    // Unit: epoch milliseconds. Cursor's own Admin API documents its date
    // fields that way, and this endpoint follows the same house convention —
    // though `billingCycleEnd` itself is not publicly documented, since
    // `api2.cursor.sh` is the client's private surface. `toIsoInstant` reads
    // ISO strings, epoch seconds and epoch milliseconds alike (it switches on
    // a >1e12 magnitude test), so all three land correctly regardless; this
    // note records which one is actually expected, so a future reader does not
    // have to rediscover that the heuristic is load-bearing here.
    const cycle = toIsoInstant(asRecord(res.json)?.billingCycleEnd)
    return reading(
      ctx,
      'ok',
      null,
      modelName,
      { percent: auto, resetsAt: cycle },
      { percent: total, resetsAt: cycle }
    )
  } catch (err) {
    return reading(ctx, 'error', errorMessage(err, 'Cursor usage read failed'))
  }
}

export const cursorProvider: QuotaProvider = {
  id: ID,
  displayName: DISPLAY_NAME,
  ttlMs: 60_000,
  read
}
