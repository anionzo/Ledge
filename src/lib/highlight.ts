/**
 * Syntax highlighting for clipboard text.
 *
 * Three things make this harder than dropping a highlighter in:
 *
 * 1. **There is no language hint.** A clip has no filename, no extension, no
 *    fence marker — just characters. So the highlighter has to guess, which
 *    rules out Shiki and Prism (both need to be told) and points at
 *    highlight.js, whose `highlightAuto` scores every registered grammar and
 *    returns the best fit with a relevance number.
 *
 * 2. **Most clips are not code.** A URL, a paragraph, an error message, a
 *    name — colouring those would be worse than leaving them alone, because
 *    it would assert a structure that is not there. `relevance` is the gate:
 *    real code scores well above prose, so anything under the threshold is
 *    rendered as plain text and no claim is made.
 *
 * 3. **It must not cost the panel its first paint.** The hub is judged on how
 *    fast it opens, and a highlighter with twenty grammars is a lot of
 *    JavaScript to parse for a feature only used when a preview is opened. So
 *    the library is behind a dynamic import, loaded the first time someone
 *    actually looks at a text clip and cached from then on.
 *
 * On safety: highlight.js escapes the source text as it tokenises — the HTML
 * it returns contains only its own `<span class="hljs-*">` wrappers around
 * escaped content. That is what makes it safe to hand to
 * `dangerouslySetInnerHTML` here, where the input is arbitrary text the user
 * copied from anywhere. Nothing else in this file may relax that.
 */

/** The result of a successful highlight. `null` means "this is not code". */
export interface Highlighted {
  /** The grammar that won, e.g. `typescript`. Shown as a small label. */
  language: string
  /** Escaped HTML with `hljs-*` spans. Safe for `dangerouslySetInnerHTML`. */
  html: string
}

/**
 * How well the winning grammar has to fit before the result is trusted.
 *
 * highlight.js scores a match by how many of a grammar's distinctive
 * constructs it found. Prose and single identifiers land at 0–3; a real
 * snippet of almost any language clears 10 easily. Ten is chosen to sit well
 * clear of the noise floor rather than at the edge of it: a false positive
 * paints a sentence in keyword violet and looks broken, while a false negative
 * just shows the plain text that was being shown before this existed.
 */
const MIN_RELEVANCE = 10

/**
 * Below this there is not enough text to judge. `const x = 1` is real code and
 * only twelve characters, but so is any twelve characters of a sentence — and
 * the difference matters less than not flickering colour onto short clips.
 */
const MIN_LENGTH = 24

/**
 * Grammars worth carrying, chosen for what lands on a developer's clipboard.
 *
 * A curated subset rather than the full bundle: all of highlight.js is nearly
 * a megabyte, and most of it is languages nobody here will paste. Each entry
 * is also a candidate `highlightAuto` has to score, so a longer list is slower
 * AND more likely to mis-guess — `xml` and `markdown` in particular will claim
 * almost anything, and are included only because HTML and READMEs are common
 * enough to be worth the risk.
 */
type Registry = typeof import('highlight.js/lib/core').default

let loading: Promise<Registry> | null = null

async function registry(): Promise<Registry> {
  loading ??= (async () => {
    const [
      { default: hljs },
      { default: javascript },
      { default: typescript },
      { default: python },
      { default: json },
      { default: bash },
      { default: powershell },
      { default: css },
      { default: xml },
      { default: sql },
      { default: yaml },
      { default: markdown },
      { default: java },
      { default: go },
      { default: rust },
      { default: cpp },
      { default: csharp },
      { default: php },
      { default: ruby },
      { default: diff },
      { default: ini }
    ] = await Promise.all([
      import('highlight.js/lib/core'),
      import('highlight.js/lib/languages/javascript'),
      import('highlight.js/lib/languages/typescript'),
      import('highlight.js/lib/languages/python'),
      import('highlight.js/lib/languages/json'),
      import('highlight.js/lib/languages/bash'),
      import('highlight.js/lib/languages/powershell'),
      import('highlight.js/lib/languages/css'),
      import('highlight.js/lib/languages/xml'),
      import('highlight.js/lib/languages/sql'),
      import('highlight.js/lib/languages/yaml'),
      import('highlight.js/lib/languages/markdown'),
      import('highlight.js/lib/languages/java'),
      import('highlight.js/lib/languages/go'),
      import('highlight.js/lib/languages/rust'),
      import('highlight.js/lib/languages/cpp'),
      import('highlight.js/lib/languages/csharp'),
      import('highlight.js/lib/languages/php'),
      import('highlight.js/lib/languages/ruby'),
      import('highlight.js/lib/languages/diff'),
      import('highlight.js/lib/languages/ini')
    ])

    hljs.registerLanguage('javascript', javascript)
    hljs.registerLanguage('typescript', typescript)
    hljs.registerLanguage('python', python)
    hljs.registerLanguage('json', json)
    hljs.registerLanguage('bash', bash)
    hljs.registerLanguage('powershell', powershell)
    hljs.registerLanguage('css', css)
    hljs.registerLanguage('xml', xml)
    hljs.registerLanguage('sql', sql)
    hljs.registerLanguage('yaml', yaml)
    hljs.registerLanguage('markdown', markdown)
    hljs.registerLanguage('java', java)
    hljs.registerLanguage('go', go)
    hljs.registerLanguage('rust', rust)
    hljs.registerLanguage('cpp', cpp)
    hljs.registerLanguage('csharp', csharp)
    hljs.registerLanguage('php', php)
    hljs.registerLanguage('ruby', ruby)
    hljs.registerLanguage('diff', diff)
    hljs.registerLanguage('ini', ini)
    return hljs
  })()
  return loading
}

/**
 * True when a string is worth showing a highlighter at all.
 *
 * A cheap pre-filter so the library is never loaded for a name, a URL or a
 * sentence. Deliberately crude — the real decision is `relevance` — but it
 * saves the dynamic import on the clips that make up most of a shelf.
 */
export function looksLikeCode(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < MIN_LENGTH) return false
  // A single line with no punctuation that codes for structure is prose.
  const structural = /[{}();=<>[\]]|^\s{2,}\S|\n\s+\S|^(?:const|let|var|def|function|class|import|from|SELECT|#include|package|fn|func)\b/m
  return structural.test(trimmed)
}

/**
 * Highlight `text`, or return null when it is not confidently code.
 *
 * Never throws: a grammar that fails on hostile input, or a dynamic import
 * that fails offline, degrades to plain text — which is exactly what was
 * rendered before this feature existed.
 */
export async function highlight(text: string): Promise<Highlighted | null> {
  if (!looksLikeCode(text)) return null
  try {
    const hljs = await registry()
    const result = hljs.highlightAuto(text)
    if (!result.language || result.relevance < MIN_RELEVANCE) return null
    return { language: result.language, html: result.value }
  } catch {
    return null
  }
}
