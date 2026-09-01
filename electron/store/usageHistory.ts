/**
 * Usage-history store — the data behind the Gauge's trend sparklines.
 *
 * `balanceHistory.ts`'s sibling, same architecture on purpose: a small
 * per-provider append-only log under userData, atomic writes (temp + fsync +
 * rename), a corrupt file that degrades to an empty history, Electron required
 * lazily so the pure helpers stay loadable in a plain vitest process.
 *
 * Shape on disk (`usage-history.json` under userData):
 *
 *   { "<providerId>": [ { "at": ISO, "percent": 0–100 }, … ] }
 *
 * The log is bounded twice over. A sample is only appended when the percentage
 * actually MOVED, or `MIN_FLAT_INTERVAL_MS` has passed since the last one — a
 * flat line re-logged every refresh would balloon the file while adding
 * nothing to a sparkline, but an occasional heartbeat keeps time-axis gaps
 * bounded. And each provider's list is capped at `MAX_SAMPLES` with anything
 * older than `MAX_AGE_MS` pruned, so a long-running install cannot grow it
 * without limit.
 */
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import type { UsageSample } from '../../shared/types/quota'

type UsageStore = Record<string, UsageSample[]>

/** Cap per provider. 600 points is far more than a sparkline can show. */
export const MAX_SAMPLES = 600
/** Drop samples older than 14 days — the sparkline shows shape, not archives. */
export const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000
/** An unchanged percentage is still re-logged this often (the heartbeat). */
export const MIN_FLAT_INTERVAL_MS = 10 * 60 * 1000

let cache: UsageStore | null = null

export function usageHistoryFilePath(): string {
  // Required lazily, exactly as balanceHistory.ts does: importing `app` at
  // module load pulls Electron into every consumer's graph, which breaks a
  // plain vitest process where `electron` resolves to a path string. The pure
  // append/prune/parse helpers never call this, so tests never touch it.
  const { app } = require('electron') as typeof import('electron')
  return join(app.getPath('userData'), 'usage-history.json')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Coerce one untrusted entry to a `UsageSample`, or null. */
function toSample(raw: unknown): UsageSample | null {
  if (!isPlainObject(raw)) return null
  const at = typeof raw.at === 'string' ? raw.at : null
  const percent =
    typeof raw.percent === 'number' && Number.isFinite(raw.percent) ? raw.percent : null
  if (at === null || percent === null || percent < 0 || percent > 100) return null
  if (Number.isNaN(Date.parse(at))) return null
  return { at, percent }
}

/**
 * Coerce an untrusted parsed file to a `UsageStore`, dropping bad entries.
 *
 * Pruning on the way IN, not only on the way out, is what stops the file
 * growing without bound in its *key* count. Each provider's list is capped and
 * aged, but that only ever runs for a provider still being written to — delete
 * a custom provider and its 600 samples sat in `usage-history.json` forever,
 * because nothing was left to trigger a prune for that id. Reading is the one
 * moment every key is in hand at once, so it is where a dead one can be
 * noticed: after `MAX_AGE_MS` with nothing new, its samples all expire and the
 * key goes with them.
 */
function toStore(raw: unknown, now: number): UsageStore {
  if (!isPlainObject(raw)) return {}
  const out: UsageStore = {}
  for (const key of Object.keys(raw)) {
    const list = raw[key]
    if (!Array.isArray(list)) continue
    const samples = pruneSamples(
      list.map(toSample).filter((s): s is UsageSample => s !== null),
      now
    )
    if (samples.length > 0) out[key] = samples
  }
  return out
}

/**
 * Parse the on-disk JSON into a store, dropping anything malformed. Pure and
 * exported so the corrupt-file behaviour is unit-tested without a filesystem:
 * garbage in, empty store out — never a throw.
 */
export function parseStoreText(text: string, now: number = Date.now()): UsageStore {
  try {
    return toStore(JSON.parse(text) as unknown, now)
  } catch {
    return {}
  }
}

function loadStore(): UsageStore {
  if (cache) return cache

  const path = usageHistoryFilePath()
  let store: UsageStore = {}
  try {
    if (existsSync(path)) store = parseStoreText(readFileSync(path, 'utf8'))
  } catch (err) {
    // An unreadable file must never take the engine down: start fresh and let
    // the next successful record rewrite it.
    console.error('[usage-history] unreadable, starting fresh', err)
    store = {}
  }
  cache = store
  return store
}

/**
 * Bound one provider's list: sort ascending, drop anything older than
 * `MAX_AGE_MS`, then cap to the most recent `MAX_SAMPLES`. Pure.
 */
export function pruneSamples(samples: readonly UsageSample[], now: number): UsageSample[] {
  const cutoff = now - MAX_AGE_MS
  const kept = samples
    .filter((s) => {
      const ms = Date.parse(s.at)
      return Number.isFinite(ms) && ms >= cutoff
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  return kept.length > MAX_SAMPLES ? kept.slice(kept.length - MAX_SAMPLES) : kept
}

/**
 * Append `sample` to `samples`, unless it repeats the last percentage within
 * `MIN_FLAT_INTERVAL_MS`. Unlike `appendPoint` in balanceHistory (which
 * dedupes purely by amount), a sparkline wants an occasional sample even when
 * the line is flat — a week at 0% should still draw as a week, not vanish —
 * so an unchanged percentage is re-admitted once the interval has passed.
 * Pure — returns a new array (the same reference when nothing was appended).
 */
export function appendSample(
  samples: readonly UsageSample[],
  sample: UsageSample,
  now: number
): UsageSample[] {
  const last = samples[samples.length - 1]
  if (last && last.percent === sample.percent) {
    const lastMs = Date.parse(last.at)
    const sampleMs = Date.parse(sample.at)
    if (
      Number.isFinite(lastMs) &&
      Number.isFinite(sampleMs) &&
      sampleMs - lastMs < MIN_FLAT_INTERVAL_MS
    ) {
      return samples as UsageSample[]
    }
  }
  return pruneSamples([...samples, sample], now)
}

/**
 * Record a provider's current ring percentage. Non-throwing: a write failure
 * is logged and swallowed so a history problem can never fail a refresh.
 * `now` is injectable for tests; production omits it.
 */
export function recordUsage(providerId: string, percent: number, now: number = Date.now()): void {
  // ringPercent is already a 0–100 integer, but the store defends itself: a
  // non-finite or out-of-range value is nothing safe to record.
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    return
  }

  try {
    const store = loadStore()
    const existing = store[providerId] ?? []
    const sample: UsageSample = { at: new Date(now).toISOString(), percent }
    const next = appendSample(existing, sample, now)
    if (next === existing) return // Deduped: unchanged percent, heartbeat not yet due.

    store[providerId] = next
    writeAtomic(usageHistoryFilePath(), `${JSON.stringify(store)}\n`)
  } catch (err) {
    console.error('[usage-history] failed to record', err)
  }
}

/**
 * A provider's samples, oldest first. Pruned on the way out so a long-idle
 * install does not serve two-week-old points, but nothing is written back —
 * reads stay side-effect free. Returns a fresh array, so a caller mutating
 * the result cannot corrupt the cached store.
 */
export function getHistory(providerId: string, now: number = Date.now()): UsageSample[] {
  try {
    return pruneSamples(loadStore()[providerId] ?? [], now)
  } catch (err) {
    console.error('[usage-history] failed to read', err)
    return []
  }
}

/** Test seam: drop the in-memory copy so the next read hits disk. */
export function resetUsageHistoryCache(): void {
  cache = null
}

function writeAtomic(path: string, contents: string): void {
  const dir = dirname(path)
  const tmp = `${path}.${process.pid}.tmp`
  try {
    mkdirSync(dir, { recursive: true })
    const fd = openSync(tmp, 'w')
    try {
      writeSync(fd, contents)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(tmp, path)
  } catch (err) {
    console.error('[usage-history] failed to write', err)
    try {
      if (existsSync(tmp)) unlinkSync(tmp)
    } catch {
      // The temp file is inert; nothing useful to do.
    }
  }
}
