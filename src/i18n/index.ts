/// <reference types="vite/client" />
/**
 * Minimal i18n.
 *
 * Ledge ships 31 locales eventually, so the shape matters more than the
 * content: every locale is a flat `Record<string, string>` keyed by a dotted
 * path. Flat, not nested, because a translator working in a spreadsheet — or a
 * machine pass — never has to reason about object structure, and a missing key
 * degrades to the English string instead of crashing on `undefined.foo`.
 *
 * Only `en` lives here. The other thirty locales are registered at runtime,
 * so adding a language never means editing this file.
 */

export type Dictionary = Record<string, string>

/** Values allowed in `{placeholder}` slots. Numbers are formatted by locale. */
export type TParams = Record<string, string | number>

/**
 * English is both the source of truth and the fallback. Keys are
 * `<area>.<thing>.<variant>`; the area prefix is what lets a translator see at
 * a glance which window a string belongs to.
 */
export const en: Dictionary = {
  // ── Product ──────────────────────────────────────────────────────────────
  'app.name': 'Ledge',
  'app.shelf': 'Shelf',
  'app.gauge': 'Gauge',

  // ── Shared vocabulary ────────────────────────────────────────────────────
  'common.close': 'Close',
  'common.cancel': 'Cancel',
  'common.retry': 'Retry',
  'common.copy': 'Copy',
  'common.paste': 'Paste',
  'common.delete': 'Delete',
  'common.clear': 'Clear',
  'common.pin': 'Pin',
  'common.unpin': 'Unpin',
  'common.search': 'Search',
  'common.settings': 'Settings',
  'common.refresh': 'Refresh',
  'common.unknown': 'Unknown',
  'common.none': 'None',
  'common.more': 'More',
  'common.back': 'Back',
  'common.reveal': 'Show in folder',
  'common.open': 'Open',
  'common.dismiss': 'Dismiss',

  // ── Durations. Assembled from parts so other scripts can reorder them. ────
  'time.days': '{d}d {h}h',
  'time.hours': '{h}h {m}m',
  'time.minutes': '{m}m',
  'time.seconds': '{s}s',
  'time.now': 'now',
  'time.just_now': 'just now',
  'time.ago': '{duration} ago',

  // ── Sizes ────────────────────────────────────────────────────────────────
  'size.bytes': '{n} B',
  'size.kb': '{n} KB',
  'size.mb': '{n} MB',
  'size.gb': '{n} GB',

  // ── Units ────────────────────────────────────────────────────────────────
  // One shared percent format so every reading writes the sign the same way,
  // and a locale that spaces or positions it differently can say so once.
  'unit.percent': '{n}%',

  // ── Key names (shortcut display only) ────────────────────────────────────
  // The Space accelerator itself is always the literal Electron token 'Space';
  // this is only what the recorded shortcut reads as on screen.
  'keys.space': 'Space',

  // ── Shelf ────────────────────────────────────────────────────────────────
  'shelf.title': 'Shelf',
  'shelf.search.placeholder': 'Search',
  'shelf.search.clear': 'Clear search',
  'shelf.count': '{n} items',
  'shelf.empty.title': 'Nothing on the shelf',
  'shelf.empty.body': 'Copy text, a link, an image or a file and it lands here.',
  'shelf.empty.filtered.title': 'No matches',
  'shelf.empty.filtered.body': 'Nothing on the shelf matches that search.',
  'shelf.kind.text': 'Text',
  'shelf.kind.link': 'Link',
  'shelf.kind.image': 'Image',
  'shelf.kind.file': 'File',
  'shelf.kind.folder': 'Folder',
  'shelf.kind.stack': 'Stack',
  'shelf.item.pinned': 'Pinned',
  'shelf.item.chars': '{n} chars',
  'shelf.item.dimensions': '{w} x {h}',
  'shelf.item.uses': 'Used {n} times',
  'shelf.item.menu': 'Item actions',
  'shelf.stack.members': '{n} in stack',
  'shelf.stack.member': 'Item {n} of {total}',
  'shelf.select.enter': 'Select',
  'shelf.select.count': '{n} selected',
  'shelf.select.all': 'Select all',
  'shelf.select.none': 'Clear selection',
  'shelf.select.exit': 'Done',
  'shelf.action.clear_unpinned': 'Clear unpinned',
  'shelf.preview.title': 'Preview',
  'shelf.preview.loading': 'Loading full text',
  'shelf.preview.view_full': 'View full size',
  'shelf.preview.close_full': 'Close',
  'shelf.preview.fact.size': 'Size',
  'shelf.preview.fact.type': 'Type',
  'shelf.preview.fact.dimensions': 'Dimensions',
  'shelf.preview.fact.characters': 'Characters',
  'shelf.preview.open_link': 'Open link',
  'shelf.preview.split': 'Take out of stack',
  'shelf.toast.copied': 'Copied',
  'shelf.toast.copy_failed': 'Could not copy',
  'shelf.toast.deleted': 'Deleted {n}',
  'shelf.toast.added': 'Added {n}',
  'shelf.toast.merged': 'Merged into a stack',
  'shelf.toast.stack_full': 'That stack is full',

  // ── Link cards (offline URL preview) ─────────────────────────────────────
  // Brand nouns (GitHub, YouTube, r/, @) stay literal; only the plain-language
  // primary line is translated.
  'shelf.link.web': 'Web Link',
  'shelf.link.issue': 'Issue #{n}',
  'shelf.link.pr': 'PR #{n}',
  'shelf.link.pin': 'Pin #{n}',
  'shelf.link.video': 'Video ({id})',

  // ── File kinds (badges/labels for non-image files) ───────────────────────
  'fileKinds.pdf': 'PDF',
  'fileKinds.word': 'Word',
  'fileKinds.excel': 'Excel',
  'fileKinds.powerpoint': 'Slides',
  'fileKinds.archive': 'Archive',
  'fileKinds.text': 'Text',
  'fileKinds.code': 'Code',
  'fileKinds.audio': 'Audio',
  'fileKinds.video': 'Video',
  'fileKinds.image': 'Image',
  'fileKinds.executable': 'App',
  'fileKinds.folder': 'Folder',
  'fileKinds.file': 'File',

  // ── Filters ──────────────────────────────────────────────────────────────
  'shelf.filter.all': 'All',
  'shelf.filter.text': 'Text',
  'shelf.filter.links': 'Links',
  'shelf.filter.images': 'Images',
  'shelf.filter.files': 'Files',
  'shelf.filter.label': 'Filter by kind',

  // ── Clear menu ───────────────────────────────────────────────────────────
  'shelf.clear.menu': 'Clear history',
  'shelf.clear.unpinned': 'Clear unpinned',
  'shelf.clear.all': 'Clear all',
  'shelf.clear.all_confirm': 'Tap again to clear everything',

  // ── Drop target ──────────────────────────────────────────────────────────
  'shelf.drop.hint': 'Drop to add to the shelf',

  // ── Incognito ────────────────────────────────────────────────────────────
  'shelf.incognito.badge': 'Paused',
  'shelf.incognito.title': 'Capture is paused. History is untouched.',

  // ── Stack ────────────────────────────────────────────────────────────────
  'shelf.stack.expand': 'Open stack',
  'shelf.stack.collapse': 'Close stack',

  // ── Onboarding ───────────────────────────────────────────────────────────
  'onboarding.skip': 'Skip',
  'onboarding.back': 'Back',
  'onboarding.next': 'Next',
  'onboarding.done': 'Get started',
  'onboarding.step': 'Step {n} of {total}',
  'onboarding.hover.title': 'Hover to open',
  'onboarding.hover.body': 'Ledge lives on the screen edge. Nudge the pointer into the edge and the shelf slides out; move away and it hides.',
  'onboarding.drag.title': 'Drag anything out',
  'onboarding.drag.body': 'Drag any card straight into another app, or drop files onto the shelf to keep them here.',
  'onboarding.quota.title': 'Watch your quota',
  'onboarding.quota.body': 'The strip along the top shows how close your agents are to their limits. Tap it to see every provider.',

  // ── Changelog ────────────────────────────────────────────────────────────
  'settings.about.whats_new': "What's new",
  'settings.about.whats_new.show': 'View changelog',
  'settings.about.whats_new.hide': 'Hide changelog',
  'changelog.current': 'Current',

  // ── Gauge ────────────────────────────────────────────────────────────────
  'gauge.title': 'Gauge',
  'gauge.updated': 'Updated {time}',
  'gauge.strip.details': 'Show all providers',
  'gauge.refresh': 'Refresh quotas',
  'gauge.empty.title': 'No agents enabled',
  'gauge.empty.body': 'Turn a provider on in Settings and its quota appears here.',
  'gauge.window.session': 'Session',
  'gauge.window.weekly': 'Weekly',
  'gauge.resets_in': 'Resets in {duration}',
  'gauge.resets_now': 'Resetting',
  'gauge.reset_unknown': 'Reset time unknown',
  'gauge.stale': 'Last known',
  'gauge.stale.explain': 'Refresh failed. This is the reading from {time}.',
  'gauge.state.not_installed': 'Not installed',
  'gauge.state.not_installed.body': 'No CLI for this provider was found on this machine.',
  'gauge.state.logged_out': 'Signed out',
  'gauge.state.logged_out.body': 'Sign in with the provider CLI, then refresh.',
  'gauge.state.permission_required': 'Permission needed',
  'gauge.state.permission_required.body': 'The system blocked reading this credential.',
  'gauge.state.unsupported_platform': 'Not available here',
  'gauge.state.unsupported_platform.body':
    'This provider has no reader for your operating system.',
  'gauge.state.error': 'Read failed',
  'gauge.state.error.body': 'The quota could not be read.',
  'gauge.ring.aria': '{name}: {percent} percent of quota used',
  'gauge.ring.aria_unknown': '{name}: usage unknown',
  'gauge.ring.unknown': 'Usage unknown',

  // Burn rate and usage history.
  'gauge.pace.hot': 'Burning fast',
  'gauge.history.title': 'Usage trend',
  'gauge.history.none': 'No history yet',

  // Balance-shaped providers (DeepSeek, gateway relays): money left, not a
  // used-percentage.
  'gauge.balance.available': 'Balance available',
  'gauge.balance.unavailable': 'Insufficient balance',
  'gauge.balance.granted': 'Granted',
  'gauge.balance.topup': 'Top-up',
  'gauge.balance.aria': '{name}: {currency} {amount} balance, {status}',

  // Cost Meter. Real spend is a prepaid balance falling over time (Ledge is a
  // spectator and cannot count tokens); the price line is a reference only.
  'gauge.cost.metered': 'Spent today: {currency} {today} · this month: {currency} {month}',
  'gauge.cost.subscription': 'Subscription — no per-use cost',
  'gauge.cost.price_ref': '{model}: {input}/{output} $ per 1M in/out',

  // ── Settings ─────────────────────────────────────────────────────────────
  'settings.title': 'Ledge',
  'settings.tabs': 'Settings sections',
  'settings.tab.behaviour': 'Behaviour',
  'settings.tab.panels': 'Panels',
  'settings.tab.agents': 'Agents',
  'settings.tab.appearance': 'Appearance',
  'settings.tab.about': 'About',
  'settings.saving': 'Saving',
  'settings.saved': 'Saved',
  'settings.save_failed': 'Could not save',

  'settings.behaviour.startup': 'Startup',
  'settings.behaviour.launch_at_login': 'Launch at login',
  'settings.behaviour.launch_at_login.help': 'Start Ledge when you sign in.',
  'settings.behaviour.presence': 'Presence',
  'settings.behaviour.suppress_fullscreen': 'Stand down for fullscreen apps',
  'settings.behaviour.suppress_fullscreen.help':
    'Keep both panels out of the way while a game or fullscreen app is in front.',
  'settings.behaviour.hotkeys': 'Shortcuts',
  'settings.behaviour.hotkey_shelf': 'Toggle Shelf',
  'settings.behaviour.hotkey_gauge': 'Toggle Gauge',
  'settings.behaviour.hotkey.help': 'Click a shortcut, then press the combination you want.',
  'settings.behaviour.hotkey.recording': 'Press keys',
  'settings.behaviour.hotkey.edit': 'Edit',
  'settings.behaviour.hotkey.reset': 'Reset to default',
  'settings.behaviour.shelf': 'Clipboard',
  'settings.behaviour.incognito': 'Pause capture (incognito)',
  'settings.behaviour.incognito.help': 'Stop catching new clips. What is already on the shelf stays.',
  'settings.behaviour.hover_activation': 'Open on edge hover',
  'settings.behaviour.hover_activation.help': 'When off, the shelf only opens with the shortcut.',
  'settings.behaviour.preview_enabled': 'Show preview',
  'settings.behaviour.preview_enabled.help': 'Open a detail flyout when you inspect an item.',
  'settings.behaviour.privacy': 'Privacy',
  'settings.behaviour.encrypt_history': 'Encrypt clipboard history',
  'settings.behaviour.encrypt_history.help':
    'Store the shelf using your operating system key store.',
  'settings.behaviour.sounds': 'Play sounds',

  'settings.panels.intro':
    'One frame docks to a screen edge and carries both features: the quota HUD as a strip at the top, the clipboard below it.',
  'settings.panels.shelf': 'Shelf',
  'settings.panels.gauge': 'Gauge',
  'settings.panels.frame': 'Frame',
  'settings.panels.clipboard': 'Clipboard',
  'settings.panels.quota': 'Quota',
  'settings.panels.sections': 'Sections',
  'settings.panels.sections.help': 'Turn either half of the hub off. The frame stays for the other.',
  'settings.panels.clipboard.enabled': 'Show the clipboard',
  'settings.panels.quota.enabled': 'Show the quota strip',
  'settings.panels.enabled': 'Enabled',
  'settings.panels.side': 'Screen edge',
  'settings.panels.side.left': 'Left',
  'settings.panels.side.right': 'Right',
  'settings.panels.side.same_edge': 'Both panels are on the same edge. They will overlap.',
  'settings.panels.proximity': 'Edge sensitivity',
  'settings.panels.proximity.help':
    'How close the pointer must come to the edge before the panel arms.',
  'settings.panels.height': 'Panel height',
  'settings.panels.trigger_align': 'Trigger position',
  'settings.panels.trigger.top': 'Top',
  'settings.panels.trigger.center': 'Centre',
  'settings.panels.trigger.bottom': 'Bottom',
  'settings.panels.max_items': 'History size',
  'settings.panels.max_items.help': 'Oldest unpinned items are dropped past this count.',
  'settings.panels.refresh_interval': 'Refresh every',
  'settings.panels.alert_threshold': 'Alert at',
  'settings.panels.alert_threshold.help': 'The ring turns critical at or above this usage.',
  'settings.panels.collapse': 'When closed',
  'settings.panels.collapse.clickthrough': 'Stay full size and let clicks pass through.',
  'settings.panels.collapse.resize': 'Shrink to a {n} px grip, because this system cannot pass clicks through a window.',
  'settings.panels.pixels': '{n} px',
  'settings.panels.percent': '{n}%',
  'settings.panels.seconds': '{n}s',
  'settings.panels.items': '{n} items',

  'settings.agents.builtin': 'Built in',
  'settings.agents.custom': 'Custom',
  'settings.agents.add': 'Add provider',
  'settings.agents.remove': 'Remove provider',
  'settings.agents.name': 'Name',
  'settings.agents.command': 'Command',
  'settings.agents.command.help': 'Its stdout is read as JSON.',
  'settings.agents.test': 'Test',
  'settings.agents.testing': 'Testing',
  'settings.agents.manual_session': 'Session used',
  'settings.agents.manual_weekly': 'Weekly used',
  'settings.agents.empty': 'No custom providers yet.',
  'settings.agents.new_name': 'New provider',

  // How a custom provider gets its number.
  'settings.agents.mode': 'Source',
  'settings.agents.mode.command': 'Command',
  'settings.agents.mode.http': 'HTTP',
  'settings.agents.mode.manual': 'Manual',
  // What the number means, which decides ring vs balance bar.
  'settings.agents.shape': 'Shape',
  'settings.agents.shape.percent': 'Percent',
  'settings.agents.shape.balance': 'Balance',
  // HTTP mode.
  'settings.agents.url': 'URL',
  'settings.agents.url.help': 'The HTTPS endpoint to GET. Its JSON body is read.',
  'settings.agents.token': 'Bearer token',
  'settings.agents.json_path': 'JSON path',
  'settings.agents.json_path.help': 'Dot-path to the value in the body, e.g. data.quota.',
  'settings.agents.http.help':
    'Covers gateway relays like Sub2API, new-api and one-api without a bespoke reader.',
  // Manual balance shape.
  'settings.agents.amount': 'Amount',
  'settings.agents.currency': 'Currency',
  'settings.agents.manual.help': 'Type the numbers the Gauge should show.',

  'settings.appearance.theme': 'Theme',
  'settings.appearance.theme.system': 'System',
  'settings.appearance.theme.light': 'Light',
  'settings.appearance.theme.dark': 'Dark',
  'settings.appearance.language': 'Language',
  'settings.appearance.language.system': 'System',
  'settings.appearance.panel_opacity': 'Panel opacity',
  'settings.appearance.panel_opacity.help':
    'Higher is more solid; lower lets the desktop show through the frosted glass.',
  'settings.appearance.text_scale': 'Text size',
  'settings.appearance.text_scale.help': 'Scale the shelf text up or down.',
  'settings.appearance.text_scale.sm': 'Small',
  'settings.appearance.text_scale.md': 'Normal',
  'settings.appearance.text_scale.lg': 'Large',
  'settings.appearance.indicator': 'Copy indicator',
  'settings.appearance.indicator.help': 'The flourish shown at the docked edge when a new clip is captured.',
  'settings.appearance.indicator.off': 'Off',
  'settings.appearance.indicator.curve': 'Curve',
  'settings.appearance.indicator.flare': 'Flare',
  'settings.appearance.motion': 'Motion',
  'settings.appearance.reduce_motion': 'Reduce motion',
  'settings.appearance.reduce_motion.help': 'Remove the panel slide and the ring sweep.',
  'settings.appearance.preview': 'Preview',
  'settings.appearance.band.ok': 'Comfortable',
  'settings.appearance.band.warn': 'Watch',
  'settings.appearance.band.critical': 'Critical',
  'settings.appearance.preview.help':
    'The rings are the only place colour carries meaning. Everything else is achromatic on purpose.',

  'settings.about.tagline': 'One frame, two screen edges.',
  'settings.about.version': 'Version {version}',
  'settings.about.platform': 'Platform',
  'settings.about.capabilities': 'What this system supports',
  'settings.about.cap.clickThrough': 'Click-through collapse',
  'settings.about.cap.noActivate': 'Non-activating windows',
  'settings.about.cap.fullscreenDetection': 'Fullscreen detection',
  'settings.about.cap.autostart': 'Launch at login',
  'settings.about.cap.encryptedStorage': 'Encrypted storage',
  'settings.about.cap.alwaysOnTopOverFullscreen': 'Float over fullscreen',
  'settings.about.cap.yes': 'Supported',
  'settings.about.cap.no': 'Not supported',
  'settings.about.quit': 'Quit Ledge'
}

const locales: Record<string, Dictionary> = { en }

/**
 * Ledge-native locale packs: full `Dictionary` maps keyed by Ledge's own flat
 * `<area>.<thing>` paths, so they translate every string the UI shows — the
 * quota HUD included — not just the shared vocabulary the Edge-Drop packs cover.
 * Loaded here and merged straight into `locales`, where `lookupActive` picks
 * them ahead of the aliased pack strings. Adding a language is dropping a JSON
 * file into `./ledge/`; a key it omits still falls back to English.
 */
const ledgeNative = import.meta.glob<Dictionary>('./ledge/*.json', {
  eager: true,
  import: 'default'
})
for (const [ledgePath, dict] of Object.entries(ledgeNative)) {
  const code = ledgePath.slice(ledgePath.lastIndexOf('/') + 1).replace(/\.json$/, '')
  locales[code] = { ...(locales[code] ?? {}), ...dict }
}

/**
 * The 31 real locale packs carried over from Edge-Drop.
 *
 * These were written against Edge-Drop's own key taxonomy (`header.*`,
 * `item.*`, `behaviour.*`, …), not Ledge's flat `<area>.<thing>` keys, so they
 * cannot be dropped in as `Dictionary` replacements. They are loaded here as
 * flattened dot-path maps and reached through `ALIAS` below, which points a
 * Ledge key at the Edge-Drop key that carries the same string. The upshot: the
 * shared clipboard-and-settings surface translates into all 31 languages
 * (Vietnamese included), while Ledge-only vocabulary the packs never had —
 * chiefly the quota HUD — stays on the English source until it is translated.
 * Never a fabricated translation; an untranslated string shows in English.
 */
type FlatDict = Record<string, string>

function flatten(node: unknown, prefix: string, out: FlatDict): void {
  if (node === null || typeof node !== 'object') return
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out[path] = value
    else flatten(value, path, out)
  }
}

const edgeLocales: Record<string, FlatDict> = (() => {
  const modules = import.meta.glob<Record<string, unknown>>('./locales/*.json', {
    eager: true,
    import: 'default'
  })
  const result: Record<string, FlatDict> = {}
  for (const [path, json] of Object.entries(modules)) {
    // './locales/zh-CN.json' -> 'zh-CN'
    const code = path.slice(path.lastIndexOf('/') + 1).replace(/\.json$/, '')
    const flat: FlatDict = {}
    flatten(json, '', flat)
    result[code] = flat
  }
  return result
})()

/**
 * Ledge key -> Edge-Drop key, for the strings the two products share.
 *
 * Only mappings whose placeholder slots match (or where neither side has one)
 * are listed: aliasing `'{n} selected'` onto a pack string that says
 * `'{count} Selected'` would leave a `{count}` sitting unfilled in the UI, so
 * those keep the English source instead.
 */
const ALIAS: Record<string, string> = {
  'common.close': 'header.close',
  'common.cancel': 'behaviour.hotkeyCancel',
  'common.retry': 'behaviour.tryAgain',
  'common.copy': 'item.copy',
  'common.paste': 'flyout.paste',
  'common.delete': 'item.delete',
  'common.clear': 'item.clear',
  'common.pin': 'item.pin',
  'common.unpin': 'item.unpin',
  'common.settings': 'header.settings',
  'common.back': 'onboarding.back',
  'common.reveal': 'flyout.openInExplorer',

  'shelf.search.placeholder': 'header.searchPlaceholder',
  'shelf.filter.all': 'filters.all',
  'shelf.filter.text': 'filters.text',
  'shelf.filter.links': 'filters.links',
  'shelf.filter.images': 'filters.images',
  'shelf.filter.files': 'filters.files',
  'shelf.clear.all': 'item.clearAll',
  'shelf.clear.all_confirm': 'item.clearAllConfirm',
  'onboarding.skip': 'onboarding.skip',
  'onboarding.back': 'onboarding.back',
  'onboarding.next': 'onboarding.next',
  'onboarding.done': 'onboarding.getStarted',
  'changelog.current': 'flyout.current',
  'settings.appearance.text_scale': 'appearance.textSizeTitle',
  'settings.appearance.text_scale.sm': 'appearance.small',
  'settings.appearance.text_scale.md': 'appearance.normal',
  'settings.appearance.text_scale.lg': 'appearance.large',
  'settings.behaviour.hotkey.edit': 'behaviour.hotkeyEdit',
  'shelf.item.pinned': 'item.pinned',
  'shelf.kind.text': 'item.textItem',
  'shelf.kind.image': 'item.imageItem',
  'shelf.kind.file': 'item.fileItem',
  'shelf.kind.link': 'item.linkItem',
  'shelf.empty.title': 'emptyState.shelfEmpty',
  'shelf.empty.body': 'emptyState.shelfEmptyHint',
  'shelf.empty.filtered.title': 'emptyState.noResultsFound',
  'shelf.empty.filtered.body': 'emptyState.noResultsHint',
  'shelf.select.all': 'flyout.selectAll',
  'shelf.preview.open_link': 'flyout.openLink',
  'shelf.preview.split': 'item.ungroup',
  'shelf.toast.copied': 'toast.copiedToClipboard',

  'settings.tab.behaviour': 'tabs.behaviour',
  'settings.tab.appearance': 'tabs.appearance',
  'settings.appearance.language': 'behaviour.languageTitle',
  'settings.appearance.language.system': 'behaviour.systemDefault',
  'settings.behaviour.launch_at_login': 'behaviour.launchAtLoginTitle',
  'settings.behaviour.launch_at_login.help': 'behaviour.launchAtLoginDesc',
  'settings.behaviour.sounds': 'behaviour.soundEffectsTitle',
  'settings.behaviour.suppress_fullscreen': 'behaviour.fullscreenProtectionTitle',
  'settings.behaviour.suppress_fullscreen.help': 'behaviour.fullscreenProtectionDesc',
  'settings.panels.side.left': 'tray.left',
  'settings.panels.side.right': 'tray.right',

  // File kinds. The packs carry a `fileKinds.*` block of their own, so the
  // Ledge key points straight at the same-named pack key. `executable` and
  // `folder` have no pack entry and stay on the English source.
  'fileKinds.pdf': 'fileKinds.pdf',
  'fileKinds.word': 'fileKinds.word',
  'fileKinds.excel': 'fileKinds.excel',
  'fileKinds.powerpoint': 'fileKinds.powerpoint',
  'fileKinds.archive': 'fileKinds.archive',
  'fileKinds.text': 'fileKinds.text',
  'fileKinds.code': 'fileKinds.code',
  'fileKinds.audio': 'fileKinds.audio',
  'fileKinds.video': 'fileKinds.video',
  'fileKinds.image': 'fileKinds.image',
  'fileKinds.file': 'fileKinds.file'
}

let active = 'en'

/** Register a locale. Called once at startup with the user's language pack. */
export function registerLocale(code: string, dict: Dictionary): void {
  locales[code] = dict
}

/**
 * Set the active locale. Unknown codes fall back through the base language
 * (`pt-BR` -> `pt` -> `en`) rather than erroring, because the OS reports
 * region-tagged codes we may only translate at language level.
 */
export function setLocale(code: string): string {
  const wanted = code === 'system' ? navigatorLanguage() : code
  active = resolve(wanted)
  return active
}

export function getLocale(): string {
  return active
}

/**
 * Codes offered in the Settings language picker: the English source plus every
 * pack that was carried over. De-duplicated, since `en` exists in both.
 */
export function availableLocales(): string[] {
  return Array.from(new Set(['en', ...Object.keys(locales), ...Object.keys(edgeLocales)]))
}

function hasLocale(code: string): boolean {
  return Boolean(locales[code]) || Boolean(edgeLocales[code])
}

function resolve(code: string): string {
  if (hasLocale(code)) return code
  const base = code.split('-')[0]
  if (base && hasLocale(base)) return base
  return 'en'
}

/**
 * Resolve a Ledge key in the active locale, or null if this locale has nothing
 * for it. A directly-registered `Dictionary` wins over an aliased pack string,
 * so a future full Ledge translation can override the borrowed one key by key.
 */
function lookupActive(key: string): string | null {
  const direct = locales[active]?.[key]
  if (direct !== undefined) return direct
  const aliasKey = ALIAS[key]
  if (aliasKey) {
    const pack = edgeLocales[active]?.[aliasKey]
    if (pack !== undefined) return pack
  }
  return null
}

function navigatorLanguage(): string {
  return typeof navigator === 'undefined' ? 'en' : navigator.language
}

/**
 * Look up a key and fill its `{placeholder}` slots.
 *
 * A missing key returns the key itself, not an empty string: a visible
 * `shelf.item.uses` in the UI is a bug report, whereas a blank space is a
 * mystery nobody files.
 */
export function t(key: string, params?: TParams): string {
  const raw = lookupActive(key) ?? en[key] ?? key
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (whole: string, name: string) => {
    const value = params[name]
    if (value === undefined) return whole
    return typeof value === 'number' ? formatNumber(value) : value
  })
}

/** Locale-aware digits, so Arabic-Indic numerals appear where they should. */
export function formatNumber(n: number): string {
  try {
    return new Intl.NumberFormat(active).format(n)
  } catch {
    return String(n)
  }
}
