/**
 * Public surface of the quota engine.
 *
 * The rest of the app talks to this file and nothing else in the folder.
 * It owns the refresh cycle: build the active provider list from settings,
 * run every provider concurrently, retain recent readings behind failures,
 * and hand back a `QuotaSnapshot`.
 *
 * One provider throwing must never fail the batch. Two layers guarantee that:
 * `ReadingCache.read` converts a rejection into an `error` reading, and the
 * fan-out below uses `Promise.allSettled` so even a cache-level bug degrades
 * to one bad card rather than an empty gauge.
 */
import type { QuotaReading, QuotaSeverity, QuotaSnapshot } from '../../../shared/types/quota'
import { STALE_TTL_MS } from '../../../shared/types/quota'
import type { GaugeSettings } from '../../../shared/types/settings'
import { DEFAULT_SETTINGS } from '../../../shared/types/settings'
import type { PlatformAdapter } from '../../platform/types'
import type { QuotaProvider, ReadContext } from './provider'
import { buildProviders } from './registry'
import { keepLastKnown, readingCache, resetQuotaCache, snapshotChanged } from './cache'
import { makeReading } from './util'
import { computePace, ringWindow } from './pace'
import { computeSpend, recordBalance } from '../../store/balanceHistory'
import { recordUsage } from '../../store/usageHistory'

export type { QuotaProvider, ReadContext } from './provider'
export {
  keepLastKnown,
  readingFingerprint,
  resetQuotaCache,
  snapshotChanged,
  snapshotFingerprint
} from './cache'
export { buildProviders, BUILTIN_PROVIDERS } from './registry'

export interface QuotaEngineConfig {
  platform: PlatformAdapter
  /** Read live, so a settings change takes effect on the next refresh. */
  getSettings: () => GaugeSettings
  /** Injectable clock, in epoch ms. Tests pass a fake; production omits it. */
  now?: () => number
}

let config: QuotaEngineConfig | null = null
let lastSnapshot: QuotaSnapshot | null = null

/**
 * Wire the engine to a platform adapter and a settings source.
 *
 * Called once from main-process startup. If it is never called, the engine
 * lazily resolves the real adapter and falls back to default Gauge settings,
 * so a caller that only wants `probeCommand` does not have to configure it.
 */
export function configureQuota(next: QuotaEngineConfig): void {
  config = next
  lastSnapshot = null
  lastSeverities = new Map()
  resetQuotaCache()
}

/** Forget the configuration and every cached reading. For tests. */
export function resetQuotaEngine(): void {
  config = null
  lastSnapshot = null
  lastSeverities = new Map()
  resetQuotaCache()
}

/**
 * The platform adapter is imported lazily rather than at module load.
 * `electron/platform` reaches for Electron and native bindings; importing it
 * eagerly would make this module unloadable in a plain vitest process, and
 * every test configures the engine with a fake adapter anyway.
 */
async function resolveConfig(): Promise<QuotaEngineConfig> {
  if (config) return config
  const mod = (await import('../../platform')) as { getPlatform: () => PlatformAdapter }
  config = {
    platform: mod.getPlatform(),
    getSettings: () => DEFAULT_SETTINGS.gauge
  }
  return config
}

function clampThreshold(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 80
  return Math.max(50, Math.min(100, n))
}

function failedReading(provider: QuotaProvider, ctx: ReadContext, reason: string): QuotaReading {
  return makeReading({
    providerId: provider.id,
    displayName: provider.displayName,
    state: 'error',
    message: reason,
    now: ctx.now,
    alertThreshold: ctx.alertThreshold
  })
}

/**
 * Fold real spend into a balance-shaped reading.
 *
 * Ledge cannot count tokens (it is a spectator, not a proxy), so the only spend
 * it can prove is a prepaid balance falling over time. For every reading that
 * carries a `QuotaBalance` we record the current amount and attach the spend
 * derived from the history — today and this month.
 *
 * Kept strictly non-fatal: a history read or write that throws must never fail
 * the batch, so the whole thing is guarded and a failure simply leaves `cost`
 * absent. Only a fresh `ok` reading is recorded — a retained `stale` reading
 * would re-log an old amount (the dedupe would drop it anyway, but recording a
 * value we did not just observe would be a small lie). Cost is deliberately
 * excluded from the reading fingerprint (see cache.ts), so attaching it here
 * cannot spam IPC pushes: a push still happens only when the balance itself,
 * which drives the cost, has moved.
 */
function withCost(reading: QuotaReading, now: number): QuotaReading {
  if (!reading.balance) return reading
  try {
    if (reading.state === 'ok' && !reading.stale) {
      recordBalance(reading.providerId, reading.balance, now)
    }
    const cost = computeSpend(reading.providerId, now)
    return cost ? { ...reading, cost } : reading
  } catch (err) {
    console.error('[quota] cost meter failed for', reading.providerId, err)
    return reading
  }
}

/**
 * Fold burn rate and the usage trail into a percentage-shaped reading.
 *
 * `withCost`'s sibling, same rules: strictly non-fatal (a history write or a
 * pace bug must never fail the batch), and only a fresh `ok` reading is
 * recorded — re-logging a retained `stale` percent would fabricate a sample
 * we did not just observe. Pace, by contrast, is recomputed even for a stale
 * reading: it depends on the wall clock as much as on the percentage, and the
 * elapsed fraction keeps moving while the number stands still. Unlike cost,
 * `pace` IS part of the reading fingerprint (see cache.ts): the "hot" chip is
 * user-visible, so a flip must push even when nothing else moved.
 */
function withUsage(reading: QuotaReading, now: number): QuotaReading {
  if (reading.state !== 'ok') return reading
  try {
    if (!reading.stale && reading.ringPercent !== null) {
      recordUsage(reading.providerId, reading.ringPercent, now)
    }
    return { ...reading, pace: computePace(reading, now) }
  } catch (err) {
    console.error('[quota] usage tracking failed for', reading.providerId, err)
    return reading
  }
}

/**
 * Last severity seen per provider, for the threshold-crossing toast.
 *
 * The toast fires only on the below-critical → critical crossing, so a
 * provider SITTING at critical never re-fires on subsequent refreshes. And
 * because usage only climbs until the window resets — which drops severity
 * back below critical and updates this map — that works out to once per
 * provider per window. Module-level and unpersisted on purpose: after a
 * restart (or reconfigure) the first snapshot has no predecessor, so nothing
 * fires until a crossing is actually observed.
 */
let lastSeverities = new Map<string, QuotaSeverity>()

/**
 * Broadcast the crossing toast. The IPC module is imported lazily for the
 * same reason the platform adapter is (see `resolveConfig`): it imports
 * `electron`, which a plain vitest process cannot load. Fire-and-forget and
 * fully guarded — a toast is decoration, never worth failing a refresh over.
 */
async function toastCritical(reading: QuotaReading): Promise<void> {
  try {
    const label = ringWindow(reading)?.label ?? 'usage'
    const { broadcast } = await import('../../main/ipc')
    broadcast('ui:toast', {
      id: `quota-critical-${reading.providerId}`,
      message: `${reading.displayName} hit ${reading.ringPercent}% of its ${label} limit`,
      tone: 'error'
    })
  } catch (err) {
    console.error('[quota] critical toast failed for', reading.providerId, err)
  }
}

/** Toast every below-critical → critical crossing, then remember severities. */
function noticeCriticalCrossings(readings: readonly QuotaReading[]): void {
  const next = new Map<string, QuotaSeverity>()
  for (const reading of readings) {
    next.set(reading.providerId, reading.severity)
    const prev = lastSeverities.get(reading.providerId)
    if (
      reading.severity === 'critical' &&
      prev !== undefined && // No predecessor: nothing crossed, nothing to say.
      prev !== 'critical' && // Still critical: already toasted this window.
      reading.ringPercent !== null
    ) {
      void toastCritical(reading)
    }
  }
  // Wholesale replacement, so a provider removed in Settings is forgotten.
  lastSeverities = next
}

/**
 * Run one refresh cycle.
 *
 * `force` bypasses the per-provider TTL and the backoff window — it is what
 * the manual refresh button and the `permission-required` retry use.
 */
export async function refresh(options: { force?: boolean } = {}): Promise<QuotaSnapshot> {
  const cfg = await resolveConfig()
  const gauge = cfg.getSettings()
  const now = cfg.now ? cfg.now() : Date.now()
  const ctx: ReadContext = {
    platform: cfg.platform,
    alertThreshold: clampThreshold(gauge.alertThreshold),
    now
  }

  const providers = buildProviders(gauge)

  // Concurrent by design: six network round trips in sequence would make a
  // refresh take seconds. allSettled so nothing can take the batch down.
  const settled = await Promise.allSettled(
    providers.map((provider) => readingCache.read(provider, ctx, { force: options.force }))
  )

  const readings = settled.map((result, i) =>
    result.status === 'fulfilled'
      ? result.value
      : failedReading(providers[i]!, ctx, 'Usage read failed unexpectedly')
  )

  const merged = keepLastKnown(lastSnapshot?.readings, readings, now, STALE_TTL_MS)
  const snapshot: QuotaSnapshot = {
    readings: merged.map((reading) => withUsage(withCost(reading, now), now)),
    lastUpdated: new Date(now).toISOString()
  }
  noticeCriticalCrossings(snapshot.readings)
  lastSnapshot = snapshot
  return snapshot
}

/**
 * The current snapshot.
 *
 * Returns what is already in hand when there is one — the per-provider TTL
 * inside `refresh` is what actually decides whether anything is re-read, so
 * this is cheap to call from an IPC handler on every panel open.
 */
export async function getSnapshot(): Promise<QuotaSnapshot> {
  if (lastSnapshot) return lastSnapshot
  return refresh()
}

/** The last snapshot without triggering any work, or null if there is none. */
export function peekSnapshot(): QuotaSnapshot | null {
  return lastSnapshot
}

/** True when `next` differs from the snapshot last pushed to the renderer. */
export function hasVisibleChange(next: QuotaSnapshot): boolean {
  return snapshotChanged(lastSnapshot, next)
}

export interface ProbeResult {
  found: boolean
  path: string | null
}

/**
 * Is `cmd` on PATH? Backs the "add a custom provider" flow in Settings.
 *
 * The name is validated before it reaches the platform adapter. The original
 * did the same, and it still matters: this value comes from a text field, and
 * the adapter's `which` may hand it to a shell.
 */
export async function probeCommand(cmd: string): Promise<ProbeResult> {
  const name = String(cmd ?? '').trim()
  if (!name || !/^[A-Za-z0-9._\\/:-]+$/.test(name)) return { found: false, path: null }
  try {
    const cfg = await resolveConfig()
    const resolved = await cfg.platform.which(name)
    return { found: Boolean(resolved), path: resolved ?? null }
  } catch {
    return { found: false, path: null }
  }
}
