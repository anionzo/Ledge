/**
 * The tray's update row.
 *
 * A tray menu cannot be screenshotted, and this is a five-state machine whose
 * whole job is to offer exactly one correct action at a time — offering
 * "Check for updates" while an update is already downloaded, or a live
 * "Restart" row on a build that never checks, is the kind of thing only a test
 * catches. The rows themselves are plain data, so no window is needed.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  Menu: { buildFromTemplate: () => ({}) },
  Tray: class {},
  app: { getAppPath: () => '' },
  nativeImage: {
    createFromPath: () => ({ isEmpty: () => true, resize: () => ({}) }),
    createFromDataURL: () => ({ isEmpty: () => false, resize: () => ({}) })
  }
}))

import { updateItems, type TrayUpdateHooks } from '../electron/main/tray'
import type { UpdaterStatus } from '../shared/ipc'

const BASE: UpdaterStatus = {
  storeBuild: false,
  supported: true,
  checking: false,
  downloading: false,
  availableVersion: null,
  downloadedVersion: null,
  error: null
}

function hooks(over: Partial<UpdaterStatus>): TrayUpdateHooks {
  return {
    status: () => ({ ...BASE, ...over }),
    check: () => {},
    download: () => {},
    restartToInstall: () => {}
  }
}

/** The rows minus the leading separator, which every non-empty case carries. */
function labels(items: ReturnType<typeof updateItems>): string[] {
  return items.filter((i) => i.type !== 'separator').map((i) => String(i.label))
}

describe('tray update row', () => {
  it('offers a check when there is nothing else to do', () => {
    const items = updateItems(hooks({}))
    expect(labels(items)).toEqual(['Check for updates'])
    expect(items[0].type).toBe('separator')
  })

  it('names the version to restart into once one is downloaded', () => {
    expect(labels(updateItems(hooks({ downloadedVersion: '0.1.5' })))).toEqual([
      'Restart to update (0.1.5)'
    ])
  })

  it('prefers the downloaded version over a merely available one', () => {
    // Both fields are set between `update-downloaded` and the next check, and
    // offering "Download" there would re-fetch what is already on disk.
    const items = updateItems(hooks({ availableVersion: '0.1.5', downloadedVersion: '0.1.5' }))
    expect(labels(items)).toEqual(['Restart to update (0.1.5)'])
  })

  it('offers a download only while one is available and not yet fetched', () => {
    expect(labels(updateItems(hooks({ availableVersion: '0.1.5' })))).toEqual([
      'Download update (0.1.5)'
    ])
  })

  it('reports progress states without offering an action', () => {
    for (const state of [{ checking: true }, { downloading: true }]) {
      const items = updateItems(hooks(state))
      expect(items.filter((i) => i.type !== 'separator').every((i) => i.enabled === false)).toBe(true)
    }
  })

  it('shows nothing at all where the updater is inert', () => {
    // A dev run or a Store build: a menu item wired to something that will
    // never fire is worse than no menu item.
    expect(updateItems(hooks({ supported: false }))).toEqual([])
    expect(updateItems(hooks({ supported: false, storeBuild: true }))).toEqual([])
    expect(updateItems(undefined)).toEqual([])
  })
})
