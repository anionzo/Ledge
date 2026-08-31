/**
 * The contract every quota provider implements.
 *
 * Ported from agent-notch's flat `scrapers.js`, where each provider was a
 * free function closing over `os.homedir()`, `process.platform` and `https`.
 * Splitting them behind this interface buys three things the original lacked:
 * the OS seam (`ctx.platform`) is injected rather than imported, so providers
 * are testable without touching a real machine; the per-provider TTL is data
 * rather than one global constant; and a provider can never take the batch
 * down, because `index.ts` runs them under `Promise.allSettled`.
 */
import type { PlatformAdapter } from '../../platform/types'
import type { QuotaReading } from '../../../shared/types/quota'

export interface ReadContext {
  /**
   * The OS seam. Providers must reach the filesystem-adjacent world through
   * this — `paths`, `readSecret`, `runCommand`, `which` — and never branch on
   * `process.platform` themselves.
   */
  platform: PlatformAdapter
  /** Ring turns critical at or above this used-percentage. */
  alertThreshold: number
  /** Injected clock, in epoch ms. Every `observedAt` derives from it. */
  now: number
}

export interface QuotaProvider {
  /** Stable id. Built-ins use their `BuiltinProviderId`; custom ones `custom_<slug>`. */
  id: string
  displayName: string
  /**
   * How long a successful reading stays fresh before the cache will re-read.
   * Failures back off exponentially from this value — see `cache.ts`.
   * Zero means "never cache", used by manual custom providers whose value
   * comes straight from settings and costs nothing to recompute.
   */
  ttlMs: number
  /**
   * Read the provider's quota. Must resolve, never reject: a provider that
   * cannot prove a number resolves a `QuotaReading` whose `state` says why
   * and whose `usedPercent` fields are null. The cache treats a rejection as
   * a bug and converts it to an `error` reading, but providers should not
   * rely on that.
   */
  read(ctx: ReadContext): Promise<QuotaReading>
}
