import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { once } from 'node:events'

test('package checkout creates all transport and hotel orders with a server-calculated 20 percent discount', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'trip-package-checkout-'))
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
  const travellers = (await request('/travellers')).travellers.slice(0, 2)
  const result = await request('/packages/hangzhou-city-3d/checkout', 'POST', { travellerIds: travellers.map(person => person.id) })
  assert.equal(result.status, 201)
  assert.equal(result.orders.length, 3)
  assert.deepEqual(result.orders.map(order => order.type).sort(), ['flight', 'flight', 'hotel'])
  assert.equal(result.originalTotal, 2736)
  assert.equal(result.discountedTotal, 2189)
  assert.equal(result.discountAmount, 547)
  assert.equal(result.orders.reduce((sum, order) => sum + order.totalPrice, 0), result.discountedTotal)
  assert.equal(result.orders.reduce((sum, order) => sum + order.packageDiscountAmount, 0), result.discountAmount)
  assert.ok(result.orders.every(order => order.travellers.length === 2 && order.packageDiscountRate === 0.2))
  assert.equal((await request('/orders')).orders.length, 3)
  const rejected = await request('/packages/hangzhou-city-3d/checkout', 'POST', { travellerIds: ['missing'] })
  assert.equal(rejected.status, 404)
  assert.equal((await request('/orders')).orders.length, 3)
})
