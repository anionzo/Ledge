/**
 * File-type awareness for the drag ghost icon.
 *
 * Maps a file path (by extension) to a stable category used to pick the pastel
 * folder glyph rendered in `fileSvg.ts`. Ported from Edge-Drop's renderer
 * helper, minus the i18n layer — the main process only needs the `kind`, not a
 * localized label.
 */

/** Semantic category a file falls into for display purposes. */
export type FileKind =
  | 'pdf'
  | 'word'
  | 'excel'
  | 'powerpoint'
  | 'archive'
  | 'text'
  | 'code'
  | 'audio'
  | 'video'
  | 'image'
  | 'executable'
  | 'folder'
  | 'file' // generic fallback

/** Extension -> category. Compared case-insensitively. */
const EXT_MAP: Record<string, FileKind> = {
  pdf: 'pdf',
  doc: 'word', docx: 'word', docm: 'word', odt: 'word', rtf: 'word', pages: 'word',
  xls: 'excel', xlsx: 'excel', xlsm: 'excel', csv: 'excel', ods: 'excel', numbers: 'excel',
  ppt: 'powerpoint', pptx: 'powerpoint', pptm: 'powerpoint', odp: 'powerpoint', key: 'powerpoint',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive', bz2: 'archive', xz: 'archive', iso: 'archive', dmg: 'archive',
  txt: 'text', md: 'text', markdown: 'text', log: 'text',
  js: 'code', ts: 'code', jsx: 'code', tsx: 'code', json: 'code', html: 'code', css: 'code', scss: 'code',
  py: 'code', java: 'code', c: 'code', cpp: 'code', cs: 'code', go: 'code', rs: 'code', rb: 'code',
  php: 'code', sh: 'code', yml: 'code', yaml: 'code', xml: 'code', sql: 'code', vue: 'code', svelte: 'code',
  mp3: 'audio', wav: 'audio', flac: 'audio', aac: 'audio', ogg: 'audio', m4a: 'audio', wma: 'audio',
  mp4: 'video', mkv: 'video', avi: 'video', mov: 'video', wmv: 'video', flv: 'video', webm: 'video', m4v: 'video',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', bmp: 'image', svg: 'image', avif: 'image', ico: 'image',
  tif: 'image', tiff: 'image', jfif: 'image', pjpeg: 'image', pjp: 'image',
  exe: 'executable', msi: 'executable', bat: 'executable', cmd: 'executable', ps1: 'executable', apk: 'executable', app: 'executable', dll: 'executable',
  folder: 'folder'
}

/** Extract the lowercase extension (no dot) from a path. */
export function extOf(path: string): string {
  const dot = path.lastIndexOf('.')
  if (dot < 0) return ''
  return path.slice(dot + 1).toLowerCase()
}

/** Resolve a file path to its display category. */
export function getFileKind(path: string, isDirectory?: boolean): FileKind {
  if (isDirectory) return 'folder'
  return EXT_MAP[extOf(path)] ?? 'file'
}

/** True when a path points at a raster/vector image by extension. */
export function isImageExt(p: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico|tiff?|jfif|pjpeg|pjp)$/i.test(p)
}
