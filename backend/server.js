import { createServer } from 'node:http'
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const frontendRoot = join(projectRoot, 'frontend')
const staticRoot = existsSync(join(projectRoot, 'dist'))
  ? join(projectRoot, 'dist')
  : frontendRoot
const dbDir = join(projectRoot, 'data')
if (!existsSync(dbDir)) mkdirSync(dbDir)
const db = new DatabaseSync(join(dbDir, 'demo.sqlite'))
db.exec(`
  CREATE TABLE IF NOT EXISTS demo_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    confirmed INTEGER NOT NULL DEFAULT 0,
    processed INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );
  INSERT OR IGNORE INTO demo_state (id, confirmed, processed, updated_at)
  VALUES (1, 0, 0, datetime('now'));
`)

function state() {
  return db.prepare('SELECT confirmed, processed FROM demo_state WHERE id = 1').get()
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

const server = createServer(async (req, res) => {
  if (req.url === '/api/state' && req.method === 'GET') {
    return send(res, 200, state())
  }
  if (req.url === '/api/confirm' && req.method === 'POST') {
    let body = ''
    for await (const chunk of req) body += chunk
    const payload = JSON.parse(body || '{}')
    if (payload.confirmed !== true) return send(res, 400, { error: '需要明确确认方案' })
    db.prepare('UPDATE demo_state SET confirmed = 1, processed = 0, updated_at = datetime(\'now\') WHERE id = 1').run()
    return send(res, 200, state())
  }
  if (req.url === '/api/process' && req.method === 'POST') {
    if (!state().confirmed) return send(res, 409, { error: '方案尚未确认，不能模拟办理' })
    db.prepare('UPDATE demo_state SET processed = 1, updated_at = datetime(\'now\') WHERE id = 1').run()
    return send(res, 200, state())
  }
  if (req.url === '/api/reset' && req.method === 'POST') {
    db.prepare('UPDATE demo_state SET confirmed = 0, processed = 0, updated_at = datetime(\'now\') WHERE id = 1').run()
    return send(res, 200, state())
  }

  const pathname = req.url === '/' ? '/index.html' : req.url.split('?')[0]
  const filePath = join(staticRoot, pathname.replace(/^\/+/, ''))
  if (filePath.startsWith(staticRoot) && existsSync(filePath)) {
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[extname(filePath)] || 'application/octet-stream'
    res.writeHead(200, { 'content-type': `${type}; charset=utf-8` })
    res.end(readFileSync(filePath))
    return
  }
  res.writeHead(404)
  res.end('Not found')
})

const port = Number(process.env.PORT || 3000)
server.listen(port, '0.0.0.0', () => console.log(`API ready at http://localhost:${port}`))
