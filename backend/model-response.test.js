import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

for (const scenario of ['recover', 'truncated', 'invalid-shape', 'adaptive', 'exhausted']) {
  test(`model response ${scenario}: retry or fail without corrupting the trip`, async t => {
    const dir = mkdtempSync(join(tmpdir(), 'trip-model-response-'))
    const mockPath = join(dir, 'mock.mjs')
    writeFileSync(mockPath, `
      let count = 0;
      globalThis.fetch = async (url, options) => {
        if (new URL(url).hostname !== 'api.deepseek.com') return new Response('', {status: 503});
        count++;
        if (process.env.MODEL_TEST === 'adaptive' && count >= 3) {
          const request = JSON.parse(options.body);
          if (request.temperature > 0.3 || !request.messages.at(-1).content.includes('JSON 语法')) {
            return Response.json({choices:[{message:{content:'not JSON'},finish_reason:'stop'}]});
          }
        }
        if (['truncated', 'invalid-shape'].includes(process.env.MODEL_TEST) && count >= 3) {
          const request = JSON.parse(options.body);
          const expected = process.env.MODEL_TEST === 'truncated' ? '截断' : '缺少完整行程';
          if (request.max_tokens !== 8000 || !request.messages.at(-1).content.includes(expected)) {
            return Response.json({choices:[{message:{content:'not JSON'},finish_reason:'stop'}]});
          }
        }
        const valid = JSON.stringify({summary:'更新完成',assistantMessage:'更新完成',days:[
          {title:'第一天',items:[{title:'活动'}]},{title:'第二天',items:[{title:'活动'}]}]});
        const faulty = count > 1 && (process.env.MODEL_TEST === 'exhausted' || count === 2);
        const content = !faulty || process.env.MODEL_TEST === 'truncated' ? valid
          : process.env.MODEL_TEST === 'invalid-shape' ? '{"days":[null,null]}'
          : '{"summary":"PRIVATE_MARKER" "days":[';
        return Response.json({choices:[{message:{content},finish_reason:faulty && process.env.MODEL_TEST === 'truncated'?'length':'stop'}]});
      };
    `)
    const listener = createServer().listen(0, '127.0.0.1')
    await once(listener, 'listening')
    const port = listener.address().port
    await new Promise(resolve => listener.close(resolve))
    const child = spawn(process.execPath, ['--experimental-sqlite', '--import', pathToFileURL(mockPath).href, 'backend/server.js'], {
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', TRIP_DB_PATH: join(dir, 'test.sqlite'),
        NODE_ENV: 'test', DEEPSEEK_API_KEY: 'test', MODEL_TEST: scenario },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let logs = ''
    child.stderr.on('data', chunk => { logs += chunk })
    t.after(async () => {
      if (child.exitCode === null) { child.kill(); await once(child, 'exit') }
      assert.doesNotMatch(logs, /PRIVATE_MARKER/)
      rmSync(dir, { recursive: true, force: true })
    })
    await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw Error('server failed') })])
    const request = async (path, body) => {
      const response = await fetch(`http://127.0.0.1:${port}/api${path}`, body === undefined ? {} : {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      return { status: response.status, body: await response.json() }
    }
    const project = (await request('/projects', { destination: '杭州', days: 2, tripStartDate: '2026-11-22' })).body
    const initial = await request(`/projects/${project.id}/plan`, {})
    assert.equal(initial.status, 200)
    const db = new DatabaseSync(join(dir, 'test.sqlite'))
    db.prepare("INSERT INTO weather_alerts (id, project_id, forecast_date, title, details) VALUES (?, ?, ?, ?, ?)")
      .run('rain', project.id, '2026-11-23', '天气提醒', '小雨')
    db.close()
    const result = await request(`/projects/${project.id}/assist`, { request: '把行程改到 11 月 25 日。' })
    if (scenario !== 'exhausted') {
      assert.equal(result.status, 200)
      assert.equal(result.body.tripStartDate, '2026-11-25')
      assert.equal(result.body.runs[0].status, 'completed')
      assert.equal((await request('/alerts')).body.alerts.find(alert => alert.id === 'rain').status, 'resolved')
    } else {
      assert.equal(result.status, 502)
      assert.match(result.body.error, /生成|行程/)
      assert.doesNotMatch(JSON.stringify(result.body), /PRIVATE_MARKER|Expected|position/)
      const saved = (await request(`/projects/${project.id}`)).body
      assert.equal(saved.tripStartDate, '2026-11-22')
      assert.deepEqual(saved.itinerary, initial.body.itinerary)
      assert.equal(saved.runs[0].status, 'failed')
      assert.equal((await request('/alerts')).body.alerts.find(alert => alert.id === 'rain').status, 'pending')
    }
  })
}
