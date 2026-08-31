/**
 * Global hotkeys.
 *
 * Accelerators come from Settings, so they are user data: they can be
 * malformed, and they can collide with a shortcut another app registered
 * first. Neither case may take the app down — a hotkey that will not bind is
 * reported back so the Settings window can say so next to the field, and the
 * app carries on with the tray and the edge triggers, which is how most people
 * open a panel anyway.
 *
 * Registration is tracked accelerator by accelerator rather than cleared with
 * `globalShortcut.unregisterAll()`, so re-reading Settings never disturbs a
 * shortcut some other part of Ledge owns.
 */
import { globalShortcut } from 'electron'
import type { Settings } from '../../shared/types/settings'

export interface HotkeyActions {
  toggleShelf: () => void
  toggleGauge: () => void
}

export interface HotkeyBindingFailure {
  accelerator: string
  /** Which setting produced it, so the UI can point at the right field. */
  setting: 'hotkeyToggleShelf' | 'hotkeyToggleGauge'
  reason: string
}

const registered = new Set<string>()

function bind(accelerator: string, action: () => void): string | null {
  const trimmed = accelerator.trim()
  if (trimmed === '') return 'empty'

  if (registered.has(trimmed)) {
    // Both panels pointed at the same accelerator. First one wins; the second
    // is reported rather than silently overwriting it.
    return 'already bound to another Ledge action'
  }

  try {
    // Returns false when another application already owns the combination —
    // the common case for CommandOrControl+Shift+V on a machine with a
    // clipboard manager installed.
    if (!globalShortcut.register(trimmed, action)) {
      return 'in use by another application'
    }
  } catch (err) {
    // Electron throws, rather than returning false, on a malformed string.
    return err instanceof Error ? err.message : 'invalid shortcut'
  }

  registered.add(trimmed)
  return null
}

/**
 * (Re-)bind both hotkeys from the current settings. Safe to call on every
 * settings change; it releases the previous bindings first.
 */
export function applyHotkeys(settings: Settings, actions: HotkeyActions): HotkeyBindingFailure[] {
  unregisterHotkeys()

  const failures: HotkeyBindingFailure[] = []

  const shelfError = bind(settings.hotkeyToggleShelf, actions.toggleShelf)
  if (shelfError !== null) {
    failures.push({
      accelerator: settings.hotkeyToggleShelf,
      setting: 'hotkeyToggleShelf',
      reason: shelfError
    })
  }

  const gaugeError = bind(settings.hotkeyToggleGauge, actions.toggleGauge)
  if (gaugeError !== null) {
    failures.push({
      accelerator: settings.hotkeyToggleGauge,
      setting: 'hotkeyToggleGauge',
      reason: gaugeError
    })
  }

  return failures
}

export function unregisterHotkeys(): void {
  for (const accelerator of registered) {
    try {
      globalShortcut.unregister(accelerator)
    } catch {
      // Already gone — for instance because the OS released it on suspend.
    }
  }
  registered.clear()
}

/** Accelerators Ledge currently holds. Used by the tray to label its items. */
export function activeHotkeys(): string[] {
  return [...registered]
}
