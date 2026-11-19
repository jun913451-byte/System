import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

test('demo trip can move to Nov 25 and buy the matching five-day Hangzhou package', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'trip-demo-case-'))
  const promptPath = join(dir, 'prompts.json')
  const mockPath = join(dir, 'mock.mjs')
  writeFileSync(mockPath, `import { appendFileSync } from 'node:fs';
    globalThis.fetch = async (url, options = {}) => {
      const target = new URL(url);
      if (target.hostname === 'geocoding-api.open-meteo.com') {
        return Response.json({results:[{name:'杭州',latitude:30,longitude:120,timezone:'Asia/Shanghai',feature_code:'PPLA'}]});
      }
      if (target.hostname === 'api.open-meteo.com') {
        const start=target.searchParams.get('start_date'), end=target.searchParams.get('end_date'), dates=[];
        for(let d=new Date(start+'T00:00:00Z');d.toISOString().slice(0,10)<=end;d.setUTCDate(d.getUTCDate()+1)) dates.push(d.toISOString().slice(0,10));
        return Response.json({timezone:'Asia/Shanghai',daily_units:{temperature_2m_max:'°C',temperature_2m_min:'°C',precipitation_probability_max:'%'},daily:{time:dates,weather_code:dates.map(d=>d==='2026-11-23'?61:0),temperature_2m_max:dates.map(()=>18),temperature_2m_min:dates.map(()=>10),precipitation_probability_max:dates.map(d=>d==='2026-11-23'?80:5)}});
      }
      if (target.hostname === 'api.deepseek.com') {
        appendFileSync(process.env.CASE_PROMPTS, options.body+'\\n');
        const request=JSON.parse(options.body).messages[1].content;
        const start=request.includes('出行开始日期：2026-11-25')?'2026-11-25':'2026-11-22';
        const count=Number(request.match(/必须恰好输出 (\\d+) 天/)?.[1]||5);
        const days=Array.from({length:count},(_,i)=>{const d=new Date(start+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+i);return {day:i+1,title:'安排',items:[{type:'attraction',title:'室内文化参观'}]}});
        return Response.json({choices:[{message:{content:JSON.stringify({summary:'杭州五日游',assistantMessage:'已更新安排',days})}}]});
      }
      throw Error('Unexpected external request '+target.href);
    };`)
  const listener = createServer().listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const port = listener.address().port
  await new Promise(resolve => listener.close(resolve))
  const child = spawn(process.execPath, ['--experimental-sqlite', '--import', pathToFileURL(mockPath).href, 'backend/server.js'], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', TRIP_DB_PATH: join(dir, 'test.sqlite'),
      NODE_ENV: 'test', DEEPSEEK_API_KEY: 'test', CASE_PROMPTS: promptPath }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit') }
    rmSync(dir, { recursive: true, force: true })
  })
  await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw Error('server failed') })])
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method, headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: response.status, ...(await response.json()) }
  }

  const project = await request('/projects', 'POST', {
    destination: '杭州', departureCity: '沈阳', days: 5, tripStartDate: '2026-11-22',
  })
  const weather = await request(`/projects/${project.id}/weather`)
  assert.equal(weather.available, true)
  assert.equal(weather.days.find(day => day.date === '2026-11-23').description, '小雨')
  const initial = await request(`/projects/${project.id}/plan`, 'POST', {})
  assert.deepEqual(initial.packages, [])

  const db = new DatabaseSync(join(dir, 'test.sqlite'))
  db.prepare("INSERT INTO weather_alerts (id, project_id, forecast_date, title, details, read_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run('case-weather', project.id, '2026-11-24', '天气提醒', '小毛毛雨', '2026-11-19 12:00:00')
  db.close()
  const changed = await request(`/projects/${project.id}/assist`, 'POST', { request: '把行程改到 11 月 25 日。' })
  assert.equal(changed.tripStartDate, '2026-11-25')
  const expiredWeather = (await request('/alerts')).alerts.find(alert => alert.id === 'case-weather')
  assert.equal(expiredWeather.status, 'resolved')
  assert.equal(expiredWeather.readAt, '2026-11-19 12:00:00')
  assert.deepEqual(changed.itinerary.days.map(day => day.date), [
    '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29',
  ])
  assert.equal(changed.packages[0].id, 'hangzhou-autumn-5d-2026')
  const prompts = readFileSync(promptPath, 'utf8').trim().split('\n').map(JSON.parse)
  assert.match(prompts[1].messages[1].content, /hangzhou-autumn-5d-2026/)
  assert.match(prompts[1].messages[1].content, /出行开始日期：2026-11-25/)

  const traveller = (await request('/travellers')).travellers[0]
  const checkout = await request('/packages/hangzhou-autumn-5d-2026/checkout', 'POST', {
    travellerIds: [traveller.id], projectId: project.id,
  })
  assert.equal(checkout.status, 201)
  assert.equal(checkout.orders.length, 3)
  assert.ok(checkout.orders.some(order => order.type === 'hotel' && order.checkIn === '2026-11-25' && order.checkOut === '2026-11-29'))
  assert.ok(checkout.orders.some(order => order.type === 'flight' && order.travelDate === '2026-11-25' && order.direction === 'out'))
  assert.ok(checkout.orders.some(order => order.type === 'flight' && order.travelDate === '2026-11-29' && order.direction === 'in'))

  const beijingHotel = await request('/orders', 'POST', {
    productId: 'hotel-stay-2026-11-26-2026-11-27--hotel-BJS-1', checkIn: '2026-11-26', checkOut: '2026-11-27',
    travellerIds: [traveller.id], projectId: project.id,
  })
  assert.equal(beijingHotel.conflict, true)
  const softAlerts = (await request('/alerts')).alerts.filter(alert => alert.orderId === beijingHotel.order.id)
  assert.ok(softAlerts.length > 0)
  assert.ok(softAlerts.every(alert => alert.severity === 'soft'))
  const explained = await request(`/projects/${project.id}/assist`, 'POST', { request: '这间酒店是给别人买的' })
  assert.match(explained.runs[0].responseSummary, /订单和出行人信息保持不变/)
  assert.ok((await request('/alerts')).alerts.filter(alert => alert.orderId === beijingHotel.order.id).every(alert => alert.status === 'resolved'))

  const extended = await request(`/projects/${project.id}/assist`, 'POST', { request: '我想要晚一天回去' })
  assert.equal(extended.days, 6)
  assert.equal(extended.itinerary.days.length, 6)
  const updatedOrders = (await request('/orders')).orders
  assert.equal(updatedOrders.find(order => order.direction === 'in' && order.projectId === project.id).travelDate, '2026-11-30')
  assert.equal(updatedOrders.find(order => order.type === 'hotel' && order.destination === '杭州' && order.projectId === project.id).checkOut, '2026-11-30')
  assert.equal(updatedOrders.find(order => order.id === beijingHotel.order.id).checkOut, '2026-11-27')
})
