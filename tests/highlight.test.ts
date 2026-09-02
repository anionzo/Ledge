/**
 * The "is this code?" gate.
 *
 * The colouring itself belongs to highlight.js and is not worth re-testing.
 * What IS worth pinning is the decision to invoke it at all: a false positive
 * paints an ordinary sentence in keyword violet and looks broken, and it does
 * so on a clipboard shelf where most entries are not code. `looksLikeCode` is
 * the cheap pre-filter that keeps the library from ever being loaded for
 * those, so its judgement is the thing to hold still.
 */
import { describe, expect, it } from 'vitest'
import { looksLikeCode } from '../src/lib/highlight'

describe('looksLikeCode', () => {
  it('accepts snippets with structural punctuation', () => {
    for (const snippet of [
      'const total = items.filter((i) => i.pinned).length',
      'def merge(items, target):\n    return [*items, target]',
      'SELECT id, name FROM users WHERE active = 1',
      '.bz-panel { position: relative; opacity: 1; }',
      '{ "name": "ledge", "version": "0.1.0" }'
    ]) {
      expect(looksLikeCode(snippet), snippet).toBe(true)
    }
  })

  it('accepts an indented block even without punctuation on the first line', () => {
    expect(looksLikeCode('function names\n    alpha\n    beta\n    gamma')).toBe(true)
  })

  it('refuses ordinary prose, which is most of a clipboard', () => {
    for (const prose of [
      'Cost Meter — tinh tien theo token da dung',
      'Remember to ask about the release notes tomorrow morning',
      'Nguyen Van A, 0123456789, Ha Noi',
      'the quick brown fox jumps over the lazy dog again and again'
    ]) {
      expect(looksLikeCode(prose), prose).toBe(false)
    }
  })

  it('refuses anything too short to judge', () => {
    // Real code, but twelve characters of anything looks like twelve
    // characters of anything else — not worth a colour claim.
    expect(looksLikeCode('const x = 1')).toBe(false)
    expect(looksLikeCode('')).toBe(false)
    expect(looksLikeCode('   \n  ')).toBe(false)
  })

  it('refuses a bare URL, which has punctuation but no structure', () => {
    // A link is the single most common non-code clip with slashes and colons
    // in it, so it is the pre-filter's most important negative.
    expect(looksLikeCode('https://github.com/anionzo/Ledge/releases/latest')).toBe(false)
  })
})
