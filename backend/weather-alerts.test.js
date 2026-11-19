import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { DatabaseSync } from 'node:sqlite'
import { createWeatherChecker } from './weather-alerts.js'

test('weather alerts persist, synchronize reads, recover safely and never affect hard conflicts', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'weather-alerts-'))
  const listener = createServer().listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const port = listener.address().port
  await new Promise(resolve => listener.close(resolve))
  const child = spawn(process.execPath, ['--experimental-sqlite', 'backend/server.js'], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', TRIP_DB_PATH: join(dir, 'test.sqlite'), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let db
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit') }
    db?.close()
    rmSync(dir, { recursive: true, force: true })
  })
  await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw Error('server failed') })])
  db = new DatabaseSync(join(dir, 'test.sqlite'))
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { statusCode: response.status, ...(await response.json()) }
  }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const project = await request('/projects', 'POST', { destination: '杭州', days: 2, tripStartDate: today })
  let code = 65
  let requests = 0
  let now = new Date()
  let fail = false
  const fetcher = async url => {
    requests++
    if (fail) throw Error('network failure')
    if (url.hostname.startsWith('geocoding')) return Response.json({ results: [
      { name: '杭州', latitude: 30, longitude: 120, timezone: 'Asia/Shanghai' },
    ] })
    const start = url.searchParams.get('start_date')
    const end = url.searchParams.get('end_date')
    const dates = []
    for (let d = new Date(`${start}T00:00:00Z`); d.toISOString().slice(0, 10) <= end; d.setUTCDate(d.getUTCDate() + 1)) dates.push(d.toISOString().slice(0, 10))
    return Response.json({ timezone: 'Asia/Shanghai', daily_units: { temperature_2m_max: '°C', temperature_2m_min: '°C', precipitation_probability_max: '%' },
      daily: { time: dates, weather_code: dates.map((_, i) => i ? 0 : code), temperature_2m_max: dates.map(() => 20),
        temperature_2m_min: dates.map(() => 10), precipitation_probability_max: dates.map(() => 50) } })
  }
  const check = createWeatherChecker(db, { fetcher, clock: () => now })
  const next = async () => { now = new Date(now.getTime() + 31 * 60000); await check() }
  await check()
  let alerts = (await request('/alerts')).alerts
  assert.equal(alerts.length, 1)
  const alert = alerts[0]
  assert.deepEqual([alert.code, alert.orderId, alert.projectId, alert.severity, alert.forecastDate],
    ['weather', null, project.id, 'soft', today])
  assert.deepEqual((await request(`/projects/${project.id}`)).events[0], alert)
  let summary = (await request('/projects')).projects.find(item => item.id === project.id)
  assert.equal(summary.pendingEvents, 0)
  assert.equal(summary.pendingAssistantEvents, 1)
  const count = requests
  await check()
  assert.equal(requests, count)
  await next()
  assert.equal((await request('/alerts')).alerts.length, 1)
  await request(`/alerts/${alert.id}/read`, 'POST')
  assert.ok((await request(`/projects/${project.id}`)).events[0].readAt)
  assert.equal((await request('/projects')).projects.find(item => item.id === project.id).pendingAssistantEvents, 0)
  await next()
  assert.ok((await request('/alerts')).alerts[0].readAt)
  fail = true
  await next()
  assert.equal((await request('/alerts')).alerts[0].status, 'pending')
  fail = false
  code = 0
  await next()
  alerts = (await request('/alerts')).alerts
  assert.equal(alerts[0].status, 'resolved')
  assert.ok(alerts[0].resolvedAt)
  code = 95
  await next()
  alerts = (await request('/alerts')).alerts
  assert.equal(alerts.length, 1)
  assert.equal(alerts[0].id, alert.id)
  assert.equal(alerts[0].status, 'pending')
  assert.equal(alerts[0].readAt, null)
  await request(`/projects/${project.id}/events/read`, 'POST')
  assert.ok((await request('/alerts')).alerts[0].readAt)
  summary = (await request('/projects')).projects.find(item => item.id === project.id)
  assert.equal(summary.pendingEvents, 0)
  assert.equal(summary.pendingAssistantEvents, 0)
  assert.equal((await request('/orders')).orders.length, 0)
  assert.equal((await request(`/projects/${project.id}`)).itinerary, null)
  await request(`/projects/${project.id}`, 'DELETE')
  assert.equal((await request('/alerts')).alerts.length, 0)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM weather_checks').get().n, 0)
})

test('deleting a project during a forecast request cannot recreate its alert', async () => {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE travel_projects (id TEXT PRIMARY KEY, destination TEXT, days INTEGER, trip_start_date TEXT, status TEXT);
    INSERT INTO travel_projects VALUES ('p', '杭州', 1, '2026-11-19', 'planning')`)
  const { initWeatherAlerts, listWeatherAlerts } = await import('./weather-alerts.js')
  initWeatherAlerts(db)
  let release
  const wait = new Promise(resolve => { release = resolve })
  const check = createWeatherChecker(db, { clock: () => new Date('2026-11-19T04:00:00Z'), fetcher: async url => {
    if (url.hostname.startsWith('geocoding')) {
      await wait
      return Response.json({ results: [{ name: '杭州', latitude: 30, longitude: 120, timezone: 'Asia/Shanghai' }] })
    }
    return Response.json({ timezone: 'Asia/Shanghai', daily_units: { temperature_2m_max: '°C', temperature_2m_min: '°C', precipitation_probability_max: '%' },
      daily: { time: ['2026-11-19'], weather_code: [75], temperature_2m_max: [1], temperature_2m_min: [0], precipitation_probability_max: [80] } })
  } })
  const pending = check()
  db.prepare('DELETE FROM travel_projects WHERE id = ?').run('p')
  db.prepare('DELETE FROM weather_checks WHERE project_id = ?').run('p')
  release()
  await pending
  assert.deepEqual(listWeatherAlerts(db), [])
  db.close()
})

test('ordinary rain forecasts create a soft weather alert for the affected trip day', async () => {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE travel_projects (id TEXT PRIMARY KEY, destination TEXT, days INTEGER, trip_start_date TEXT, status TEXT);
    INSERT INTO travel_projects VALUES ('p', '杭州', 5, '2026-11-22', 'planning')`)
  const { initWeatherAlerts, listWeatherAlerts } = await import('./weather-alerts.js')
  initWeatherAlerts(db)
  const check = createWeatherChecker(db, {
    clock: () => new Date('2026-11-19T04:00:00Z'),
    fetcher: async url => {
      if (url.hostname.startsWith('geocoding')) {
        return Response.json({ results: [{ name: '杭州', latitude: 30, longitude: 120, timezone: 'Asia/Shanghai' }] })
      }
      const dates = []
      const start = url.searchParams.get('start_date')
      const end = url.searchParams.get('end_date')
      for (let date = new Date(`${start}T00:00:00Z`); date.toISOString().slice(0, 10) <= end; date.setUTCDate(date.getUTCDate() + 1)) {
        dates.push(date.toISOString().slice(0, 10))
      }
      return Response.json({
        timezone: 'Asia/Shanghai',
        daily_units: { temperature_2m_max: '°C', temperature_2m_min: '°C', precipitation_probability_max: '%' },
        daily: {
          time: dates,
          weather_code: dates.map(date => date === '2026-11-23' ? 61 : 0),
          temperature_2m_max: dates.map(() => 18),
          temperature_2m_min: dates.map(() => 10),
          precipitation_probability_max: dates.map(date => date === '2026-11-23' ? 80 : 5),
        },
      })
    },
  })
  await check()
  const alert = listWeatherAlerts(db)[0]
  assert.equal(alert.forecastDate, '2026-11-23')
  assert.match(alert.details, /小雨/)
  assert.match(alert.details, /室内备选/)
  db.close()
})
