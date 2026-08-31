import { describe, expect, it } from 'vitest'
import {
  decodeMessage,
  parseAvailableCredits
} from '../electron/features/quota/providers/antigravityCredits'

// ── minimal protobuf encoder, only what the fixture needs ──────────────────
function varint(n: number): Buffer {
  const out: number[] = []
  let v = n
  do {
    let b = v & 0x7f
    v >>>= 7
    if (v) b |= 0x80
    out.push(b)
  } while (v)
  return Buffer.from(out)
}
function tag(field: number, wire: number): Buffer {
  return varint((field << 3) | wire)
}
function varintField(field: number, n: number): Buffer {
  return Buffer.concat([tag(field, 0), varint(n)])
}
function bytesField(field: number, buf: Buffer): Buffer {
  return Buffer.concat([tag(field, 2), varint(buf.length), buf])
}
function strField(field: number, s: string): Buffer {
  return bytesField(field, Buffer.from(s, 'utf8'))
}

/** Build the modelCredits base64 the way Antigravity's state.vscdb stores it. */
function buildModelCredits(available: number): string {
  const innerValue = varintField(2, available) // { 2: <credits> }
  const innerB64 = innerValue.toString('base64')
  const entry = Buffer.concat([
    strField(1, 'availableCreditsSentinelKey'),
    bytesField(2, strField(1, innerB64)) // { 2: { 1: <base64 value> } }
  ])
  const outer = bytesField(1, entry) // repeated field 1
  return outer.toString('base64')
}

describe('antigravity credits decode', () => {
  it('reads a varint field', () => {
    const msg = decodeMessage(varintField(2, 1000))
    expect(msg).toHaveLength(1)
    expect(msg[0].field).toBe(2)
    expect(Number(msg[0].value)).toBe(1000)
  })

  it('parses available credits out of the nested/base64 structure', () => {
    expect(parseAvailableCredits(buildModelCredits(1000))).toBe(1000)
    expect(parseAvailableCredits(buildModelCredits(0))).toBe(0)
    expect(parseAvailableCredits(buildModelCredits(37))).toBe(37)
  })

  it('matches the real on-disk sample (EOgH → 1000)', () => {
    // 'EOgH' is base64 of [0x10, 0xe8, 0x07] = field 2 varint 1000, the exact
    // inner value observed in a live Antigravity state.vscdb.
    const entry = Buffer.concat([
      strField(1, 'availableCreditsSentinelKey'),
      bytesField(2, strField(1, 'EOgH'))
    ])
    expect(parseAvailableCredits(bytesField(1, entry).toString('base64'))).toBe(1000)
  })

  it('returns null for the wrong sentinel or garbage', () => {
    const entry = Buffer.concat([
      strField(1, 'somethingElseKey'),
      bytesField(2, strField(1, 'EOgH'))
    ])
    expect(parseAvailableCredits(bytesField(1, entry).toString('base64'))).toBeNull()
    expect(parseAvailableCredits('not-base64-@@@')).toBeNull()
    expect(parseAvailableCredits('')).toBeNull()
  })
})
