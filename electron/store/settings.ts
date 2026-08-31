/**
 * Settings persistence.
 *
 * One JSON file under `app.getPath('userData')`, read once and cached. Writes
 * are atomic (temp file + fsync + rename) because the alternative — truncating
 * the real file and writing into it — loses every setting the user has if the
 * machine drops power mid-write, and this file is the only copy of their
 * layout, hotkeys and provider list.
 *
 * Patches from `settings:update` arrive from a renderer, so the merge is
 * deliberately closed: only keys that already exist in DEFAULT_SETTINGS survive
 * it. That keeps the persisted object exactly the shape `Settings` claims, and
 * makes it impossible to smuggle `__proto__` or arbitrary payloads into the
 * store through IPC.
 */
import { app } from 'electron'
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  AUTO_DELETE_HOURS,
  DEFAULT_SETTINGS,
  SETTINGS_VERSION,
  type Settings
} from '../../shared/types/settings'
import type {
  AutoDeleteHours,
  CustomProviderConfig,
  CustomProviderMode,
  CustomProviderShape,
  ScreenRect,
  StickDisplayPrefs
} from '../../shared/types/settings'
import type { DeepPartial } from '../../shared/ipc'

type Listener = (settings: Settings) => void

let cache: Settings | null = null
const listeners = new Set<Listener>()

export function settingsFilePath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Merge `patch` onto `base`, keeping only keys `base` already has.
 *
 * Arrays are replaced wholesale rather than element-merged: `customProviders`
 * is an ordered list the user edits as a list, and index-wise merging would
 * make a deletion look like an edit of every entry after it.
 */
function mergeKnown<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return base

  const out: Record<string, unknown> = { ...base }
  for (const key of Object.keys(base)) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue
    const next = patch[key]
    if (next === undefined) continue

    const current = out[key]
    if (isPlainObject(current) && isPlainObject(next)) {
      // `enabledProviders` is a free-form Record, so its own keys are not
      // constrained by the default — merge it as data, not as schema.
      out[key] = isOpenRecord(key) ? { ...current, ...next } : mergeKnown(current, next)
    } else if (Array.isArray(current) && Array.isArray(next)) {
      out[key] = next
    } else if (typeof current === typeof next) {
      out[key] = next
    } else if (current === null || next === null) {
      // A nullable field (`stickDisplay.displayId` and friends) fails the
      // typeof test in exactly the case it must not: `typeof null` is
      // 'object', so "null becomes 3" would be dropped and the value could
      // never be set. Nullable keys are let through here and re-checked in
      // `normalize`, which is where every one of them is sanitized.
      out[key] = next
    }
    // A type mismatch (string where a number belongs) is dropped silently: the
    // previous value is always a valid one, and rejecting the whole patch would
    // lose the good keys alongside the bad.
  }
  // Cast at the boundary. `out` was built from `base`'s own keys with values
  // that passed a typeof check, so it is a `T` by construction — TypeScript
  // just cannot follow a string-keyed loop back to a generic parameter.
  return out as unknown as T
}

/** Keys whose object values are user data rather than a fixed schema. */
function isOpenRecord(key: string): boolean {
  return key === 'enabledProviders'
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/** Upper bound on any free-text custom-provider field, so a hand-edited or
 *  hostile settings.json cannot smuggle a megabyte string into memory. */
const MAX_CUSTOM_STR = 2_000

function asString(value: unknown, fallback: string, max = MAX_CUSTOM_STR): string {
  if (typeof value !== 'string') return fallback
  return value.length > max ? value.slice(0, max) : value
}

/** A percentage the user typed, or null. Kept in 0–100; anything else is null. */
function asPercentOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return clamp(Math.round(value), 0, 100)
}

/**
 * Bring one custom-provider entry up to the full `CustomProviderConfig` shape.
 *
 * The entry may be partial or predate the mode/shape/http fields — it arrives
 * from a hand-edited file or an older release — so every field is read
 * defensively and the NEW fields are defaulted so an old config keeps working:
 *
 *   - `mode` defaults to `command` when a command is present, else `manual`,
 *     which reproduces the pre-mode inference exactly;
 *   - `shape` defaults to `percent` (the historical behaviour);
 *   - `url`/`token`/`jsonPath` default to '' , `manualBalance` to null,
 *     `currency` to 'USD'.
 *
 * The id is held to the documented `custom_<slug>` pattern; a value that does
 * not match is slugified from the name so a card never renders with an id the
 * rest of the app cannot key on. String fields are length-bounded.
 */
function sanitizeCustomProvider(raw: unknown): CustomProviderConfig {
  const entry = isPlainObject(raw) ? raw : {}

  const command = asString(entry.command, '')
  const mode = normalizeMode(entry.mode, command)
  const shape: CustomProviderShape = entry.shape === 'balance' ? 'balance' : 'percent'
  const currency = entry.currency === 'CNY' ? 'CNY' : 'USD'

  return {
    id: normalizeCustomId(entry.id, entry.name),
    name: asString(entry.name, '', 120),
    mode,
    shape,
    command,
    url: asString(entry.url, ''),
    // Kept plaintext in the in-memory Settings for the readers; sealed via
    // safeStorage on the way to disk (see protectToken / mapTokens below).
    token: asString(entry.token, ''),
    jsonPath: asString(entry.jsonPath, '', 200),
    manualSessionPercent: asPercentOrNull(entry.manualSessionPercent),
    manualWeeklyPercent: asPercentOrNull(entry.manualWeeklyPercent),
    // Money stays a string; a stray number is stringified, never parsed.
    manualBalance:
      typeof entry.manualBalance === 'string'
        ? asString(entry.manualBalance, '', 64)
        : typeof entry.manualBalance === 'number' && Number.isFinite(entry.manualBalance)
          ? String(entry.manualBalance)
          : null,
    currency
  }
}

function normalizeMode(value: unknown, command: string): CustomProviderMode {
  if (value === 'http' || value === 'command' || value === 'manual') return value
  // Predates the field: infer from whether a command was configured.
  return command.trim() ? 'command' : 'manual'
}

/** Enforce the `custom_<slug>` id pattern, deriving a slug from the name when
 *  the stored id is missing or malformed. */
function normalizeCustomId(rawId: unknown, rawName: unknown): string {
  const id = typeof rawId === 'string' ? rawId.trim() : ''
  if (/^custom_[a-z0-9][a-z0-9_-]*$/.test(id)) return id.slice(0, 80)
  const slug = (typeof rawName === 'string' ? rawName : '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `custom_${slug || 'provider'}`
}

/**
 * A finite number, or null. The gate for every nullable numeric field that
 * `mergeKnown` now lets through untyped.
 */
function asFiniteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** A screen rectangle, or null when any component is missing or not finite. */
function asRectOrNull(value: unknown): ScreenRect | null {
  if (!isPlainObject(value)) return null
  const x = asFiniteOrNull(value.x)
  const y = asFiniteOrNull(value.y)
  const width = asFiniteOrNull(value.width)
  const height = asFiniteOrNull(value.height)
  if (x === null || y === null || width === null || height === null) return null
  if (width <= 0 || height <= 0) return null
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }
}

/**
 * Hold `stickDisplay` to its shape. It is the one branch `mergeKnown` cannot
 * type-check on its own (three nullable fields), so a hand-edited file or a
 * malformed patch is normalized back to "no preference" rather than trusted.
 */
function sanitizeStickDisplay(raw: unknown): StickDisplayPrefs {
  const value = isPlainObject(raw) ? raw : {}
  const displayId = asFiniteOrNull(value.displayId)
  const scale = asFiniteOrNull(value.savedScaleFactor)
  return {
    displayId: displayId === null ? null : Math.round(displayId),
    savedWorkArea: asRectOrNull(value.savedWorkArea),
    // Scale factors run 1–4 in practice; anything outside that is junk, not a
    // monitor, and a junk value would poison the twin-display tie-break.
    savedScaleFactor: scale === null ? null : clamp(scale, 0.5, 8)
  }
}

/** Snap to the nearest offered auto-delete age; anything unknown means never. */
function normalizeAutoDeleteHours(value: unknown): AutoDeleteHours {
  return AUTO_DELETE_HOURS.includes(value as AutoDeleteHours) ? (value as AutoDeleteHours) : 0
}

/**
 * Bring a merged object back inside its documented ranges.
 *
 * A hand-edited settings.json with `heightRatio: 40` would produce a panel
 * taller than the screen and no visible way to fix it, so the guard lives here
 * rather than in the UI.
 */
function normalize(settings: Settings): Settings {
  return {
    ...settings,
    version: SETTINGS_VERSION,
    // A hand-edited 0 would make both panels invisible with no way back, so the
    // floor keeps the glass legible; 1 is fully opaque.
    panelOpacity: clamp(settings.panelOpacity, 0.5, 1),
    stickDisplay: sanitizeStickDisplay(settings.stickDisplay),
    shelf: {
      ...settings.shelf,
      edgeProximityPx: Math.round(clamp(settings.shelf.edgeProximityPx, 1, 64)),
      heightRatio: clamp(settings.shelf.heightRatio, 0.2, 1),
      maxItems: Math.round(clamp(settings.shelf.maxItems, 10, 5000)),
      autoDeleteHours: normalizeAutoDeleteHours(settings.shelf.autoDeleteHours)
    },
    gauge: {
      ...settings.gauge,
      alertThreshold: Math.round(clamp(settings.gauge.alertThreshold, 1, 100)),
      // Below ~5 s the providers spend more time shelling out than idle.
      refreshIntervalMs: Math.round(clamp(settings.gauge.refreshIntervalMs, 5_000, 3_600_000)),
      // Upgrade every custom entry to the full shape, defaulting the newer
      // mode/shape/http fields so an old or partial config keeps working.
      customProviders: (Array.isArray(settings.gauge.customProviders)
        ? settings.gauge.customProviders
        : []
      ).map(sanitizeCustomProvider)
    }
  }
}

/**
 * Migrate a stored object to the current version.
 *
 * Still a seam rather than a pipeline: every version bump so far has only
 * *added* keys, and `mergeKnown` against `DEFAULT_SETTINGS` already fills those
 * in, so a v1 file becomes a valid v2 file by being read. A real transform —
 * a renamed or re-scaled key — is what would turn this into a pipeline.
 *
 * A file from a *newer* version is copied aside before being coerced, so
 * downgrading and re-upgrading does not silently destroy settings this build
 * cannot model.
 */
function migrate(raw: Record<string, unknown>, path: string): Record<string, unknown> {
  const version = typeof raw['version'] === 'number' ? raw['version'] : 0

  if (version > SETTINGS_VERSION) {
    try {
      const backup = `${path}.v${version}.bak`
      if (!existsSync(backup)) renameSync(path, backup)
      console.warn(`[settings] file is version ${version}, this build reads ${SETTINGS_VERSION}; kept a copy at ${backup}`)
    } catch (err) {
      console.error('[settings] could not back up a newer settings file', err)
    }
  }

  return raw
}

/**
 * Custom-provider HTTP tokens are secrets, so they are encrypted at rest via
 * safeStorage (DPAPI / Keychain / libsecret) and only ever kept in plaintext in
 * memory, where the quota readers need them. On disk a token is
 * `SS1:<base64>`; a bare string is legacy/plaintext and passes through, and if
 * the OS has no secret store the token stays plaintext (documented degradation,
 * same policy as the clipboard history).
 */
const TOKEN_PREFIX = 'SS1:'

function protectToken(value: string, mode: 'encrypt' | 'decrypt'): string {
  if (!value) return value
  let safeStorage: typeof import('electron').safeStorage
  try {
    ;({ safeStorage } = require('electron') as typeof import('electron'))
  } catch {
    return value
  }
  try {
    if (mode === 'encrypt') {
      if (value.startsWith(TOKEN_PREFIX)) return value // already sealed
      if (!safeStorage.isEncryptionAvailable()) return value
      return TOKEN_PREFIX + safeStorage.encryptString(value).toString('base64')
    }
    if (!value.startsWith(TOKEN_PREFIX)) return value // legacy plaintext
    const buf = Buffer.from(value.slice(TOKEN_PREFIX.length), 'base64')
    return safeStorage.decryptString(buf)
  } catch {
    // A token that cannot be sealed/unsealed (store changed, corrupt blob) is
    // dropped rather than crashing settings — the user re-enters it.
    return mode === 'decrypt' ? '' : value
  }
}

/** Return a shallow-cloned Settings with every custom-provider token mapped. */
function mapTokens(settings: Settings, mode: 'encrypt' | 'decrypt'): Settings {
  return {
    ...settings,
    gauge: {
      ...settings.gauge,
      customProviders: settings.gauge.customProviders.map((p) => ({
        ...p,
        token: protectToken(p.token, mode)
      }))
    }
  }
}

export function loadSettings(): Settings {
  if (cache) return cache

  const path = settingsFilePath()
  let parsed: Record<string, unknown> = {}

  try {
    if (existsSync(path)) {
      const text = readFileSync(path, 'utf8')
      const value: unknown = JSON.parse(text)
      if (isPlainObject(value)) parsed = migrate(value, path)
    }
  } catch (err) {
    // A corrupt file must not stop the app from starting: fall back to defaults
    // and let the next save rewrite it.
    console.error('[settings] unreadable, falling back to defaults', err)
  }

  // Decrypt tokens into the in-memory copy the readers use.
  cache = mapTokens(normalize(mergeKnown(DEFAULT_SETTINGS, parsed)), 'decrypt')
  return cache
}

/**
 * Apply a partial update and persist it. Returns the settings as they were
 * actually written — clamped and normalized — which is what
 * `settings:update` promises the renderer.
 */
export function saveSettings(patch: DeepPartial<Settings>): Settings {
  const next = normalize(mergeKnown(loadSettings(), patch))
  cache = next
  // In-memory `next` stays plaintext for the readers; only the on-disk copy is
  // sealed, so a token never touches the settings file in the clear.
  const onDisk = mapTokens(next, 'encrypt')
  writeAtomic(settingsFilePath(), `${JSON.stringify(onDisk, null, 2)}\n`)

  for (const listener of listeners) {
    try {
      listener(next)
    } catch (err) {
      console.error('[settings] listener threw', err)
    }
  }
  return next
}

/** Subscribe to persisted changes. Returns an unsubscribe function. */
export function onSettingsChanged(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Test seam: drop the in-memory copy so the next read hits disk. */
export function resetSettingsCache(): void {
  cache = null
}

function writeAtomic(path: string, contents: string): void {
  const dir = dirname(path)
  // `.pid` in the temp name so two Ledge processes racing (a stale instance
  // that has not exited yet) cannot write into each other's temp file.
  const tmp = `${path}.${process.pid}.tmp`

  try {
    mkdirSync(dir, { recursive: true })

    const fd = openSync(tmp, 'w')
    try {
      writeSync(fd, contents)
      // Rename is only atomic with respect to a crash if the data is already on
      // disk; without the fsync the rename can land while the file is empty.
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }

    renameSync(tmp, path)
  } catch (err) {
    console.error('[settings] failed to write', err)
    try {
      if (existsSync(tmp)) unlinkSync(tmp)
    } catch {
      // Nothing useful to do; the temp file is inert.
    }
  }
}
