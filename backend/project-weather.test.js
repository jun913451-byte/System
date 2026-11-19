import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { pathToFileURL } from 'node:url'

 test('project date, weather endpoint and planning prompt work together', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'trip-weather-test-'))
  const promptPath = join(dir, 'prompt.json')
  const mockPath = join(dir, 'mock.mjs')
  writeFileSync(mockPath, `import { writeFileSync } from 'node:fs';
    globalThis.fetch = async (url, options = {}) => {
      const u = new URL(url);
      if (u.hostname === 'geocoding-api.open-meteo.com') return Response.json({results:[{name:'杭州',latitude:30,longitude:120,timezone:'Asia/Shanghai',country:'中国'}]});
      if (u.hostname === 'api.open-meteo.com') {
        const start = u.searchParams.get('start_date'), end = u.searchParams.get('end_date');
        const dates = []; for (let d = new Date(start+'T00:00:00Z'); d.toISOString().slice(0,10) <= end; d.setUTCDate(d.getUTCDate()+1)) dates.push(d.toISOString().slice(0,10));
        return Response.json({timezone:'Asia/Shanghai',daily_units:{temperature_2m_max:'°C',temperature_2m_min:'°C',precipitation_probability_max:'%'},daily:{time:dates,weather_code:dates.map(()=>61),temperature_2m_max:dates.map(()=>15),temperature_2m_min:dates.map(()=>8),precipitation_probability_max:dates.map(()=>80)}});
      }
      if (u.hostname === 'api.deepseek.com') {
        writeFileSync(process.env.WEATHER_TEST_PROMPT, options.body);
        return Response.json({choices:[{message:{content:JSON.stringify({summary:'测试',assistantMessage:'注意天气',days:[{title:'第一天',items:[{title:'室内活动',type:'attraction'}]},{title:'第二天',items:[{title:'公园',type:'attraction'}]}]})}}]});
      }
      throw Error('Unexpected external request');
    };`)
  const listener = createServer().listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const port = listener.address().port
  await new Promise(resolve => listener.close(resolve))
  const child = spawn(process.execPath, ['--experimental-sqlite', '--import', pathToFileURL(mockPath).href, 'backend/server.js'], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', TRIP_DB_PATH: join(dir, 'test.sqlite'), NODE_ENV: 'test', DEEPSEEK_API_KEY: 'test', WEATHER_TEST_PROMPT: promptPath }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(async () => { if (child.exitCode === null) { child.kill(); await once(child, 'exit') } rmSync(dir, { recursive: true, force: true }) })
  await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw Error('server failed') })])
  const request = async (path, body) => {
    const r = await fetch(`http://127.0.0.1:${port}/api${path}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { status: r.status, body: await r.json() }
  }
  assert.equal((await request('/projects/missing/weather')).status, 404)
  for (const date of ['2026-02-30', '2026-1-02', 123]) assert.equal((await request('/projects', { destination: '杭州', days: 2, tripStartDate: date })).status, 400)
  const undated = await request('/projects', { destination: '杭州', days: 2 })
  assert.equal(undated.body.tripStartDate, '')
  assert.deepEqual((await request(`/projects/${undated.body.id}/weather`)).body, { available: false, summary: '出行时请注意天气哦', days: [] })
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const created = await request('/projects', { destination: '杭州', days: 2, tripStartDate: today })
  assert.equal(created.status, 201)
  assert.equal((await request(`/projects/${created.body.id}`)).body.tripStartDate, today)
  const weather = await request(`/projects/${created.body.id}/weather`)
  assert.equal(weather.body.available, true)
  assert.equal(weather.body.days[0].description, '小雨')
  const planned = await request(`/projects/${created.body.id}/plan`, {})
  assert.equal(planned.status, 200)
  assert.equal(planned.body.itinerary.days[0].date, today)
  const prompt = JSON.parse(readFileSync(promptPath, 'utf8')).messages[1].content
  assert.match(prompt, new RegExp(today))
  assert.match(prompt, /小雨/)
  assert.match(prompt, /其他日期不得推断天气/)
  assert.match(prompt, /已确认订单（只读事实/)
})
