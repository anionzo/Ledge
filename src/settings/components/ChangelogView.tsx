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
    version: 'v0.1.5',
    date: 'Sep 2026',
    latest: true,
    summary: 'The update control moved to where a tray app is actually used.',
    highlights: [
      {
        title: 'Updates from the tray',
        description:
          'Right-click the tray icon to check, download, or restart into a new version — no hunting through Settings. The tooltip says when one is waiting.'
      }
    ]
  },
  {
    version: 'v0.1.4',
    date: 'Sep 2026',
    latest: false,
    summary:
      'The smoothness wave: the edge knows the difference between passing through and arriving, and the hub can be pinned to a monitor.',
    highlights: [
      {
        title: 'Seam-aware edge',
        description:
          'Sailing across the boundary between two monitors no longer opens the hub. Resting at the edge still does.'
      },
      {
        title: 'Pick your monitor',
        description:
          'Choose which display the hub docks to. It finds the same physical monitor again after a reboot, even when Windows renumbers them.'
      },
      {
        title: 'Drag that lands',
        description:
          'A five-pixel guard keeps a click a click, and the hub steps out of the way mid-drag so Explorer can receive the drop.'
      },
      {
        title: 'Clear what you can see',
        description:
          'Clear the last hour, six hours or day — scoped to the filter and search in front of you. Optional auto-delete and clear-on-restart. Pinned items never go.'
      },
      {
        title: 'Honest captures',
        description:
          'Spreadsheet cells stay text instead of becoming a screenshot, Snipping Tool clips drag out named for when they were taken, and GIFs animate.'
      },
      {
        title: 'Updates',
        description:
          'New versions arrive in the background and install on the next restart. Store builds leave it to the store.'
      }
    ]
  },
  {
    version: 'v0.1.3',
    date: 'Aug 2026',
    latest: false,
    summary: 'Two quota readers told the truth again.',
    highlights: [
      {
        title: 'Grok unified billing',
        description: "Handles xAI's new response shape instead of showing a dash."
      },
      {
        title: 'Antigravity credits',
        description:
          'Reads the real credit balance out of the editor state database rather than guessing at it.'
      }
    ]
  },
  {
    version: 'v0.1.2',
    date: 'Aug 2026',
    latest: false,
    summary: 'The polish wave — parity with the shelf this grew out of, and a design pass over all of it.',
    highlights: [
      {
        title: 'Obsidian Blade',
        description: 'A dark violet ground, one accent, and spring motion throughout.'
      },
      {
        title: 'Usage tracking',
        description: 'Burn rate, pace and a sparkline of recent history per provider.'
      },
      {
        title: 'Shelf parity',
        description: 'Thirteen interactions carried over from Edge-Drop, from prestaged drags to the preview flyout.'
      }
    ]
  },
  {
    version: 'v0.1.1',
    date: 'Aug 2026',
    latest: false,
    summary: 'Installers for every platform, built by CI.',
    highlights: [
      {
        title: 'Windows, macOS, Linux',
        description:
          'Each platform is built on its own runner and published to the GitHub release for the tag.'
      }
    ]
  },
  {
    version: 'v0.1.0',
    date: 'Aug 2026',
    latest: false,
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
