/**
 * Platform selection. **This is the only file in the codebase permitted to
 * read `process.platform`.**
 *
 * That rule is what makes the seam worth having. As soon as a second file
 * branches on the platform, the third one forgets to, and Linux quietly
 * inherits a Windows code path. Anything that needs to know what OS it is on
 * asks `getPlatform().capabilities` instead, which is both more specific
 * ("can this window be click-through?" rather than "is this Windows?") and
 * honest about the machine rather than the OS family — see
 * `../platform/win32/index.ts`, where two capabilities depend on whether koffi
 * actually loaded.
 *
 * If you find yourself wanting `process.platform` elsewhere, the answer is a
 * new capability flag or a new adapter method.
 */
import type { PlatformAdapter, PlatformId } from './types'
import { createWin32Adapter } from './win32'
import { createDarwinAdapter } from './darwin'
import { createLinuxAdapter } from './linux'

export type { PlatformAdapter, PlatformCapabilities, PlatformId } from './types'

/**
 * Map a `process.platform` value onto one of the three adapters.
 *
 * Linux is the fallback for everything unrecognised — freebsd, openbsd, sunos,
 * aix, android. They are all POSIX-ish, they all use XDG directories, and the
 * Linux adapter is the one with the most conservative capability set, so an
 * unknown platform gets the implementation least likely to do something
 * harmful. Exported separately from `getPlatform` so it can be tested without
 * having to forge `process.platform`.
 */
export function resolvePlatformId(platform: string): PlatformId {
  switch (platform) {
    case 'win32':
      return 'win32'
    case 'darwin':
      return 'darwin'
    default:
      return 'linux'
  }
}

/** Construct the adapter for a specific platform id. */
export function createAdapter(id: PlatformId): PlatformAdapter {
  switch (id) {
    case 'win32':
      return createWin32Adapter()
    case 'darwin':
      return createDarwinAdapter()
    case 'linux':
      return createLinuxAdapter()
  }
}

let cached: PlatformAdapter | null = null

/**
 * The adapter for the machine this process is running on.
 *
 * Memoised: construction binds koffi on Windows, and callers include a cursor
 * poll and a quota refresh loop that would otherwise pay for that repeatedly.
 * The adapter is stateless apart from those memoised probes, so one instance
 * for the process lifetime is correct.
 */
export function getPlatform(): PlatformAdapter {
  if (cached) return cached
  cached = createAdapter(resolvePlatformId(process.platform))
  return cached
}

/**
 * Test seam: drop the memoised adapter so the next `getPlatform()` re-selects.
 * Not for production use — nothing legitimately changes platform at runtime.
 */
export function resetPlatformCache(): void {
  cached = null
}
