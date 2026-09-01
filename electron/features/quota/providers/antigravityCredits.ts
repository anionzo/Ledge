/**
 * Antigravity credits, read straight out of its local state store.
 *
 * Antigravity is a VS Code fork, so — like Cursor — it keeps state in a
 * `state.vscdb` SQLite `ItemTable`. The OAuth path in `gemini.ts` needs an
 * Antigravity OAuth client that nobody ships, so it always fell back to
 * logged-out. But the credit balance is right there in the DB under
 * `antigravityUnifiedStateSync.modelCredits`, needing no token and no network:
 *
 *   modelCredits (base64 protobuf) = repeated {
 *     1: <sentinelKey string>              // e.g. "availableCreditsSentinelKey"
 *     2: { 1: <base64 protobuf string> }   // the value, itself protobuf
 *   }
 *   …and the inner value for availableCredits decodes to { 2: <varint credits> }.
 *
 * This is a private, undocumented on-disk format that Antigravity can change at
 * any time, so every step below fails soft to `null` rather than guessing.
 */
import fs from 'node:fs'
import type { PlatformAdapter } from '../../../platform/types'
import { readVscdbItems } from './cursor'

const MODEL_CREDITS_KEY = 'antigravityUnifiedStateSync.modelCredits'
const AVAILABLE_SENTINEL = 'availableCreditsSentinelKey'

export interface AntigravityCredits {
  /** Credits currently available to spend. */
  available: number
  /**
   * Epoch ms `state.vscdb` was last written — i.e. the last time Antigravity
   * itself ran and touched this value — or null when the mtime could not be
   * read. This is the only honest evidence of when `available` was actually
   * true; the caller (`gemini.ts`) must not assume it is current just because
   * Ledge happened to read it just now.
   */
  observedAtMs: number | null
}

/** Absolute path to Antigravity's `state.vscdb`, per OS, or null. */
export function antigravityDbPath(platform: PlatformAdapter): string | null {
  const home = homeDir()
  if (!home) return null
  const sep = '/'
  const tail = ['Antigravity', 'User', 'globalStorage', 'state.vscdb']
  if (platform.id === 'win32') {
    const appData = (process.env['APPDATA'] ?? '').trim() || join(home, 'AppData', 'Roaming')
    return join(appData, ...tail)
  }
  if (platform.id === 'darwin') {
    return [home, 'Library', 'Application Support', ...tail].join(sep)
  }
  // linux and anything else: XDG config home.
  const xdg = (process.env['XDG_CONFIG_HOME'] ?? '').trim() || join(home, '.config')
  return join(xdg, ...tail)
}

function homeDir(): string | null {
  const h = (process.env['HOME'] ?? process.env['USERPROFILE'] ?? '').trim()
  return h || null
}

function join(...parts: string[]): string {
  return parts.join('/')
}

/**
 * Read the available credit count, or null when the store is missing, the key
 * is absent, or the bytes don't decode the way we expect.
 */
export async function readAntigravityCredits(
  platform: PlatformAdapter
): Promise<AntigravityCredits | null> {
  const dbPath = antigravityDbPath(platform)
  if (!dbPath) return null

  let value: string | null
  try {
    const rows = await readVscdbItems(dbPath, [MODEL_CREDITS_KEY])
    value = rows[MODEL_CREDITS_KEY] ?? null
  } catch {
    // No DB (Antigravity not installed) or no node:sqlite — not our problem to
    // surface here; the caller decides the state.
    return null
  }
  if (!value) return null

  const available = parseAvailableCredits(value)
  if (available == null) return null

  // The file's own mtime is the only evidence of when this number was last
  // true — nothing else writes it. Read separately from the SQL query above
  // so a stat failure alone never discards a credit read that did succeed;
  // it just leaves the caller unable to prove freshness.
  let observedAtMs: number | null = null
  try {
    observedAtMs = (await fs.promises.stat(dbPath)).mtimeMs
  } catch {
    observedAtMs = null
  }

  return { available, observedAtMs }
}

// ── tiny protobuf reader (exported for tests) ──────────────────────────────

type Field = { field: number; wire: number; value: bigint | Uint8Array }

/** Decode a protobuf message into a flat field list. Never throws. */
export function decodeMessage(bytes: Uint8Array): Field[] {
  const out: Field[] = []
  let p = 0
  const readVarint = (): bigint => {
    let x = 0n
    let shift = 0n
    while (p < bytes.length) {
      const b = bytes[p++]
      x |= BigInt(b & 0x7f) << shift
      if ((b & 0x80) === 0) break
      shift += 7n
    }
    return x
  }
  while (p < bytes.length) {
    const tag = readVarint()
    const field = Number(tag >> 3n)
    const wire = Number(tag & 7n)
    if (wire === 0) {
      out.push({ field, wire, value: readVarint() })
    } else if (wire === 2) {
      const len = Number(readVarint())
      const slice = bytes.subarray(p, p + len)
      p += len
      out.push({ field, wire, value: slice })
    } else if (wire === 1) {
      p += 8 // fixed64 — unused
    } else if (wire === 5) {
      p += 4 // fixed32 — unused
    } else {
      break // unknown wire type — stop rather than misread
    }
  }
  return out
}

function asBytes(f: Field | undefined): Uint8Array | null {
  return f && f.wire === 2 && f.value instanceof Uint8Array ? f.value : null
}

function asString(f: Field | undefined): string | null {
  const b = asBytes(f)
  return b ? Buffer.from(b).toString('utf8') : null
}

/**
 * Walk the `modelCredits` structure and pull the availableCredits varint.
 * Exported so a test can pin the exact byte layout.
 */
export function parseAvailableCredits(base64: string): number | null {
  let outer: Field[]
  try {
    outer = decodeMessage(Buffer.from(base64, 'base64'))
  } catch {
    return null
  }
  // Each field #1 is an entry: { 1: sentinelKey, 2: { 1: <base64 value> } }.
  for (const entry of outer) {
    if (entry.field !== 1 || !(entry.value instanceof Uint8Array)) continue
    const kv = decodeMessage(entry.value)
    const key = asString(kv.find((f) => f.field === 1))
    if (key !== AVAILABLE_SENTINEL) continue
    const wrap = asBytes(kv.find((f) => f.field === 2))
    if (!wrap) return null
    const innerB64 = asString(decodeMessage(wrap).find((f) => f.field === 1))
    if (!innerB64) return null
    const inner = decodeMessage(Buffer.from(innerB64, 'base64'))
    const credits = inner.find((f) => f.field === 2 && f.wire === 0)
    if (credits && typeof credits.value === 'bigint') {
      const n = Number(credits.value)
      return Number.isFinite(n) ? n : null
    }
    return null
  }
  return null
}
