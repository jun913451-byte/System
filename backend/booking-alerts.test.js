import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { once } from 'node:events'

test('cross-project alerts persist, share read state, migrate and resolve when the conflicting order is cancelled', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'trip-alerts-'))
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
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method, headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: response.status, ...(await response.json()) }
  }
  const person = (await request('/travellers')).travellers[0]
  const p1 = await request('/projects', 'POST', { destination: '北京', days: 5, tripStartDate: '2027-06-12' })
  const p2 = await request('/projects', 'POST', { destination: '北京', days: 5, tripStartDate: '2027-06-12' })
  const input = { productId: 'hotel-BJS-1', checkIn: '2027-06-12', checkOut: '2027-06-14',
    offerId: 'room-flexible', travellerIds: [person.id] }
  const first = await request('/orders', 'POST', { ...input, projectId: p1.id })
  const second = await request('/orders', 'POST', { ...input, projectId: p2.id })
  assert.equal(second.status, 201)
  assert.equal(second.conflict, true)
  let alerts = (await request('/alerts')).alerts
  assert.equal(alerts.length, 1)
  const alert = alerts[0]
  assert.equal(alert.severity, 'hard')
  assert.equal(alert.orderId, second.order.id)
  assert.equal(alert.otherOrderId, first.order.id)
  assert.equal(alert.projectId, p2.id)
  assert.equal((await request(`/projects/${p2.id}`)).events[0].id, alert.id)
  assert.equal((await request('/projects')).projects.find(project => project.id === p2.id).pendingEvents, 1)
  await request(`/alerts/${alert.id}/read`, 'POST')
  assert.ok((await request(`/projects/${p2.id}`)).events[0].readAt)
  assert.equal((await request('/projects')).projects.find(project => project.id === p2.id).pendingEvents, 0)
  assert.equal((await request(`/orders/${first.order.id}/project`, 'PATCH', { projectId: p2.id })).status, 200)
  alerts = (await request('/alerts')).alerts
  assert.equal(alerts.length, 1)
  assert.equal(alerts[0].orderId, second.order.id)
  assert.match(alerts[0].details, /关联北京行程/)
  assert.equal((await request(`/orders/${second.order.id}/project`, 'PATCH', { projectId: p1.id })).status, 200)
  alerts = (await request('/alerts')).alerts
  assert.equal(alerts.length, 1)
  assert.equal(alerts[0].id, alert.id)
  assert.equal(alerts[0].projectId, p1.id)
  assert.ok(alerts[0].readAt)
  assert.equal((await request(`/orders/${first.order.id}/cancel`, 'POST')).status, 200)
  alerts = (await request('/alerts')).alerts
  assert.equal(alerts[0].status, 'resolved')
  assert.ok(alerts[0].resolvedAt)
})

test('soft project mismatch appears in assistant notifications but does not raise the project hard-conflict badge', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'trip-soft-alert-'))
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
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method, headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return response.json()
  }
  const person = (await request('/travellers')).travellers[0]
  const project = await request('/projects', 'POST', { destination: '北京', days: 3, tripStartDate: '2027-06-12' })
  await request('/orders', 'POST', {
    productId: 'hotel-HGH-1', checkIn: '2027-06-12', checkOut: '2027-06-13',
    travellerIds: [person.id], projectId: project.id,
  })
  const alert = (await request('/alerts')).alerts[0]
  assert.equal(alert.severity, 'soft')
  const summary = (await request('/projects')).projects.find(item => item.id === project.id)
  assert.equal(summary.pendingEvents, 0)
  assert.equal(summary.pendingAssistantEvents, 1)
  assert.equal((await request(`/projects/${project.id}`)).events[0].id, alert.id)
})

test('unassociated order conflicts are still saved and exposed without inventing a project', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'trip-unassigned-alerts-'))
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
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method, headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: response.status, ...(await response.json()) }
  }
  const person = (await request('/travellers')).travellers[0]
  const input = { productId: 'hotel-BJS-1', checkIn: '2027-06-12', checkOut: '2027-06-14', travellerIds: [person.id] }
  await request('/orders', 'POST', input)
  const second = await request('/orders', 'POST', input)
  assert.equal(second.status, 201)
  const alert = (await request('/alerts')).alerts[0]
  assert.equal(alert.orderId, second.order.id)
  assert.equal(alert.projectId, null)
  assert.equal(alert.severity, 'hard')
})
