/**
 * Centralized filesystem locations for the clipboard engine's persisted state.
 *
 * Everything lives under the OS userData directory so the app is fully portable
 * and self-cleaning. Image bytes and large-text payloads are kept in their own
 * folders so the JSON history index stays small and fast to read/write.
 *
 * Unlike Edge-Drop, Ledge ships only as NSIS / dmg / AppImage — there is no
 * MSIX/Store package whose APPDATA is virtualized — so the "unpackaged temp"
 * copy dance is gone: our temp dir is always a plain directory under userData
 * that any other process can open.
 */
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join, sep } from 'node:path'
import { app } from 'electron'

const root = (): string => app.getPath('userData')

export const PATHS = {
  /** userData root. */
  root,
  /** Directory holding text payloads for large text entries. */
  payloadsDir: (): string => join(root(), 'payloads'),
  /** Directory holding one PNG per captured image item. */
  imagesDir: (): string => join(root(), 'images'),
  /** Path to the history index JSON. */
  indexFile: (): string => join(root(), 'history.json'),
  /**
   * Registry correlating staged temp artifacts with the history entries that
   * own them. Lives OUTSIDE the temp dir so cleanup sweeps never mistake it
   * for debris.
   */
  stagedTempRegistryFile: (): string => join(root(), 'temp-staged.json'),
  /** Scratch dir for temp files handed to native drag-out / paste. */
  tempDir: (): string => join(root(), 'temp')
} as const

/** True when `p` is one of our own staged drag/clipboard temp files. */
export function isStagedTempPath(p: string): boolean {
  if (!p) return false
  const rootDir = PATHS.tempDir()
  if (p === rootDir) return true
  const prefix = rootDir.endsWith('\\') || rootDir.endsWith('/') ? rootDir : rootDir + sep
  return p.startsWith(prefix)
}

/** Idempotently create every directory the engine needs. Safe to call repeatedly. */
export function ensureDirs(): void {
  for (const dir of [PATHS.imagesDir(), PATHS.payloadsDir(), PATHS.tempDir()]) {
    mkdirSync(dir, { recursive: true })
  }
}

function emptyDir(dir: string): void {
  try {
    for (const entry of readdirSync(dir)) {
      try {
        rmSync(join(dir, entry), { force: true, recursive: true })
      } catch {
        /* ignore individual file errors */
      }
    }
  } catch {
    /* dir may not exist yet */
  }
}

/** Remove every temp drag file. Kept for callers that want a hard wipe. */
export function cleanTemp(): void {
  emptyDir(PATHS.tempDir())
}
