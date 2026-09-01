/**
 * Coverage for `electron/features/quota/http.ts`, the one HTTPS client every
 * quota provider funnels through. Before this file the only assertion on it
 * was the non-https refusal — everything else (the hard deadline, the size
 * cap, status handling, and the fact that a timeout/error race can't corrupt
 * the promise) was unexercised.
 *
 * Real `node:https`/`node:http` servers are used throughout rather than
 * mocking the socket layer, because `httpsRequest` enforces `https:` at the
 * `https.request()` level — pointing it at a plain `http` server fails the
 * TLS handshake before a single byte of application data moves, which would
 * make the transport tests meaningless. A locally-generated, test-only
 * self-signed certificate (not tied to any real host or service) stands in
 * for a real one, with certificate verification disabled process-wide for
 * the duration of this file the way any Node test suite exercising TLS does.
 */
import http from 'node:http'
import https from 'node:https'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  DEFAULT_TIMEOUT_MS,
  HttpError,
  httpsRequest,
  MAX_BODY_BYTES
} from '../electron/features/quota/http'
import { errorMessage, redact } from '../electron/features/quota/util'

// Self-signed, localhost-only, generated solely for this test file (openssl
// req -x509 -newkey rsa:2048 -days 36500 -nodes -subj "//CN=localhost").
// It secures nothing and identifies nothing outside this process.
const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIIDJzCCAg+gAwIBAgIUVDwMIh0zUokur9Z9iy34KyoDuS4wDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MCAXDTI2MDkwMTEyNDgzN1oYDzIxMjYw
ODA4MTI0ODM3WjAUMRIwEAYDVQQDDAlsb2NhbGhvc3QwggEiMA0GCSqGSIb3DQEB
AQUAA4IBDwAwggEKAoIBAQDUZDBniZX8jjPAemg33zt8PqpzpKDUIGdiEaA4Eqnj
HQmtCKcZ+8Nf2rQNaQX/4zYVTGYyt21SWKOuiQWnO9C6kyA9ENoEgGISuPPpLAAQ
XC5A3n6gkSjFrYnmh8oWXHkrheO5lmsgi/J48uFw17fOZIr0dtx84LucI+E46gxk
iTK7d3PxRu4xALiS3R1NKeLNCDYMvGB4NJaNaGq06ZrsWvz3UQ+48GO2nkR6o2Gg
Aadd8+ELQrJAM+xlwPpjaoR3D8xYTUa1a9y6izWX6wjNZJTBjxiqGw9vu2uG7vH7
doYR7u2Lw41H3OvC0Q8Qru71AG19tLFwR53sxiCUIVZdAgMBAAGjbzBtMB0GA1Ud
DgQWBBTDKhWZeyPKokJ9BYEFHvVqhaGKgTAfBgNVHSMEGDAWgBTDKhWZeyPKokJ9
BYEFHvVqhaGKgTAPBgNVHRMBAf8EBTADAQH/MBoGA1UdEQQTMBGCCWxvY2FsaG9z
dIcEfwAAATANBgkqhkiG9w0BAQsFAAOCAQEAhF5VVnznMWTBd1kSL6s06eNVn7Pw
8wzC0A8L6zjCPPvuGniZmXcZZZJE3BDGVFhlFmZy75j3QRF4hZRsgIux++kPjWmL
gC5Z41PPz4FaNTSo3c41CcHg4DyYOilcLmjqGFr0I87HcEQgLicV1DmRyb7LTTQz
/oZlkOaqYfm5a0CX33E+ZZehzoAfGbuLniOGpALWJaNO+NSnBYrXYGdQHUL//UWD
JOkx7wX8qU4F+eHklArseHgje1/zaUf5oPeQqecdj+kypCfc0TBn+ga0JLSC/4yx
yam5bvLwVF2clQm7rFKhqilrOr4V+N3QSdto780xwdEJfndoTrPJ/wEQBg==
-----END CERTIFICATE-----
`
const TEST_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDUZDBniZX8jjPA
emg33zt8PqpzpKDUIGdiEaA4EqnjHQmtCKcZ+8Nf2rQNaQX/4zYVTGYyt21SWKOu
iQWnO9C6kyA9ENoEgGISuPPpLAAQXC5A3n6gkSjFrYnmh8oWXHkrheO5lmsgi/J4
8uFw17fOZIr0dtx84LucI+E46gxkiTK7d3PxRu4xALiS3R1NKeLNCDYMvGB4NJaN
aGq06ZrsWvz3UQ+48GO2nkR6o2GgAadd8+ELQrJAM+xlwPpjaoR3D8xYTUa1a9y6
izWX6wjNZJTBjxiqGw9vu2uG7vH7doYR7u2Lw41H3OvC0Q8Qru71AG19tLFwR53s
xiCUIVZdAgMBAAECggEANHi4GKw+GNIM6Q2Ut9D3wj89HyrZ7O5AfFL8cT3zKL/g
xxXvKpUvdHv0pad/qvM4RlTEnt0ALirl7VW+xs0ZSS7V9SA3rIsHL7bv03hiX6hW
aQJO6F5UY1n3SrPbcmDQMrd2RkBqIPVSJx1iIt24dE4UokbHPDbNQsr+dnAkNaXY
WUKo0BJDs86TCNTenzP8Gfb6Jd7IF9x5WoUm1W1jocHDBsYmd8kFEyAh9kUgRxP3
+1IQG+8MjRzaE3Iv/cyCXY6YCofMlDxbzM8djNrmWU3ahL+32jJHL406q/QXsXro
tg74dQJ/ZWT2FG25DaEhYox+ggAnJHfjR2olH6bM5QKBgQDvGHoQxqOw7rO43L2f
+lkF5jusIbndI8X2gYjulBiM0MTw++D6/dQhyzjlvSbpfdM1B1AJTOswpOXtFxgt
P+MFEdaRIDawiTlnRLFZ/g5BjQB3PK9jTDUBhem42CzaoiChu74l937sUaJ4QFVz
v9tpsAPWTdG2Z9PiH5T+vdSxCwKBgQDjaGCaEUZyVhOHCJSIeCL7Ur281SjnPyw/
A0eMh/c4+EHvMn1j5hv5oM+ezQ8UD5Vgf69xAIZ1QWlM42xdIdBSWRzfTmqO9lA3
DPnu5CcCSZsYBePTYL4b7MDjGAR05SUYa2H109Bw9egNICvtGg2cY/6U9zVrD83I
Xd++PsgHNwKBgAJ948/G8i/G3RKhIkzHhCP+mUKa+1/lnouKIA40dukIx/Sm+1pC
SPKtNoOWbBBk4k2cLOZb6duQ7GCDLBpUnx4PaIgMqOVAGNwNqDeC4U0nlgioFj/X
rHm+lof5oMYKiIKG/V1R7f2ygBn2ua1CI5w/XFrgZr4a6OdjYt8gxVWvAoGAd3LE
Cyk3z6bW6v7exjAUb96uOxncOls8anzWgEKK4SnFuFbU9jxQRXbql4cufGMTG3T2
Om0EM2MAZJqwuNqiCh80wzb1UdKfn8r5HTpKIzF2fc/aM5WFRjW9u4tKC/yw13rQ
Icf4nN0N3pcfe5NLwvHjL2wKawoKFUz50Xw4pVECgYBn7PRzWZB5gpCKgz5mwJcO
sPtug5Hz7V+LnFqgX+MoCdB+sjEsaTVtDWY3GjJO1bS3k4HcoALQ9SlK4lP6rTFo
X4lUzE9xmWNiu/MmvTy0IQWxh3HlTIou1duRJhgKfNie6thSsjB1yhz2s7BWYTgH
CO9SBzIA1ELJioTnoMa8ng==
-----END PRIVATE KEY-----
`

let savedTlsRejectUnauthorized: string | undefined

beforeAll(() => {
  // The cert above is self-signed, so the default chain-of-trust check must
  // be relaxed for this process the way it is for any Node test suite that
  // terminates real TLS against a local fixture. Nothing else in this file
  // talks to a real host.
  savedTlsRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
})

afterAll(() => {
  if (savedTlsRejectUnauthorized === undefined) {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
  } else {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = savedTlsRejectUnauthorized
  }
})

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void

interface RunningServer {
  port: number
  hits: () => number
  close: () => void
}

const openServers: Array<https.Server | http.Server> = []

afterEach(() => {
  for (const server of openServers.splice(0)) {
    // Force-drop any sockets a never-responding handler left open, or
    // `close()` would hang waiting for connections that will never end.
    server.closeAllConnections?.()
    server.close()
  }
})

function startHttpsServer(handler: Handler): Promise<RunningServer> {
  let hitCount = 0
  const server = https.createServer({ cert: TEST_CERT, key: TEST_KEY }, (req, res) => {
    hitCount += 1
    handler(req, res)
  })
  openServers.push(server)
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({ port, hits: () => hitCount, close: () => server.close() })
    })
  })
}

function startHttpServer(handler: Handler): Promise<RunningServer> {
  let hitCount = 0
  const server = http.createServer((req, res) => {
    hitCount += 1
    handler(req, res)
  })
  openServers.push(server)
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({ port, hits: () => hitCount, close: () => server.close() })
    })
  })
}

describe('httpsRequest > https-only', () => {
  it('refuses an http:// URL before opening a socket', async () => {
    // If a socket were ever opened, this decoy server would see the hit.
    const decoy = await startHttpServer((_req, res) => res.end('{}'))
    await expect(httpsRequest({ url: `http://127.0.0.1:${decoy.port}/usage` })).rejects.toThrow(
      /non-https/
    )
    expect(decoy.hits()).toBe(0)
  })

  it('does not follow a redirect that points back at plain http', async () => {
    // A 302 to an http:// Location must not cause a second, downgraded
    // request — that would be exactly the kind of leak the https-only rule
    // exists to prevent, and it would carry the Authorization header with it.
    const decoy = await startHttpServer((_req, res) => res.end('should never be requested'))
    const server = await startHttpsServer((_req, res) => {
      res.writeHead(302, { Location: `http://127.0.0.1:${decoy.port}/steal` })
      res.end()
    })
    const result = await httpsRequest({
      url: `https://127.0.0.1:${server.port}/`,
      headers: { Authorization: 'Bearer this-must-not-leak' }
    })
    expect(result.status).toBe(302)
    expect(decoy.hits()).toBe(0)
  })
})

describe('httpsRequest > timeouts', () => {
  it('abandons a connection that accepts but never sends anything, with a usable reason', async () => {
    const server = await startHttpsServer(() => {
      // Never call res.end(), or even res.writeHead(): total silence.
    })
    const started = Date.now()
    await expect(
      httpsRequest({ url: `https://127.0.0.1:${server.port}/`, timeoutMs: 100 })
    ).rejects.toMatchObject({ name: 'HttpError', message: expect.stringMatching(/timeout/i) })
    // Bounded well above the 100ms timeout to absorb scheduling jitter, but
    // far short of "hung until the test runner killed it".
    expect(Date.now() - started).toBeLessThan(2000)
  }, 5000)

  it('enforces a hard wall-clock deadline even while the socket stays active', async () => {
    // A server that dribbles a byte well inside the idle window would never
    // trip a socket-idle-only timeout. The deadline must still fire.
    const server = await startHttpsServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      const interval = setInterval(() => {
        if (res.writableEnded) {
          clearInterval(interval)
          return
        }
        res.write('.')
      }, 20)
      res.on('close', () => clearInterval(interval))
    })
    const started = Date.now()
    await expect(
      httpsRequest({ url: `https://127.0.0.1:${server.port}/`, timeoutMs: 150 })
    ).rejects.toBeInstanceOf(HttpError)
    const elapsed = Date.now() - started
    // It must have been cut off near the deadline, not left running for
    // several idle-windows' worth of trickled bytes.
    expect(elapsed).toBeLessThan(1000)
  }, 5000)
})

describe('httpsRequest > size cap', () => {
  it('cuts off an over-large body instead of buffering it whole', async () => {
    const server = await startHttpsServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
      // Keep writing well past the cap; a client that buffered to `end`
      // would hang here since this handler never calls res.end().
      const chunk = Buffer.alloc(256, 'x')
      const interval = setInterval(() => {
        if (res.writableEnded) {
          clearInterval(interval)
          return
        }
        res.write(chunk)
      }, 5)
      res.on('close', () => clearInterval(interval))
    })
    await expect(
      httpsRequest({ url: `https://127.0.0.1:${server.port}/`, maxBodyBytes: 1000 })
    ).rejects.toMatchObject({ name: 'HttpError', message: expect.stringMatching(/too large/i) })
  }, 5000)

  it('exports the documented 1MB default cap', () => {
    expect(MAX_BODY_BYTES).toBe(1_000_000)
    expect(DEFAULT_TIMEOUT_MS).toBe(10_000)
  })
})

describe('httpsRequest > settles exactly once', () => {
  it('rejects cleanly, with no stray unhandled rejection, when the deadline and a destroy-triggered error can race', async () => {
    // A never-responding server with a very short timeout puts the socket
    // idle-timeout, the hard deadline, and the error the subsequent
    // req.destroy() can trigger all in flight at once.
    const server = await startHttpsServer(() => {})
    const unhandled: unknown[] = []
    const onUnhandledRejection = (reason: unknown): void => {
      unhandled.push(reason)
    }
    process.on('unhandledRejection', onUnhandledRejection)
    try {
      await expect(
        httpsRequest({ url: `https://127.0.0.1:${server.port}/`, timeoutMs: 20 })
      ).rejects.toBeInstanceOf(HttpError)
      // Give any late-firing handler room to misbehave before checking.
      await new Promise((r) => setTimeout(r, 150))
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
    }
  }, 5000)

  it('leaves no live deadline timer behind once the response has already resolved', async () => {
    // If the deadline weren't cleared on a normal resolve, it would still
    // fire later and attempt to reject an already-settled promise.
    const server = await startHttpsServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"ok":true}')
    })
    const unhandled: unknown[] = []
    const onUnhandledRejection = (reason: unknown): void => {
      unhandled.push(reason)
    }
    process.on('unhandledRejection', onUnhandledRejection)
    try {
      const result = await httpsRequest({
        url: `https://127.0.0.1:${server.port}/`,
        timeoutMs: 50
      })
      expect(result).toEqual({ status: 200, json: { ok: true } })
      // Outlive the timeoutMs window the deadline was armed for.
      await new Promise((r) => setTimeout(r, 150))
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
    }
  }, 5000)
})

describe('httpsRequest > status handling', () => {
  const cases: Array<{ status: number; body: Record<string, unknown> }> = [
    { status: 401, body: { error: 'unauthorized' } },
    { status: 403, body: { error: 'forbidden' } },
    { status: 429, body: { error: 'rate_limited', retryAfter: 30 } },
    { status: 500, body: { error: 'internal' } }
  ]

  for (const { status, body } of cases) {
    it(`surfaces a ${status} as a resolved, distinguishable status rather than a generic rejection`, async () => {
      const server = await startHttpsServer((_req, res) => {
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(body))
      })
      const result = await httpsRequest({ url: `https://127.0.0.1:${server.port}/` })
      expect(result.status).toBe(status)
      expect(result.json).toEqual(body)
    })
  }
})

describe('redact / errorMessage — no credential shape reaches a message', () => {
  it('strips a Bearer token', () => {
    const token = 'a1b2c3d4e5f6g7h8i9j0-secret-bearer-value-that-is-long'
    expect(redact(`Authorization: Bearer ${token}`)).not.toContain(token)
  })

  it('strips a Basic auth value', () => {
    const value = 'dXNlcjpzdXBlci1zZWNyZXQtcGFzc3dvcmQ='
    expect(redact(`Authorization: Basic ${value}`)).not.toContain(value)
  })

  it('strips a JWT (header.payload.signature)', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.4Adcj3UFYzPUVaVF43FmMab6RlaQD8A9V8wFzzht-KQ'
    const out = redact(`token=${jwt}`)
    expect(out).not.toContain(jwt)
    expect(out).not.toContain('4Adcj3UFYzPUVaVF43FmMab6RlaQD8A9V8wFzzht-KQ')
  })

  // Vendor prefixes named in http.ts's own doc comment on redact(): OpenAI/
  // generic "sk-", Stripe-shaped "pk_", xAI, GitHub's gh[pousr]_ family, and
  // Google's AIza — when shaped the way the regex actually expects them.
  it.each([
    ['OpenAI/generic', 'sk-abcdefghijklmnopqrstuvwxyz123456'],
    ['Stripe-shaped', 'pk_live_abcdefghijklmnopqrstuvwxyz123456'],
    ['xAI', 'xai-abcdefghijklmnopqrstuvwxyz123456'],
    ['GitHub PAT', 'ghp_abcdefghijklmnopqrstuvwxyz1234567890AB'],
    ['Google, hyphenated', 'AIza-abcdefghijklmnopqrstuvwxyz12345678']
  ])('strips a %s-prefixed key', (_label, key) => {
    expect(redact(`key=${key}`)).not.toContain(key)
  })

  it('strips a 40+ character opaque run with no recognizable vendor prefix', () => {
    const opaque = 'Q7mP2xR9tL4nW8vB3kD6sF1hJ5gA0yC2eZ9uN7iM4oK'
    expect(opaque.length).toBeGreaterThanOrEqual(40)
    expect(redact(`session=${opaque}`)).not.toContain(opaque)
  })

  it('errorMessage() redacts before a thrown value ever becomes a string', () => {
    const token = 'sk-leaked-through-an-error-message-abcdefgh'
    const err = new Error(`upstream said: ${token}`)
    expect(errorMessage(err, 'fallback')).not.toContain(token)
  })

  // The regression this file found. A real Google API key is "AIza" plus 35
  // characters with NO separator — 39 in total — so it fell between the two
  // rules that were meant to catch it: the vendor rule wanted a "-" or "_"
  // straight after the prefix, and the generic catch-all wants 40 characters,
  // one more than a real key has. It reached logs and error messages intact.
  it('redacts a real-shaped 39-character Google API key with no separator', () => {
    const realShapedKey = 'AIzaSyDaGmWKa4JsXZHjGw7ISLn3namBGewQeXY'
    expect(realShapedKey.length).toBe(39)
    expect(redact(`key=${realShapedKey}`)).not.toContain(realShapedKey)
    // And through the one path that turns a throw into user-visible text.
    expect(errorMessage(new Error(`fetch failed for ${realShapedKey}`), 'x')).not.toContain(
      realShapedKey
    )
  })

  it('leaves an ordinary word that merely starts with those letters alone', () => {
    // Over-redaction is cheap but not free: the rule needs at least 10 more
    // characters, so prose does not turn into "[redacted]".
    expect(redact('AIzaSy is short')).toContain('AIzaSy')
  })
})
