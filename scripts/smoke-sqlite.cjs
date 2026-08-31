/**
 * Does `node:sqlite` work inside Electron's main process?
 *
 * The answer decides Bezel's storage story. agent-notch shelled out to Python
 * to read Cursor's `state.vscdb`, which meant shipping a Python dependency for
 * one SELECT. If Electron's bundled Node exposes `node:sqlite`, that dependency
 * disappears — and so does sql.js, which would otherwise cost ~1 MB of wasm to
 * do the same job.
 *
 * `node:sqlite` is behind `--experimental-sqlite` on Node 22 and unflagged from
 * Node 23 on, so which Electron ships it is not something to assume. Hence this
 * script: run it, read one line, decide.
 *
 * CommonJS on purpose — `electron scripts/smoke-sqlite.cjs` runs this file
 * directly as a main script, and package.json declares `"type": "module"`.
 *
 * Usage: npm run smoke:sqlite
 * Prints: SQLITE OK <version>   or   SQLITE UNAVAILABLE <error>
 */
const { app } = require('electron')

function probe() {
  // Required lazily: an unsupported build throws ERR_UNKNOWN_BUILTIN_MODULE at
  // require time, and that is one of the outcomes being measured.
  const { DatabaseSync } = require('node:sqlite')

  const db = new DatabaseSync(':memory:')
  try {
    db.exec('CREATE TABLE probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)')
    db.prepare('INSERT INTO probe (id, value) VALUES (?, ?)').run(1, 'bezel')

    const row = db.prepare('SELECT value FROM probe WHERE id = ?').get(1)
    if (!row || row.value !== 'bezel') {
      throw new Error(`round-trip mismatch: ${JSON.stringify(row)}`)
    }

    const version = db.prepare('SELECT sqlite_version() AS v').get().v
    return String(version)
  } finally {
    db.close()
  }
}

function run() {
  let code = 0
  try {
    console.log(`SQLITE OK ${probe()}`)
  } catch (err) {
    // One line, always — this is meant to be readable from CI output without
    // scrolling through a stack trace.
    console.log(`SQLITE UNAVAILABLE ${err && err.message ? err.message : String(err)}`)
    code = 1
  }
  // exit, not quit: there are no windows and no listeners to unwind, and quit()
  // would wait for a 'ready' cycle that never produces anything.
  app.exit(code)
}

app.whenReady().then(run)
