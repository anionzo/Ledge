/**
 * Polls the system clipboard and reports genuinely new content.
 *
 * Electron has no native clipboard-changed event, so we sample on an interval.
 * To avoid duplicate items — and to avoid re-decoding image bytes every tick —
 * we keep a cheap signature of the last seen state (see
 * `formats.clipboardSignature`) and only do the full capture when it changes.
 *
 * This Electron line's clipboard API is async, so both signature reads and the
 * capture are awaited; a `busy` guard drops overlapping ticks so a slow read
 * (e.g. the Windows PowerShell file-list probe) never stacks up.
 *
 * On Windows the signature carries the OS clipboard sequence number, so a
 * re-copy of identical content is still detected (and its hitCount bumped);
 * elsewhere the sequence number is 0 and change detection is content-based.
 */
import { powerMonitor } from 'electron'
import { createId } from './ids'
import { captureClipboard, clipboardSignature } from './formats'
import type { ItemData } from '../../../shared/types/clipboard'

/**
 * Fired when genuinely new content lands on the clipboard. For image captures
 * the staged PNG bytes are handed over as the second argument so the store can
 * persist them without re-reading the clipboard.
 */
export type NewItemHandler = (data: ItemData, imagePng?: Buffer) => void

/** Strip the volatile OS sequence prefix to compare content only. */
function contentPart(sig: string): string {
  return sig.replace(/^seq:\d+:/, '')
}

export class ClipboardWatcher {
  private timer: ReturnType<typeof setInterval> | null = null
  private settleTimer: ReturnType<typeof setTimeout> | null = null
  private lastSig = 'empty'
  private paused = false
  private suspended = false
  private busy = false
  private seeded = false
  private onNew: NewItemHandler | null = null
  private removePowerHooks: (() => void) | null = null
  private readonly intervalMs: number

  constructor(intervalMs = 600) {
    this.intervalMs = intervalMs
  }

  /** Start watching. `onNew` fires for every genuinely new piece of content. */
  start(onNew: NewItemHandler): void {
    if (this.timer) return
    this.onNew = onNew
    // Seed the signature so we don't re-fire for whatever is already on the
    // clipboard at startup (the user didn't "just" copy it).
    void this.seed()

    this.timer = setInterval(() => void this.tick(), this.intervalMs)

    // Sleep can leave the clipboard subsystem in a state where a read blocks or
    // returns garbage; pause across suspend and resync on resume.
    const onSuspend = (): void => {
      this.suspended = true
    }
    const onResume = (): void => {
      this.suspended = false
      void this.seed()
    }
    try {
      powerMonitor.on('suspend', onSuspend)
      powerMonitor.on('resume', onResume)
      this.removePowerHooks = () => {
        powerMonitor.removeListener('suspend', onSuspend)
        powerMonitor.removeListener('resume', onResume)
      }
    } catch {
      // powerMonitor is only available after `app` is ready; skip if not.
      this.removePowerHooks = null
    }
  }

  private async seed(): Promise<void> {
    try {
      this.lastSig = await clipboardSignature()
    } catch {
      this.lastSig = 'empty'
    }
    this.seeded = true
  }

  private async tick(): Promise<void> {
    if (this.paused || this.suspended || this.busy || !this.seeded || !this.onNew) return
    this.busy = true
    try {
      const sig = await clipboardSignature()
      if (sig === this.lastSig) return

      // A change (new content, or the OS sequence bumped from a re-copy). Record
      // it immediately so subsequent ticks don't spawn duplicate settle timers.
      this.lastSig = sig
      if (this.settleTimer) clearTimeout(this.settleTimer)
      this.settleTimer = setTimeout(() => void this.settle(sig), 150)
    } finally {
      this.busy = false
    }
  }

  private async settle(sig: string): Promise<void> {
    this.settleTimer = null
    if (this.paused || this.suspended || !this.onNew) return

    const stableSig = await clipboardSignature()
    // Reject transient injections that were immediately reverted by another app.
    if (contentPart(stableSig) !== contentPart(sig) && stableSig !== sig) return
    this.lastSig = stableSig

    const captured = await captureClipboard()
    if (!captured || this.paused || this.suspended || !this.onNew) return

    const { data, imagePng } = captured
    if (data.kind === 'image') {
      data.imageId = createId()
      this.onNew(data, imagePng)
    } else {
      this.onNew(data)
    }
  }

  /** Temporarily stop recording (incognito / self-copy) without tearing down the timer. */
  setPaused(paused: boolean): void {
    this.paused = paused
    if (paused && this.settleTimer) {
      clearTimeout(this.settleTimer)
      this.settleTimer = null
    }
    // On resume, refresh the signature so whatever was copied while paused is
    // not captured retroactively.
    if (!paused) void this.seed()
  }

  /**
   * Resync last-seen signature to the live clipboard. Call after delete/clear so
   * deleted content still sitting on the OS clipboard is not re-added on the next
   * poll, while a genuine later re-copy is still detected as a change.
   */
  resyncSignature(): void {
    if (this.settleTimer) {
      clearTimeout(this.settleTimer)
      this.settleTimer = null
    }
    void this.seed()
  }

  /**
   * Invalidate last-seen signature with a sentinel that can never match a real
   * clipboard signature. Call after a paste so the VERY NEXT Ctrl+C — even of the
   * same content — is detected and its hitCount counted.
   */
  invalidateSignature(): void {
    if (this.settleTimer) {
      clearTimeout(this.settleTimer)
      this.settleTimer = null
    }
    this.lastSig = '__post-paste__'
  }

  stop(): void {
    if (this.settleTimer) {
      clearTimeout(this.settleTimer)
      this.settleTimer = null
    }
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.removePowerHooks?.()
    this.removePowerHooks = null
    this.onNew = null
  }
}
