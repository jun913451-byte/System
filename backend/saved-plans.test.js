import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { once } from 'node:events'

test('saved itinerary notes persist and detach when their trip is deleted', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'trip-saved-plans-'))
  const dbPath = join(dir, 'plans.sqlite')
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
    return { status: response.status, ...(await response.json()) }
  }

  const project = await request('/projects', 'POST', { destination: '杭州', days: 2 })
  const saved = await request('/plans', 'POST', { id: 'map-point', title: '公园', detail: '散步', date: '2027-06-13' })
  assert.equal(saved.status, 201)
  assert.equal((await request('/plans/map-point/project', 'PATCH', { projectId: project.id })).item.projectId, project.id)
  assert.equal((await request(`/projects/${project.id}`)).savedPlans[0].title, '公园')
  assert.equal((await request(`/projects/${project.id}`, 'DELETE')).deleted, true)
  assert.equal((await request('/plans')).items[0].projectId, null)
  assert.equal((await request('/plans/map-point', 'DELETE')).deleted, true)
})
