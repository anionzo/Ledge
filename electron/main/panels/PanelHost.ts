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
import { BrowserWindow, screen, shell, type Display, type Rectangle } from 'electron'
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
    return this.#display().workArea
  }

  /**
   * The strip along the edge that arms the opener: the panel's own vertical
   * extent, `gripPx` wide. Hovering the edge *above or below* the panel must
   * not open it — with two panels and a `triggerAlign` setting, "anywhere on
   * this edge" would fire far away from where the panel will actually appear.
   */
  triggerRect(): Rectangle {
    const bounds = computePanelBounds({
      workArea: this.#display().workArea,
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

  #boundsFor(open: boolean): Rectangle {
    // Under `clickthrough` the window is always at full width — collapsing is
    // purely an input-routing change, and resizing it would clip the
    // renderer's slide-out animation against the window edge.
    const width =
      open || this.#spec.collapseStrategy === 'clickthrough'
        ? this.#spec.width
        : this.#spec.gripPx

    return computePanelBounds({
      workArea: this.#display().workArea,
      side: this.#spec.side,
      width,
      heightRatio: this.#layout.heightRatio,
      triggerAlign: this.#layout.triggerAlign
    })
  }

  #display(): Display {
    const wanted = this.#deps.displayId
    if (wanted !== null && wanted !== undefined) {
      const match = screen.getAllDisplays().find((d) => d.id === wanted)
      // Fall through to primary rather than throwing: a display can be
      // unplugged at any moment, and a panel that cannot find its monitor must
      // still be reachable.
      if (match) return match
    }
    return screen.getPrimaryDisplay()
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
