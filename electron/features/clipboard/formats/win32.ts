/**
 * Windows-specific clipboard file reads.
 *
 * This Electron line no longer exposes CF_HDROP synchronously, so the reliable
 * path is `Clipboard.GetFileDropList()` over PowerShell (independent of the JS
 * clipboard API), with a parse of the raw `FileNameW` payload — surfaced via the
 * async clipboard as an `electron application/osclipboard` format — as a
 * fallback. Everything degrades to `[]` / `0`; nothing here throws.
 *
 * Selected only when `formats/index.ts` has decided the host is Windows, so the
 * direct `child_process`/`koffi` use is deliberate: this module IS the win32
 * branch.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'

const execFileAsync = promisify(execFile)

const NUL = String.fromCharCode(0)

/** Raw OS format that carries the copied file path list. */
export const fileFormats = ['electron application/osclipboard;format="FileNameW"'] as const

/** Types that hint a file copy is present (so we bother shelling out to PowerShell). */
const FILE_HINT_RE = /file|hdrop|osclipboard/i

/**
 * `GetClipboardSequenceNumber` bumps on every OS clipboard write, including a
 * re-copy of identical content. Loaded lazily and guarded so a machine without
 * the koffi native binding reports 0 (change detection then falls back to
 * content comparison, like macOS/Linux).
 */
let seqFn: (() => number) | null = null
let seqLoaded = false
function loadSeqFn(): (() => number) | null {
  if (seqLoaded) return seqFn
  seqLoaded = true
  try {
    const koffi = require('koffi') as typeof import('koffi')
    const user32 = koffi.load('user32.dll')
    seqFn = user32.func('uint32 GetClipboardSequenceNumber()') as unknown as () => number
  } catch {
    seqFn = null
  }
  return seqFn
}

export function clipboardSequenceNumber(): number {
  const fn = loadSeqFn()
  if (!fn) return 0
  try {
    return fn()
  } catch {
    return 0
  }
}

function filterValid(paths: string[]): string[] {
  return paths.map((p) => p.trim()).filter((p) => p.length > 0 && existsSync(p))
}

/** Parse the raw FileNameW payload (UTF-16LE, NUL-separated). */
export function parseFiles(raw: Map<string, Buffer>, _text: string): string[] {
  const buf = raw.get(fileFormats[0])
  if (!buf || buf.length < 2) return []
  return filterValid(buf.toString('utf16le').split(NUL))
}

/** True when the advertised types suggest a file copy worth a PowerShell probe. */
export function hasFileHint(types: readonly string[]): boolean {
  return types.some((t) => FILE_HINT_RE.test(t))
}

/**
 * Native Excel format names that ride along with a spreadsheet cell-range
 * copy. Excel always stamps at least one of these alongside its CF_DIB
 * preview bitmap; a Snipping Tool or browser "Copy Image" capture never does.
 */
const SPREADSHEET_FORMAT_RE = /biff\d*|xml spreadsheet|\bcsv\b|sylk|\bdif\b|\bwk1\b/i

/**
 * HTML markers a spreadsheet clipboard fragment carries even with none of the
 * native Excel formats above — e.g. Google Sheets copied from a browser,
 * which only ever puts web-standard `text/html` + `text/plain` on the
 * clipboard, no OS-level Biff/Csv formats.
 */
const SPREADSHEET_HTML_RE = /data-sheets-|google-sheets|urn:schemas-microsoft-com:office:spreadsheet/i

/**
 * True when a clipboard snapshot is a spreadsheet cell-range selection rather
 * than a screenshot/picture, even though a CF_DIB bitmap is present.
 *
 * Copying cells out of Excel or Google Sheets puts BOTH an image (a rendered
 * preview of the selection) and HTML (the actual grid, as a `<table>`) on the
 * clipboard. Ledge's screenshot/image classifier used to always win when an
 * image was present and the plain-text side happened to be empty — which does
 * happen for some spreadsheet copies — turning a cell copy into a screenshot.
 * This is the tie-breaker: an HTML `<table>` plus a spreadsheet-specific
 * fingerprint (format name or HTML marker) means "grid data", never "picture".
 *
 * Pure — takes the already-sampled format list and HTML string, so it
 * unit-tests without a live clipboard.
 */
export function preferTabularOverImage(formats: readonly string[], html: string | null): boolean {
  if (!html || !/<table\b/i.test(html)) return false
  return formats.some((f) => SPREADSHEET_FORMAT_RE.test(f)) || SPREADSHEET_HTML_RE.test(html)
}

/**
 * Full multi-file list via `Clipboard.GetFileDropList()` — the only reliable way
 * to retrieve ALL selected files from a multi-file Explorer copy.
 */
export async function readFilesRich(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetFileDropList()'
      ],
      { encoding: 'utf8', timeout: 2000, windowsHide: true }
    )
    return stdout ? filterValid(stdout.split(/\r?\n/)) : []
  } catch {
    return []
  }
}
