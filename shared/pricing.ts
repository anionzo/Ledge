/**
 * Per-model list prices — the reference half of the Cost Meter.
 *
 * Prices cached 2026-06-24 from the claude-api skill. They are Anthropic's
 * authoritative published list prices, in USD per 1,000,000 tokens. The cache
 * columns follow Anthropic's own ratios: a cache read costs ≈0.1× the input
 * price, and a 5-minute cache write ≈1.25× the input price.
 *
 * NON-ANTHROPIC MODELS ARE INTENTIONALLY OMITTED. Their pricing changes often
 * and is not authoritative here, so `modelPrice` returns null for them and the
 * UI shows nothing rather than a wrong number. This table is a reference only:
 * Ledge is a spectator that reads quota state, never a proxy, so it cannot
 * count tokens per request — no token counts flow through it today. The
 * `estimateCost` helper exists for a future token path and is exported and
 * tested even though nothing feeds it a token count yet.
 */
import type { ModelPrice } from './types/quota'

/**
 * The reference table. Keyed by a normalized model id (lowercase, no provider
 * prefix, no date/version suffix) so a lookup can be tolerant of the many
 * shapes the same model id arrives in — `claude-opus-4-8`,
 * `anthropic/claude-opus-4-8`, `us.anthropic.claude-opus-4-8-v1:0`,
 * `claude-opus-4-8-20260515`.
 *
 * `model` holds the canonical id the UI shows; the record key is the match key.
 */
const TABLE: Readonly<Record<string, ModelPrice>> = Object.freeze({
  'claude-opus-5': price('claude-opus-5', 5, 25, 0.5, 6.25),
  'claude-opus-4-8': price('claude-opus-4-8', 5, 25, 0.5, 6.25),
  'claude-opus-4-7': price('claude-opus-4-7', 5, 25, 0.5, 6.25),
  'claude-opus-4-6': price('claude-opus-4-6', 5, 25, 0.5, 6.25),
  'claude-sonnet-5': price('claude-sonnet-5', 2, 10, 0.2, 2.5),
  'claude-sonnet-4-6': price('claude-sonnet-4-6', 3, 15, 0.3, 3.75),
  'claude-haiku-4-5': price('claude-haiku-4-5', 1, 5, 0.1, 1.25),
  'claude-fable-5': price('claude-fable-5', 10, 50, 1.0, 12.5)
})

function price(
  model: string,
  inputPerMtok: number,
  outputPerMtok: number,
  cacheReadPerMtok: number,
  cacheWritePerMtok: number
): ModelPrice {
  return { model, inputPerMtok, outputPerMtok, cacheReadPerMtok, cacheWritePerMtok }
}

/**
 * Reduce an arbitrary model id to the table's match key.
 *
 * Handles the real variety of ids seen in the wild: a provider prefix
 * (`anthropic/`, `us.anthropic.`, `bedrock/`), a trailing dated snapshot
 * (`-20260515`, `@20260515`), and a Bedrock/Vertex version tail (`-v1:0`,
 * `:0`). Anything that does not contain `claude` cannot be one of our keys, so
 * it is left as-is and simply misses the table.
 */
function normalizeKey(id: string): string {
  let s = id.toLowerCase().trim()

  // Drop everything before the first `claude` — that strips `anthropic/`,
  // `us.anthropic.`, `bedrock/` and friends in one move, dot- or slash-joined.
  const idx = s.indexOf('claude')
  if (idx > 0) s = s.slice(idx)

  // A dated snapshot suffix, `-20260515` or `@20260515`.
  s = s.replace(/[@-]\d{8}$/, '')
  // Any other long trailing numeric run that is not part of a model id.
  s = s.replace(/-\d{6,}$/, '')
  // Bedrock/Vertex version tails: `-v1:0`, `:0`, `@1`.
  s = s.replace(/-v\d+(?::\d+)?$/, '')
  s = s.replace(/[:@]\d+$/, '')
  // A `-latest` marker.
  s = s.replace(/-latest$/, '')

  return s
}

/**
 * The list price for a model id, or null when it is unknown.
 *
 * Case-insensitive and tolerant of provider prefixes and date/version
 * suffixes. Returns null — never a guessed number — for any model not in the
 * authoritative table (every non-Anthropic model, and any Anthropic model this
 * build predates). Callers must render nothing on null, not a zero.
 */
export function modelPrice(id: string): ModelPrice | null {
  if (typeof id !== 'string' || id.trim() === '') return null
  return TABLE[normalizeKey(id)] ?? null
}

/** A count of tokens by kind, for the future token-metered cost path. */
export interface TokenCounts {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/**
 * Cost in USD for a bag of tokens at a given price. Pure.
 *
 * Prices are per 1,000,000 tokens, so each term is `tokens / 1e6 * perMtok`.
 * A missing or non-finite count is treated as zero rather than poisoning the
 * whole sum with NaN. This is the seam the Cost Meter's token path will use if
 * Ledge ever gains a token source; today nothing calls it in production.
 */
export function estimateCost(price: ModelPrice, tokens: TokenCounts): number {
  const n = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0)
  return (
    (n(tokens.input) / 1_000_000) * price.inputPerMtok +
    (n(tokens.output) / 1_000_000) * price.outputPerMtok +
    (n(tokens.cacheRead) / 1_000_000) * price.cacheReadPerMtok +
    (n(tokens.cacheWrite) / 1_000_000) * price.cacheWritePerMtok
  )
}
