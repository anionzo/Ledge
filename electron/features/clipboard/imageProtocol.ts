/**
 * Serves clipboard images to the renderer over a privileged `ledge://` scheme
 * (already allow-listed in the renderer CSP as `img-src … ledge:`).
 *
 * Routes:
 *   ledge://<imageId>            full-resolution stored capture
 *   ledge://thumb/<imageId>      240px thumbnail of a stored capture
 *   ledge://thumb/file/<path>    240px thumbnail of an external image file
 *                                (used to preview a `file` payload's image)
 *   ledge://file/<path>          an external animated image file, byte for byte
 *
 * Stored-capture routes are confined to the app's own images directory — the
 * id is validated to `[a-z0-9-]` and the resolved file must sit *directly* in
 * that dir, so no `..` or absolute path can escape it. The file-thumb route
 * exists to preview the user's own copied image files and is restricted to
 * image extensions on files that actually exist.
 *
 * `ledge://file/` is the same idea with a narrower door: a thumbnail is a
 * re-encoded still, so an animated GIF served through it stops moving. This
 * route hands back the original bytes instead, and only for the formats where
 * that is the whole point — see `ANIMATED_IMAGE_EXTS`. Keeping it to those
 * means a card can never accidentally stream a 60 MB TIFF into a 40 px box.
 *
 * The scheme must be declared privileged BEFORE `app` is ready; the main
 * process does that by passing `{ scheme: PRIVILEGED_SCHEME, privileges:
 * LEDGE_PRIVILEGES }` to `protocol.registerSchemesAsPrivileged`. The streaming
 * handler itself is installed after ready via `registerLedgeProtocol()`.
 */
import { createReadStream, existsSync } from 'node:fs'
import { basename, dirname, extname, join, normalize, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { protocol } from 'electron'
import { PATHS } from './paths'
import { getThumbnailPayload, thumbnailCacheControl } from './thumbnailCache'

/** The custom scheme name. */
export const PRIVILEGED_SCHEME = 'ledge' as const

/**
 * Privilege object shape passed to `protocol.registerSchemesAsPrivileged`.
 * `standard` + `secure` make the origin behave like https for CSP purposes;
 * `stream` lets us return a streamed body; `supportFetchAPI` lets the renderer
 * use it from `fetch`/`<img>` without mixed-content complaints.
 */
export const LEDGE_PRIVILEGES = {
  standard: true,
  secure: true,
  supportFetchAPI: true,
  stream: true
} as const

const IMAGE_MIME_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  pjpeg: 'image/jpeg',
  pjp: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  ico: 'image/x-icon',
  tif: 'image/tiff',
  tiff: 'image/tiff'
}

/**
 * Extensions the full-file route will serve.
 *
 * Only formats that actually animate, because that is the only reason to skip
 * the thumbnail. GIF is the one the clipboard realistically carries as a file;
 * animated WebP exists but cannot be told apart from a still WebP without
 * decoding the container, and guessing would send every WebP down the
 * unbounded path.
 */
const ANIMATED_IMAGE_EXTS: ReadonlySet<string> = new Set(['gif'])

export interface StoredImage {
  filePath: string
  contentType: string
}

/** URL for the full-resolution stored capture. */
export function fullUrlForStoredImage(imageId: string): string {
  return `${PRIVILEGED_SCHEME}://${imageId}`
}

/** URL for a bounded thumbnail of a stored capture. */
export function thumbnailUrlForStoredImage(imageId: string): string {
  return `${PRIVILEGED_SCHEME}://thumb/${imageId}`
}

/**
 * URL for an external animated image file, served whole. Callers should reach
 * for `thumbnailUrlForFile` for everything else — this one is deliberately
 * unbounded so the animation survives.
 */
export function fullUrlForFile(filePath: string): string {
  return `${PRIVILEGED_SCHEME}://file/${encodeURIComponent(filePath.replace(/\\/g, '/'))}`
}

/** True when the full-file route is willing to serve this path. */
export function isAnimatedImageFile(filePath: string): boolean {
  return ANIMATED_IMAGE_EXTS.has(extname(filePath).slice(1).toLowerCase())
}

/** URL for a bounded thumbnail of an external image file. */
export function thumbnailUrlForFile(filePath: string): string {
  return `${PRIVILEGED_SCHEME}://thumb/file/${encodeURIComponent(filePath.replace(/\\/g, '/'))}`
}

/**
 * Resolve a stored-image id to its file WITHOUT letting the id select a path
 * outside `imagesDir` or a non-image type.
 */
export function resolveStoredImage(imagesDir: string, imageId: string): StoredImage | null {
  if (!/^[a-z0-9-]+$/i.test(imageId)) return null
  const baseDir = resolve(imagesDir)

  for (const ext of Object.keys(IMAGE_MIME_TYPES)) {
    const candidate = resolve(join(baseDir, `${imageId}.${ext}`))
    // Reject anything that escaped the images dir (defence in depth; the id
    // regex already forbids separators).
    if (dirname(candidate) !== baseDir) continue
    if (existsSync(candidate)) return { filePath: candidate, contentType: IMAGE_MIME_TYPES[ext] }
  }
  return null
}

function streamResponse(filePath: string, headers: Record<string, string>): Response {
  const body = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream<Uint8Array>
  return new Response(body, { status: 200, headers })
}

/** Serve a bounded thumbnail with ETag revalidation (→ 304) and cache policy. */
function thumbnailResponse(filePath: string, isStoredCapture: boolean, request: Request): Response {
  const payload = getThumbnailPayload(filePath)
  if (!payload) return new Response('Unsupported image', { status: 415 })

  const headers: Record<string, string> = {
    'Content-Type': payload.contentType,
    'Cache-Control': thumbnailCacheControl(isStoredCapture),
    ETag: payload.etag
  }
  if (request.headers.get('if-none-match') === payload.etag) {
    return new Response(null, { status: 304, headers })
  }
  return new Response(new Uint8Array(payload.body), { status: 200, headers })
}

/**
 * Install the `ledge://` streaming handler. Call once, after `app` is ready.
 */
export function registerLedgeProtocol(): void {
  protocol.handle(PRIVILEGED_SCHEME, (request) => {
    try {
      const prefix = `${PRIVILEGED_SCHEME}://`
      const rest = request.url.startsWith(prefix) ? request.url.slice(prefix.length) : request.url

      // ── thumbnails ──────────────────────────────────────────────────────
      if (rest.startsWith('thumb/')) {
        const target = rest.slice('thumb/'.length)
        if (target.startsWith('file/')) {
          const filePath = normalize(decodeURIComponent(target.slice('file/'.length)))
          if (!isImageFile(filePath) || !existsSync(filePath)) {
            return Promise.resolve(new Response('Not found', { status: 404 }))
          }
          return Promise.resolve(thumbnailResponse(filePath, false, request))
        }
        const stored = resolveStoredImage(PATHS.imagesDir(), stripQuery(target))
        if (!stored) return Promise.resolve(new Response('Not found', { status: 404 }))
        return Promise.resolve(thumbnailResponse(stored.filePath, true, request))
      }

      // ── external animated image file, byte for byte ────────────────────
      if (rest.startsWith('file/')) {
        const filePath = normalize(decodeURIComponent(rest.slice('file/'.length)))
        // Same existence and image-extension guards as the thumb route, plus
        // the animation narrowing: a still image has no reason to come through
        // here and every reason to stay bounded.
        if (!isImageFile(filePath) || !isAnimatedImageFile(filePath) || !existsSync(filePath)) {
          return Promise.resolve(new Response('Not found', { status: 404 }))
        }
        const ext = extname(filePath).slice(1).toLowerCase()
        return Promise.resolve(
          streamResponse(filePath, {
            'Content-Type': IMAGE_MIME_TYPES[ext],
            // A file on the user's disk can be replaced under the same path,
            // so this cannot claim the immutability the stored captures do.
            'Cache-Control': 'private, max-age=60'
          })
        )
      }

      // ── full-resolution stored capture ─────────────────────────────────
      const stored = resolveStoredImage(PATHS.imagesDir(), stripQuery(rest))
      if (!stored) return Promise.resolve(new Response('Not found', { status: 404 }))
      return Promise.resolve(
        streamResponse(stored.filePath, {
          'Content-Type': stored.contentType,
          'Cache-Control': 'private, max-age=31536000, immutable'
        })
      )
    } catch (err) {
      console.error('[ledge] protocol error', err)
      return Promise.resolve(new Response('Error', { status: 500 }))
    }
  })
}

/** Trim query/hash and any trailing slash a standard-scheme URL appends to a bare host. */
function stripQuery(s: string): string {
  const cut = s.search(/[?#]/)
  const base = cut >= 0 ? s.slice(0, cut) : s
  return base.replace(/\/+$/, '')
}

function isImageFile(p: string): boolean {
  const ext = extname(p).slice(1).toLowerCase()
  return ext in IMAGE_MIME_TYPES && basename(p).length > 0
}
