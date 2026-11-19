import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { DatabaseSync } from 'node:sqlite'

test('reset deletes orders and their alerts but preserves dialogue, projects and plans', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'trip-reset-'))
  const dbPath = join(dir, 'test.sqlite')
  const listener = createServer().listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const port = listener.address().port
  await new Promise(resolve => listener.close(resolve))
  const child = spawn(process.execPath, ['--experimental-sqlite', 'backend/server.js'], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', TRIP_DB_PATH: dbPath, NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit') }
    rmSync(dir, { recursive: true, force: true })
  })
  await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('server failed to start') })])
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method, headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    assert.ok(response.ok, `${method} ${path}: ${response.status}`)
    return response.json()
  }
  const project = await request('/projects', 'POST', { destination: '北京', days: 3, tripStartDate: '2027-06-12' })
  const person = (await request('/travellers')).travellers[0]
  const input = { productId: 'hotel-BJS-1', checkIn: '2027-06-12', checkOut: '2027-06-14', travellerIds: [person.id], projectId: project.id }
  const first = await request('/orders', 'POST', input)
  await request('/orders', 'POST', input)
  assert.ok((await request('/alerts')).alerts.some(alert => alert.orderId))
  const db = new DatabaseSync(dbPath)
  db.prepare("INSERT INTO agent_runs (id, project_id, trigger_type, request_summary, status, response_summary) VALUES ('conversation', ?, 'chat', '我的问题', 'completed', '助手回答')").run(project.id)
  db.prepare("INSERT INTO saved_plans (id, project_id, item_json) VALUES ('plan', ?, '{}')").run(project.id)
  db.close()
  const result = await request('/reset-orders', 'POST')
  assert.equal(result.deleted, 2)
  assert.ok(result.projectIds.includes(project.id))
  assert.deepEqual((await request('/orders')).orders, [])
  assert.ok(!(await request('/alerts')).alerts.some(alert => alert.orderId))
  const check = new DatabaseSync(dbPath)
  assert.equal(check.prepare("SELECT response_summary FROM agent_runs WHERE id = 'conversation'").get().response_summary, '助手回答')
  assert.equal(check.prepare('SELECT COUNT(*) AS count FROM saved_plans').get().count, 1)
  const itinerary = JSON.parse(check.prepare('SELECT itinerary_json FROM travel_projects WHERE id = ?').get(project.id).itinerary_json)
  const items = itinerary.days.flatMap(day => day.items)
  assert.ok(items.some(item => item.title === first.order.title))
  assert.ok(items.every(item => item.bookingId !== first.order.id))
  check.close()
})
