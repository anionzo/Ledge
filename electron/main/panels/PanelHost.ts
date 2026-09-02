/**
 * PanelHost — one edge-docked window, and the only place in the app that knows
 * how a panel gets out of the way.
 *
 * Edge-Drop hardcoded a single left-docked, click-through window: the geometry
 * maths assumed `x = workArea.x`, and collapsing meant `setIgnoreMouseEvents`.
 * Neither assumption survives Ledge. There are two panels on opposite edges, and
 * `setIgnoreMouseEvents` is documented as macOS/Windows only — on Linux a
 * "collapsed" click-through window is just a full-width invisible wall over the
 * user's desktop. So the side is a parameter and the collapse behaviour is a
 * strategy, chosen per platform from `PlatformCapabilities.clickThrough`.
 *
 * Everything OS-specific goes through the injected PlatformAdapter. This file
 * never reads `process.platform`.
 */
import { BrowserWindow, screen, shell, type Rectangle } from 'electron'
import { sharedWorkAreaCache } from '../edge/workAreaCache'
import type { PlatformAdapter } from '../../platform/types'
import type { CollapseStrategy, PanelSide, TriggerAlign } from '../../../shared/types/settings'
import type { PushArgs, PushChannel } from '../../../shared/ipc'

/** Panels that dock to an edge. The Settings window is an ordinary window. */
export type EdgePanelId = 'shelf' | 'gauge'

export interface PanelSpec {
  id: EdgePanelId
  side: PanelSide
  /** Width of the panel when open, in DIP. */
  width: number
  /**
   * Width left at the edge when closed under the `resize` strategy: the sliver
   * the cursor can still hit. Also the width of the hover trigger strip.
   */
  gripPx: number
  collapseStrategy: CollapseStrategy
  /** Dev-server URL or absolute path to the built index.html. */
  htmlEntry: string
}

export interface PanelLayout {
  /** Fraction of the work-area height the panel occupies. Clamped to 0.2–1. */
  heightRatio: number
  triggerAlign: TriggerAlign
}

export interface PanelHostDeps {
  platform: PlatformAdapter
  /** Absolute path to `out/preload/index.cjs`. */
  preloadPath: string
  /**
   * Display to dock to. `null` means "wherever the primary display is now",
   * re-resolved on every topology change.
   */
  displayId?: number | null
}

export interface PanelGeometryInput {
  workArea: Rectangle
  side: PanelSide
  /** Width to occupy — the open width, or the grip width when collapsed. */
  width: number
  heightRatio: number
  triggerAlign: TriggerAlign
}

/**
 * Pure geometry, exported so tests can assert the right-hand edge without an
 * Electron instance. The rule that matters: the panel is anchored to its edge,
 * so on the right the x origin depends on the *current* width. Get that wrong
 * and a `resize` collapse slides the panel inward instead of shrinking it.
 */
export function computePanelBounds(input: PanelGeometryInput): Rectangle {
  const { workArea, side, triggerAlign } = input

  const width = Math.max(1, Math.round(input.width))
  const ratio = Math.min(1, Math.max(0.2, input.heightRatio))
  const height = Math.max(120, Math.round(workArea.height * ratio))

  const slack = Math.max(0, workArea.height - height)
  const y =
    triggerAlign === 'top'
      ? workArea.y
      : triggerAlign === 'bottom'
        ? workArea.y + slack
        : workArea.y + Math.round(slack / 2)

  const x = side === 'left' ? workArea.x : workArea.x + workArea.width - width

  return { x, y, width, height }
}

/**
 * Displays change in bursts, not events: a monitor waking, a TV renegotiating
 * EDID, or a dock being attached can fire a dozen `display-metrics-changed`
 * events while the display list is still in a transitional state. Repositioning
 * on each one can land the panel on the wrong monitor at an intermediate frame.
 * Debouncing to the end of the burst is what Edge-Drop settled on after chasing
 * exactly that bug.
 */
const DISPLAY_SETTLE_MS = 600

export class PanelHost {
  readonly id: EdgePanelId

  #spec: PanelSpec
  #layout: PanelLayout
  #deps: PanelHostDeps
  #win: BrowserWindow | null = null
  #open = false
  #destroyed = false
  /** Extra width for a side-by-side preview. See `setExtraWidth`. */
  #extraWidth = 0
  #settleTimer: ReturnType<typeof setTimeout> | null = null
  #onDisplayChange: () => void

  constructor(spec: PanelSpec, layout: PanelLayout, deps: PanelHostDeps) {
    this.id = spec.id
    this.#spec = { ...spec }
    this.#layout = { ...layout }
    this.#deps = deps
    this.#onDisplayChange = (): void => {
      if (this.#settleTimer !== null) clearTimeout(this.#settleTimer)
      this.#settleTimer = setTimeout(() => {
        this.#settleTimer = null
        this.applyGeometry()
      }, DISPLAY_SETTLE_MS)
    }
  }

  get window(): BrowserWindow | null {
    return this.#win && !this.#win.isDestroyed() ? this.#win : null
  }

  get side(): PanelSide {
    return this.#spec.side
  }

  get gripPx(): number {
    return this.#spec.gripPx
  }

  isOpen(): boolean {
    return this.#open
  }

  /** Work area of the display this panel is currently docked to. */
  workArea(): Rectangle {
    return this.#workArea()
  }

  /**
   * The strip along the edge that arms the opener: the panel's own vertical
   * extent, `gripPx` wide. Hovering the edge *above or below* the panel must
   * not open it — with two panels and a `triggerAlign` setting, "anywhere on
   * this edge" would fire far away from where the panel will actually appear.
   */
  triggerRect(): Rectangle {
    const bounds = computePanelBounds({
      workArea: this.#workArea(),
      side: this.#spec.side,
      width: this.#spec.gripPx,
      heightRatio: this.#layout.heightRatio,
      triggerAlign: this.#layout.triggerAlign
    })
    return bounds
  }

  create(): BrowserWindow {
    const existing = this.window
    if (existing) return existing

    // Born collapsed. Under `resize` that means grip width from the first
    // frame, so a full-width window never covers the desktop even briefly.
    const bounds = this.#boundsFor(false)

    const win = new BrowserWindow({
      ...bounds,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      roundedCorners: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      // NOT `focusable: false`. The Shelf has a search field and Settings has
      // real inputs; focus stealing is suppressed properly through the
      // adapter's applyNoActivate instead of by crippling the window.
      webPreferences: {
        preload: this.#deps.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        backgroundThrottling: true
      }
    })

    this.#win = win

    // Order matters: out of the switcher and off the focus path *before* the
    // window is ever shown, or Windows flashes a taskbar button for it.
    const { platform } = this.#deps
    platform.applyHiddenFromSwitcher(win)
    platform.applyNoActivate(win, true)
    platform.applyAlwaysOnTop(win, true)

    if (this.#spec.collapseStrategy === 'clickthrough') {
      // `forward: false` — Ledge does not need mouse-move events forwarded to
      // the renderer, because edge detection reads the OS cursor directly in
      // the main process (edge/cursorPoll.ts). Forwarding would resurrect the
      // 60 Hz IPC flood that polling exists to replace.
      win.setIgnoreMouseEvents(true, { forward: false })
    }

    // A panel is chrome, not a browser: nothing may navigate it away from its
    // own entry, and a link click opens in the user's real browser.
    win.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: 'deny' }
    })
    win.webContents.on('will-navigate', (event) => {
      event.preventDefault()
    })

    win.once('ready-to-show', () => {
      // showInactive, never show: the panel appearing must not pull focus out
      // of whatever the user is typing in.
      if (!win.isDestroyed()) win.showInactive()
    })

    win.on('closed', () => {
      this.#win = null
    })

    void this.#load(win)

    screen.on('display-metrics-changed', this.#onDisplayChange)
    screen.on('display-added', this.#onDisplayChange)
    screen.on('display-removed', this.#onDisplayChange)

    return win
  }

  open(): void {
    this.#setOpen(true)
  }

  close(): void {
    this.#setOpen(false)
  }

  toggle(): void {
    this.#setOpen(!this.#open)
  }

  /**
   * Re-dock to a different monitor without tearing the window down. Used when
   * the user changes the Settings display picker, and when the 4-tier resolve
   * in `panels/displays.ts` lands on a new id after a topology change.
   * `#workArea()` already reads `#deps.displayId` fresh on every call, so
   * updating it here first is what makes `applyGeometry` place the window on
   * the new monitor instead of the old one.
   */
  setDisplayId(id: number | null): void {
    const current = this.#deps.displayId ?? null
    if (current === id) return
    this.#deps.displayId = id
    this.applyGeometry()
  }

  /**
   * Backing call for `panel:set-interactive`. Under `clickthrough` this is
   * exactly open/close; under `resize` it is too, because a grip-width window
   * is already unable to block anything.
   */
  setInteractive(interactive: boolean): void {
    this.#setOpen(interactive)
  }

  /** Apply changed settings (side, width, grip, strategy, layout) in place. */
  update(spec: Partial<Omit<PanelSpec, 'id' | 'htmlEntry'>>, layout?: Partial<PanelLayout>): void {
    const wasClickthrough = this.#spec.collapseStrategy === 'clickthrough'
    this.#spec = { ...this.#spec, ...spec }
    if (layout) this.#layout = { ...this.#layout, ...layout }

    const win = this.window
    const isClickthrough = this.#spec.collapseStrategy === 'clickthrough'

    if (win && wasClickthrough && !isClickthrough) {
      // Leaving click-through: hand mouse input back, or the window stays inert
      // forever while the resize strategy believes it is open.
      win.setIgnoreMouseEvents(false)
    }

    this.applyGeometry()

    if (win && isClickthrough) {
      win.setIgnoreMouseEvents(!this.#open, { forward: false })
    }
  }

  /** Recompute bounds for the current display, side and open state. */
  applyGeometry(): void {
    const win = this.window
    if (!win) return
    win.setBounds(this.#boundsFor(this.#open))
  }

  /**
   * Drop out of the top always-on-top band for the duration of a native OLE
   * drag (task smooth-05's main-process half).
   *
   * `create()` pins the window at the platform's topmost always-on-top band
   * (Windows' `'screen-saver'` level, via `platform.applyAlwaysOnTop`) — above
   * Explorer, Word, the browser, everything. That is exactly wrong mid-drag:
   * the OS resolves a drop target by hit-testing whatever window is topmost
   * under the cursor, so dragging a card over Explorer would actually drop it
   * onto Ledge's own always-on-top window and the file would never reach
   * Explorer at all. Demoting to the ordinary `'normal'` always-on-top band
   * keeps the panel above regular windows — it does not vanish mid-drag — while
   * letting a real drop target receive the drop like any other topmost app.
   */
  demoteZ(): void {
    const win = this.window
    if (!win) return
    win.setAlwaysOnTop(true, 'normal')
  }

  /** Restores the z-band `create()` set, once the native drag ends. */
  restoreZ(): void {
    const win = this.window
    if (!win) return
    this.#deps.platform.applyAlwaysOnTop(win, true)
  }

  /** Type-checked push to this panel's renderer. */
  push<C extends PushChannel>(channel: C, ...args: PushArgs<C>): void {
    const win = this.window
    if (!win || win.webContents.isDestroyed()) return
    win.webContents.send(channel, ...args)
  }

  destroy(): void {
    if (this.#destroyed) return
    this.#destroyed = true

    if (this.#settleTimer !== null) {
      clearTimeout(this.#settleTimer)
      this.#settleTimer = null
    }
    screen.removeListener('display-metrics-changed', this.#onDisplayChange)
    screen.removeListener('display-added', this.#onDisplayChange)
    screen.removeListener('display-removed', this.#onDisplayChange)

    const win = this.#win
    this.#win = null
    if (win && !win.isDestroyed()) win.destroy()
  }

  // ── internals ────────────────────────────────────────────────────────────

  #setOpen(open: boolean): void {
    if (this.#open === open) return
    this.#open = open
    // A preview does not survive the panel closing. Without this the next
    // open would start already widened, with nothing in the extra space.
    if (!open) this.#extraWidth = 0

    const win = this.window
    if (!win) return

    if (this.#spec.collapseStrategy === 'clickthrough') {
      // The window keeps its full open bounds in both states; only its
      // permeability to the mouse changes. The renderer animates the panel out
      // of view, so a "closed" panel is a full-size transparent window that
      // clicks pass straight through.
      win.setIgnoreMouseEvents(!open, { forward: false })
    } else {
      // Linux path. There is no way to make a window ignore the mouse, so the
      // window has to physically stop covering the desktop.
      win.setBounds(this.#boundsFor(open))
    }

    // Both strategies still tell the renderer, which owns the animation.
    this.push('panel:toggle', open)
  }

  /**
   * Grow the window inward by `px`, for a preview that has to sit BESIDE the
   * blade rather than on top of it.
   *
   * The panel is anchored to its docked edge, so widening extends it into the
   * screen and leaves the blade exactly where it was — which is the whole
   * trick. The alternative was a second BrowserWindow floating next to this
   * one, and that means duplicating focus, z-order, display-follow and
   * lifecycle for a surface that is only ever a companion to this one.
   *
   * Ignored while collapsed: a closed panel that silently grew would be an
   * invisible 400px window sitting over the desktop.
   */
  setExtraWidth(px: number): void {
    const next = Math.max(0, Math.round(px))
    if (this.#extraWidth === next) return
    this.#extraWidth = next
    if (this.#open) this.applyGeometry()
  }

  get extraWidth(): number {
    return this.#extraWidth
  }

  #boundsFor(open: boolean): Rectangle {
    // Under `clickthrough` the window is always at full width — collapsing is
    // purely an input-routing change, and resizing it would clip the
    // renderer's slide-out animation against the window edge.
    const width =
      open || this.#spec.collapseStrategy === 'clickthrough'
        ? this.#spec.width + (open ? this.#extraWidth : 0)
        : this.#spec.gripPx

    return computePanelBounds({
      workArea: this.#workArea(),
      side: this.#spec.side,
      width,
      heightRatio: this.#layout.heightRatio,
      triggerAlign: this.#layout.triggerAlign
    })
  }

  /**
   * Work area of the display this panel is docked to.
   *
   * Read through the shared `WorkAreaCache` rather than straight off `screen`:
   * the cursor poll calls `workArea()` and `triggerRect()` for every target on
   * every 16 ms tick, and each raw call was a full `getAllDisplays()` scan
   * across the process boundary for a rectangle that only changes when a
   * monitor is plugged, unplugged or re-scaled — which is exactly when the
   * cache invalidates itself.
   */
  #workArea(): Rectangle {
    const cache = sharedWorkAreaCache()
    const wanted = this.#deps.displayId
    if (wanted !== null && wanted !== undefined) {
      const area = cache.get(wanted)
      // Fall through to primary rather than throwing: a display can be
      // unplugged at any moment, and a panel that cannot find its monitor must
      // still be reachable.
      if (area) return area
    }
    return cache.primary()
  }

  async #load(win: BrowserWindow): Promise<void> {
    const entry = this.#spec.htmlEntry
    try {
      if (/^https?:\/\//.test(entry)) {
        await win.loadURL(entry)
      } else {
        await win.loadFile(entry)
      }
    } catch (err) {
      // A failed load leaves one dead panel rather than taking the app down;
      // the tray stays alive so the user can still quit or open Settings.
      console.error(`[panel:${this.id}] failed to load ${entry}`, err)
    }
  }
}
