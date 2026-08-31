/**
 * Staged-temp artifact lifecycle manager.
 *
 * Drag-out and image paste stage copies of clipboard content into the temp dir
 * (pretty-named screenshots, snippet .txt files). This module ties every staged
 * file's lifetime to its owner's lifetime instead of wiping the temp dir on
 * every launch, which used to break external references (a Word doc holding a
 * file reference paste just wrote) and leak files for items deleted mid-session.
 *
 *   - `recordStagedFiles()`      — staging registers what it created.
 *   - `forgetStagedItems()`      — ItemStore's removal hook reaps a dead item's
 *                                  artifacts immediately.
 *   - `reconcileTempOnStartup()` — one launch-time sweep removes crash orphans
 *                                  and anything no living item owns.
 *
 * Everything here is event-driven: a debounced tiny JSON write after staging,
 * plus one directory scan at startup. No timers, watchers, or polling.
 */
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ItemData } from '../../../shared/types/clipboard'
import { PATHS, isStagedTempPath } from './paths'
import { contentSignature } from './signature'

interface RegistryEntry {
  /** Content signature of the owning history item. */
  sig: string
  /** Absolute paths of generated artifacts we may delete. */
  files: string[]
}

const REGISTRY_VERSION = 1
/** Hard cap so a pathological session cannot grow the file unboundedly. */
const MAX_REGISTRY_ENTRIES = 512

let entries: RegistryEntry[] = []
let loaded = false
let persistTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Lazy, failure-tolerant load. A missing/corrupt registry yields an empty list;
 * reconcileTempOnStartup then treats every temp artifact as unowned and clears
 * it once, after which the registry rebuilds from fresh staging. Self-healing.
 */
function ensureLoaded(): void {
  if (loaded) return
  loaded = true
  try {
    const raw = readFileSync(PATHS.stagedTempRegistryFile(), 'utf8')
    const parsed = JSON.parse(raw) as { v?: number; entries?: unknown }
    if (parsed && Array.isArray(parsed.entries)) {
      entries = parsed.entries.filter(
        (e): e is RegistryEntry =>
          !!e &&
          typeof (e as RegistryEntry).sig === 'string' &&
          Array.isArray((e as RegistryEntry).files) &&
          (e as RegistryEntry).files.every((f) => typeof f === 'string')
      )
    }
  } catch {
    entries = []
  }
}

function persistSync(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  try {
    writeFileSync(
      PATHS.stagedTempRegistryFile(),
      JSON.stringify({ v: REGISTRY_VERSION, entries }, null, 2),
      'utf8'
    )
  } catch {
    /* non-fatal: worst case the next startup sweep reaps orphans */
  }
}

function schedulePersist(): void {
  if (persistTimer !== null) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    persistSync()
  }, 150)
  // Never keep the process alive just for a registry flush.
  ;(persistTimer as unknown as { unref?: () => void }).unref?.()
}

/**
 * Register the artifacts produced by a successful stage. Only paths inside our
 * managed temp root are recorded — original user files exposed by `file`
 * payloads are NEVER tracked (deleting those would destroy real user data).
 */
export function recordStagedFiles(data: ItemData, stagedFiles: string[]): void {
  try {
    const ours = stagedFiles.filter((p) => p && isStagedTempPath(p))
    if (ours.length === 0) return
    ensureLoaded()
    const sig = contentSignature(data)
    const existing = entries.find((e) => e.sig === sig)
    if (existing) {
      const merged = new Set(existing.files)
      for (const f of ours) merged.add(f)
      existing.files = [...merged]
    } else {
      entries.push({ sig, files: ours })
      if (entries.length > MAX_REGISTRY_ENTRIES) entries.shift()
    }
    schedulePersist()
  } catch {
    /* ignore — staging itself already succeeded */
  }
}

/**
 * Delete every registered artifact owned by the given (just-removed) history
 * items. Called from the ItemStore removal hook.
 */
export function forgetStagedItems(removed: readonly { data: ItemData }[]): void {
  if (!removed || removed.length === 0) return
  try {
    ensureLoaded()
    let changed = false
    for (const item of removed) {
      const sig = contentSignature(item.data)
      const idx = entries.findIndex((e) => e.sig === sig)
      if (idx === -1) continue
      const [dead] = entries.splice(idx, 1)
      changed = true
      for (const f of dead.files) {
        try {
          if (existsSync(f)) rmSync(f, { force: true })
        } catch {
          /* individual file errors must not block siblings */
        }
      }
    }
    if (changed) schedulePersist()
  } catch {
    /* ignore */
  }
}

/**
 * Startup reconciliation. Keeps every artifact whose owning signature is still
 * alive in history; deletes all other managed-temp contents (crash orphans,
 * leftovers of deleted items, legacy junk). Runs once per launch.
 */
export function reconcileTempOnStartup(liveItems: readonly { data: ItemData }[]): void {
  ensureLoaded()
  const liveSigs = new Set(liveItems.map((it) => contentSignature(it.data)))

  const protectedFiles = new Set<string>()
  const surviving: RegistryEntry[] = []
  for (const entry of entries) {
    if (liveSigs.has(entry.sig)) {
      surviving.push(entry)
      for (const f of entry.files) protectedFiles.add(f)
    }
  }
  entries = surviving

  const rootDir = PATHS.tempDir()
  let names: string[] = []
  try {
    names = readdirSync(rootDir)
  } catch {
    persistSync()
    return /* dir missing is fine */
  }
  for (const name of names) {
    const full = join(rootDir, name)
    if (protectedFiles.has(full)) continue
    try {
      rmSync(full, { recursive: true, force: true })
    } catch {
      /* ignore individual failures */
    }
  }
  persistSync()
}

/** Flush pending debounce writes synchronously (app shutdown). */
export function flushStagedTempRegistry(): void {
  ensureLoaded()
  persistSync()
}
