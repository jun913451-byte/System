import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { DatabaseSync } from 'node:sqlite'

test('order actions validate and keep bookings and itineraries consistent', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'trip-orders-'))
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
    const res = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: res.status, ...(await res.json()) }
  }
  const travellerIds = (await request('/travellers')).travellers.map(person => person.id)
  const createProject = () => request('/projects', 'POST', { destination: '北京', days: 7 })
  const p1 = await createProject()
  const p2 = await createProject()
  assert.equal((await request('/orders', 'POST', {
    productId: 'hotel-BJS-1', checkIn: '2027-06-12', checkOut: '2027-06-14', guests: 3,
  })).status, 400)
  const created = await request('/orders', 'POST', {
    productId: 'hotel-BJS-1', projectId: p1.id, checkIn: '2027-06-12', checkOut: '2027-06-14', offerId: 'room-flexible', rooms: 2, guests: 3,
    travellerIds: travellerIds.slice(0, 3),
  })
  assert.equal(created.status, 201)
  const id = created.order.id
  assert.deepEqual(created.order.travellers.map(person => person.id), travellerIds.slice(0, 3))
  const action = (name, body, method = 'POST') => request(`/orders/${id}/${name}`, method, body)
  const items = p => p.itinerary.days.flatMap(day => day.items).filter(item => item.bookingId === id)
  assert.equal(items(await request(`/projects/${p1.id}`)).length, 2)
  assert.equal((await action('project', {} , 'PATCH')).status, 400)
  assert.equal((await action('project', { projectId: 'missing' }, 'PATCH')).status, 404)
  assert.equal((await action('project', { projectId: p2.id }, 'PATCH')).status, 200)
  assert.equal(items(await request(`/projects/${p1.id}`)).length, 0)
  assert.equal(items(await request(`/projects/${p2.id}`)).length, 2)
  assert.equal((await action('project', { projectId: null }, 'PATCH')).order.projectId, null)
  assert.equal(items(await request(`/projects/${p2.id}`)).length, 0)
  assert.equal((await action('project', { projectId: p2.id }, 'PATCH')).status, 200)
  const changed = await action('change', { checkIn: '2027-06-13', checkOut: '2027-06-16', rooms: 1 })
  assert.equal(changed.status, 200)
  assert.equal(changed.order.rooms, 2)
  assert.equal(changed.order.orderCode, created.order.orderCode)
  assert.equal(items(await request(`/projects/${p2.id}`)).length, 3)
  assert.equal((await action('change', { checkIn: '2027-06-20', checkOut: '2027-06-21' })).status, 400)
  assert.equal((await action('change', { checkIn: '2027-06-18', checkOut: '2027-06-20' })).status, 200)
  assert.equal((await action('cancel')).order.status, 'cancelled')
  const project = await request(`/projects/${p2.id}`)
  assert.equal(items(project).length, 0)
  assert.ok(!project.bookings.some(booking => booking.id === id))
  assert.equal((await action('cancel')).status, 409)
  assert.equal((await action('project', { projectId: null }, 'PATCH')).status, 409)
  const fixed = await request('/orders', 'POST', { productId: 'hotel-BJS-1', checkIn: '2027-06-12', checkOut: '2027-06-13', travellerIds: [travellerIds[0]] })
  assert.equal((await request(`/orders/${fixed.order.id}/cancel`, 'POST')).status, 409)
  assert.equal((await request(`/orders/${fixed.order.id}/change`, 'POST', { checkIn: '2027-06-13', checkOut: '2027-06-14' })).status, 409)
  const flight = await request('/orders', 'POST', { productId: 'flight-HGH-1-out-1', travelDate: '2027-06-12', passengers: 2, travellerIds: travellerIds.slice(0, 2) })
  const flightChange = await request(`/orders/${flight.order.id}/change`, 'POST', { travelDate: '2027-06-13', passengers: 1 })
  assert.equal(flightChange.status, 200)
  assert.equal(flightChange.order.travelDate, '2027-06-13')
  assert.equal(flightChange.order.passengers, 2)
  assert.deepEqual(flightChange.order.travellers.map(person => person.id), travellerIds.slice(0, 2))
  assert.equal(flightChange.order.orderCode, flight.order.orderCode)
  assert.equal((await request(`/orders/${flight.order.id}/change`, 'POST', { travelDate: '2027-02-30' })).status, 400)
  const db = new DatabaseSync(dbPath)
  const past = { ...flight.order, travelDate: '2020-01-01' }
  db.prepare('UPDATE customer_bookings SET snapshot_json = ? WHERE id = ?').run(JSON.stringify(past), flight.order.id)
  db.close()
  assert.equal((await request(`/orders/${flight.order.id}/cancel`, 'POST')).status, 409)
})
