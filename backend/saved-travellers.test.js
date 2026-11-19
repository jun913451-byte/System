import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { DatabaseSync } from 'node:sqlite'

test('saved travellers persist, validate input, and seed without overwriting records', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'trip-travellers-'))
  const dbPath = join(dir, 'test.sqlite')
  const db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE saved_travellers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, identity_number TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO saved_travellers (id, name, identity_number) VALUES ('existing', '已有用户', '12345678');
  `)
  db.close()
  const listener = createServer().listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const port = listener.address().port
  await new Promise(resolve => listener.close(resolve))
  let child
  const stop = async () => {
    if (child && child.exitCode === null) { child.kill(); await once(child, 'exit') }
  }
  t.after(async () => { await stop(); rmSync(dir, { recursive: true, force: true }) })
  const start = async () => {
    child = spawn(process.execPath, ['--experimental-sqlite', 'backend/server.js'], {
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', TRIP_DB_PATH: dbPath, NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('server failed to start') })])
  }
  const request = async (method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/travellers`, {
      method, headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() }
  }
  await start()
  const initial = await request()
  assert.equal(initial.cache, 'no-store')
  assert.deepEqual(initial.body.travellers.map(({ name, identityNumber }) => [name, identityNumber]), [
    ['已有用户', '12345678'], ['mjk', '234567'], ['wyj', '4567890'],
  ])
  assert.equal((await request('POST', { name: ' ', identityNumber: '12' })).status, 400)
  assert.equal((await request('POST', { name: 'test', identityNumber: 123 })).status, 400)
  assert.equal((await request('POST', { name: 'test', identityNumber: '234567' })).status, 409)
  const added = await request('POST', { name: '  新旅客  ', identityNumber: '  001x  ' })
  assert.equal(added.status, 201)
  assert.equal(added.body.traveller.identityNumber, '001x')
  assert.equal(added.body.traveller.name, '新旅客')
  await stop()
  const edit = new DatabaseSync(dbPath)
  edit.prepare('UPDATE saved_travellers SET name = ? WHERE id = ?').run('已修改', 'existing')
  edit.prepare('DELETE FROM saved_travellers WHERE identity_number = ?').run('234567')
  edit.close()
  await start()
  const afterRestart = (await request()).body.travellers
  assert.equal(afterRestart.length, 3)
  assert.equal(afterRestart.find(traveller => traveller.id === 'existing').name, '已修改')
  assert.ok(!afterRestart.some(traveller => traveller.identityNumber === '234567'))
  assert.ok(afterRestart.some(traveller => traveller.id === added.body.traveller.id))
})

test('a new database receives all three demonstration travellers', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'trip-seeds-'))
  const listener = createServer().listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const port = listener.address().port
  await new Promise(resolve => listener.close(resolve))
  const child = spawn(process.execPath, ['--experimental-sqlite', 'backend/server.js'], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', TRIP_DB_PATH: join(dir, 'test.sqlite'), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit') }
    rmSync(dir, { recursive: true, force: true })
  })
  await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('server failed to start') })])
  const response = await fetch(`http://127.0.0.1:${port}/api/travellers`)
  const { travellers } = await response.json()
  assert.deepEqual(travellers.map(({ name, identityNumber }) => [name, identityNumber]), [
    ['ljc', '12345678'], ['mjk', '234567'], ['wyj', '4567890'],
  ])
})
