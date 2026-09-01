/**
 * The one HTTPS client the quota providers use.
 *
 * Ported from `httpsRequest` in agent-notch's `scrapers.js` with three
 * hardenings, all of which matter because these calls carry live OAuth
 * tokens to third-party hosts:
 *
 *  1. A *hard* deadline, not just a socket-idle timeout. The original only
 *     set `timeout`, which node applies per socket-inactivity; a server that
 *     dribbled a byte every nine seconds could hold a request open forever
 *     and wedge the refresh cycle. A wall-clock timer now destroys the
 *     request regardless of activity.
 *  2. A size cap enforced as bytes arrive, so a hostile or broken endpoint
 *     cannot exhaust memory. Kept from the original and made explicit.
 *  3. https only. A redirect or a mis-typed custom URL must not be able to
 *     downgrade a request that carries an Authorization header to cleartext.
 *
 * Response bodies are parsed leniently: a non-JSON body yields `json: null`
 * with the status preserved, because every caller decides what to do from the
 * status first.
 */
import https from 'node:https'
import { URL } from 'node:url'

/** Cap on a response body, ported from the original MAX_BODY_BYTES. */
export const MAX_BODY_BYTES = 1_000_000

export const DEFAULT_TIMEOUT_MS = 10_000

export interface HttpsRequestOptions {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string | null
  timeoutMs?: number
  maxBodyBytes?: number
}

export interface HttpsResponse {
  /** HTTP status, or 0 when the server closed without one. */
  status: number
  /** Parsed JSON body, or null when the body was empty or not JSON. */
  json: unknown
}

export class HttpError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HttpError'
  }
}

/**
 * Is this address one no quota endpoint could legitimately live at?
 *
 * Deliberately narrow: **link-local only** (169.254.0.0/16 and fe80::/10).
 * That range contains 169.254.169.254, the cloud metadata service, which hands
 * out instance credentials to anything on the box that asks — a custom
 * provider pointed there would send the user's token and get the machine's
 * back.
 *
 * It does NOT block loopback or LAN addresses, and that is the whole design.
 * This app's custom-provider mode exists to read the new-api / one-api /
 * one-hub family of relays (see the header of `providers/custom.ts`), and
 * people self-host those on `localhost` or a box down the hall. A blanket
 * private-range denylist would have been the textbook answer and would have
 * broken a documented, legitimate feature to guard against a URL the user has
 * to type themselves.
 */
export function isBlockedAddress(address: string): boolean {
  const addr = address.trim().toLowerCase()
  if (addr.includes(':')) {
    // fe80::/10 — link-local. The mapped ::ffff:169.254.x.x form too.
    if (/^fe[89ab]/.test(addr)) return true
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr)
    return mapped?.[1] ? isBlockedAddress(mapped[1]) : false
  }

  const parts = addr.split('.')
  if (parts.length !== 4) return false
  const a = Number(parts[0])
  const b = Number(parts[1])
  return a === 169 && b === 254
}

/** Hostnames refused without a DNS round trip. */
function isBlockedHostname(hostname: string): boolean {
  return isBlockedAddress(hostname.trim().toLowerCase().replace(/^\[|\]$/g, ''))
}

export async function httpsRequest(options: HttpsRequestOptions): Promise<HttpsResponse> {
  const {
    url,
    method = 'GET',
    headers = {},
    body = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBodyBytes = MAX_BODY_BYTES
  } = options

  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') {
    // Never send a bearer token in the clear.
    throw new HttpError(`refusing non-https request to ${parsed.protocol}//${parsed.host}`)
  }
  // LIMIT, stated rather than implied: a hostname that RESOLVES to a
  // link-local address still gets through. Closing that means issuing the
  // request against the resolved IP with SNI and Host pinned back to the
  // original name, and getting that subtly wrong breaks TLS for every real
  // provider — a bad trade against a URL the user has to type themselves.
  if (isBlockedHostname(parsed.hostname)) {
    throw new HttpError(`refusing request to a link-local address: ${parsed.host}`)
  }

  return new Promise<HttpsResponse>((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(body, 'utf8')
    const reqHeaders: Record<string, string> = { ...headers }
    if (payload) reqHeaders['Content-Length'] = String(payload.length)

    let settled = false
    let deadline: NodeJS.Timeout | null = null

    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      if (deadline) clearTimeout(deadline)
      deadline = null
      fn()
    }

    const req = https.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers: reqHeaders,
        timeout: timeoutMs
      },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > maxBodyBytes) {
            // Stop reading immediately; do not buffer the overflow.
            res.destroy()
            req.destroy()
            finish(() => reject(new HttpError('response too large')))
            return
          }
          chunks.push(chunk)
        })
        res.on('error', (err: Error) => {
          finish(() => reject(new HttpError(err.message)))
        })
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          let json: unknown = null
          if (raw) {
            try {
              json = JSON.parse(raw) as unknown
            } catch {
              json = null
            }
          }
          finish(() => resolve({ status: res.statusCode ?? 0, json }))
        })
      }
    )

    req.on('error', (err: Error) => {
      finish(() => reject(new HttpError(err.message)))
    })
    // Socket-idle timeout. Complements, but does not replace, the deadline.
    req.on('timeout', () => {
      req.destroy()
      finish(() => reject(new HttpError('timeout')))
    })

    // Hard wall-clock deadline: fires even while bytes are still trickling in.
    deadline = setTimeout(() => {
      req.destroy()
      finish(() => reject(new HttpError('timeout')))
    }, timeoutMs)
    // Do not hold the event loop open on this timer.
    if (typeof deadline.unref === 'function') deadline.unref()

    if (payload) req.write(payload)
    req.end()
  })
}
