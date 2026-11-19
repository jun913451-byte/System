import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { pathToFileURL } from 'node:url'

test('assistant receives only matching packages and no traveller identity data', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'trip-packages-'))
  const promptPath = join(dir, 'prompt.json')
  const mockPath = join(dir, 'mock.mjs')
  writeFileSync(mockPath, `import { writeFileSync } from 'node:fs';
    globalThis.fetch = async (url, options = {}) => {
      if (new URL(url).hostname !== 'api.deepseek.com') throw Error('Unexpected external request');
      writeFileSync(process.env.TEST_PROMPT_PATH, options.body);
      return Response.json({choices:[{message:{content:JSON.stringify({summary:'测试',assistantMessage:'规划完成',days:[1,2,3].map(day=>({day,title:'安排',items:[{type:'attraction',title:'博物馆'}]}))})}}]});
    };`)
  const listener = createServer().listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const port = listener.address().port
  await new Promise(resolve => listener.close(resolve))
  const child = spawn(process.execPath, ['--experimental-sqlite', '--import', pathToFileURL(mockPath).href, 'backend/server.js'], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', TRIP_DB_PATH: join(dir, 'db.sqlite'),
      NODE_ENV: 'test', DEEPSEEK_API_KEY: 'test', TEST_PROMPT_PATH: promptPath }, stdio: ['ignore', 'pipe', 'pipe'],
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
    return { ...(await response.json()), httpStatus: response.status }
  }
  const traveller = (await request('/travellers')).travellers[0]
  const project = await request('/projects', 'POST', {
    destination: '杭州', departureCity: '沈阳', days: 3, tripStartDate: '2027-06-12', requirements: '偏好轻松游览',
  })
  assert.equal(project.departureCity, '沈阳')
  const order = await request('/orders', 'POST', {
    productId: 'flight-HGH-1-out-1', travelDate: '2027-06-12', travellerIds: [traveller.id], projectId: project.id,
  })
  assert.equal(order.httpStatus, 201)
  const planned = await request(`/projects/${project.id}/plan`, 'POST', {})
  assert.equal(planned.httpStatus, 200)
  assert.equal(planned.packages[0].id, 'hangzhou-city-3d')
  let alerts = (await request('/alerts')).alerts
  const replyAlert = alerts.find(alert => alert.code === 'assistant_reply')
  assert.ok(replyAlert)
  assert.equal(replyAlert.severity, 'info')
  assert.equal(replyAlert.orderId, null)
  assert.equal(replyAlert.projectId, project.id)
  assert.equal((await request('/projects')).projects.find(item => item.id === project.id).pendingEvents, 0)
  assert.equal((await request('/projects')).projects.find(item => item.id === project.id).pendingAssistantEvents, 1)
  assert.equal((await request(`/projects/${project.id}`)).events.some(event => event.id === replyAlert.id), true)
  await request(`/alerts/${replyAlert.id}/read`, 'POST')
  alerts = (await request('/alerts')).alerts
  assert.equal(alerts.find(alert => alert.id === replyAlert.id).readAt !== null, true)
  assert.equal((await request('/projects')).projects.find(item => item.id === project.id).pendingAssistantEvents, 0)
  const prompt = JSON.parse(readFileSync(promptPath, 'utf8')).messages[1].content
  assert.match(prompt, /hangzhou-city-3d/)
  assert.match(prompt, /出发地：沈阳/)
  assert.ok(!prompt.includes(traveller.identityNumber))
  assert.ok(!prompt.includes(traveller.name))
  const wrong = await request('/projects', 'POST', {
    destination: '杭州', days: 3, tripStartDate: '2027-06-13', requirements: '从沈阳出发',
  })
  const wrongPlan = await request(`/projects/${wrong.id}/plan`, 'POST', {})
  assert.deepEqual(wrongPlan.packages, [])
  assert.doesNotMatch(JSON.parse(readFileSync(promptPath, 'utf8')).messages[1].content, /hangzhou-city-3d/)
})
