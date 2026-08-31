/**
 * What's new.
 *
 * A plain list of release notes, reachable from About. Ported from Edge-Drop's
 * `ChangelogView` but static and offline — no GitHub fetch — and dressed in
 * Ledge tokens rather than the reference's hard-coded whites. Seeded with the
 * v0.1 entry; newer releases prepend to the array.
 *
 * The version names and dates are proper nouns and stay untranslated, the same
 * way provider names do; only the surrounding chrome runs through `t()`.
 */
import { t } from '../../i18n'
import '../styles/changelog.css'

interface Highlight {
  title: string
  description: string
}

interface Release {
  version: string
  date: string
  latest: boolean
  summary: string
  highlights: Highlight[]
}

const RELEASES: Release[] = [
  {
    version: 'v0.1.0',
    date: 'Aug 2026',
    latest: true,
    summary:
      'The first Ledge: one edge-docked frame carrying the clipboard shelf and the agent quota strip together.',
    highlights: [
      {
        title: 'One hub, two instruments',
        description:
          'The clipboard shelf and the quota HUD share a single docked frame instead of two mirrored panels.'
      },
      {
        title: 'Clipboard shelf',
        description:
          'Capture text, links, images and files. Pin, search, filter by kind, and drag any card straight into another app.'
      },
      {
        title: 'Stacks',
        description:
          'Drag one card onto another to bundle them, open a stack to drag members out, or split one back off.'
      },
      {
        title: 'Copy indicator',
        description:
          'A curve or flare blooms at the docked edge when a new clip is captured while the shelf is collapsed.'
      },
      {
        title: 'Quota strip',
        description:
          'A severity dot per provider and the hottest used-percentage, expanding into the full provider list.'
      }
    ]
  }
]

export function ChangelogView() {
  return (
    <div className="bz-changelog">
      {RELEASES.map((release) => (
        <article key={release.version} className="bz-changelog-release">
          <header className="bz-changelog-head">
            <span className="bz-changelog-version bz-num">{release.version}</span>
            {release.latest && <span className="bz-changelog-badge">{t('changelog.current')}</span>}
            <span className="bz-row-fill" />
            <span className="bz-changelog-date">{release.date}</span>
          </header>
          <p className="bz-changelog-summary">{release.summary}</p>
          <div className="bz-changelog-highlights">
            {release.highlights.map((highlight) => (
              <div key={highlight.title} className="bz-changelog-highlight">
                <p className="bz-changelog-highlight-title">{highlight.title}</p>
                <p className="bz-changelog-highlight-desc">{highlight.description}</p>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  )
}
