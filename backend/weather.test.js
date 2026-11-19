import test from 'node:test'
import assert from 'node:assert/strict'
import { getTripWeather } from './weather.js'

const now = new Date('2026-11-18T04:00:00Z')
const trip = { destination: '杭州', tripStartDate: '2026-11-19', days: 2 }
const location = { results: [{ name: '杭州', latitude: 30.2, longitude: 120.1, timezone: 'Asia/Shanghai', admin1: '浙江', country: '中国' }] }
const forecast = { timezone: 'Asia/Shanghai', daily_units: { temperature_2m_max: '°C', temperature_2m_min: '°C', precipitation_probability_max: '%' }, daily: {
  time: ['2026-11-19', '2026-11-20'], weather_code: [61, 0], temperature_2m_max: [15, 17], temperature_2m_min: [8, 9], precipitation_probability_max: [80, 5],
} }
const response = value => ({ ok: true, json: async () => value })
const fetcher = async url => response(url.hostname.startsWith('geocoding') ? location : forecast)

test('forecast uses exact trip dates and verified daily data', async () => {
  const result = await getTripWeather(trip, { fetcher, now })
  assert.equal(result.available, true)
  assert.equal(result.days[0].description, '小雨')
  assert.equal(result.days[1].date, '2026-11-20')
  assert.equal(result.source, 'Open-Meteo')
})

test('distant, missing, past and invalid trips never request weather', async () => {
  for (const change of [{ tripStartDate: '' }, { tripStartDate: '2026-11-15' }, { tripStartDate: '2026-11-26' }, { days: 15 }]) {
    const result = await getTripWeather({ ...trip, ...change }, { now, fetcher: () => { throw Error('unexpected request') } })
    assert.deepEqual(result, { available: false, summary: '出行时请注意天气哦', days: [] })
  }
})

test('long trips return only covered forecast days and resolve a unique capital', async () => {
  const mock = async url => {
    if (url.hostname.startsWith('geocoding')) return response({ results: [
      { ...location.results[0], feature_code: 'PPLA' },
      { ...location.results[0], feature_code: 'PPL', admin1: '四川' },
    ] })
    assert.equal(url.searchParams.get('start_date'), '2026-11-19')
    assert.equal(url.searchParams.get('end_date'), '2026-11-24')
    return response({ ...forecast, daily: {
      time: Array.from({ length: 6 }, (_, i) => `2026-11-${19 + i}`),
      weather_code: Array(6).fill(0), temperature_2m_max: Array(6).fill(15),
      temperature_2m_min: Array(6).fill(8), precipitation_probability_max: Array(6).fill(20),
    } })
  }
  const result = await getTripWeather({ ...trip, days: 14 }, { fetcher: mock, now })
  assert.equal(result.available, true)
  assert.equal(result.partial, true)
  assert.equal(result.coverageStart, '2026-11-19')
  assert.equal(result.coverageEnd, '2026-11-24')
  assert.equal(result.days.length, 6)
})

test('ambiguous location, network errors, invalid and incomplete data degrade safely', async () => {
  for (const mock of [
    async () => response({ results: [location.results[0], location.results[0]] }),
    async () => { throw Error('timeout') },
    async url => response(url.hostname.startsWith('geocoding') ? location : { ...forecast, daily: { ...forecast.daily, weather_code: [61, 999] } }),
    async url => response(url.hostname.startsWith('geocoding') ? location : { ...forecast, daily: { ...forecast.daily, time: ['2026-11-19'] } }),
  ]) assert.equal((await getTripWeather(trip, { fetcher: mock, now })).available, false)
})

test('uses destination local date at the forecast boundary', async () => {
  const lateUtc = new Date('2026-11-18T16:30:00Z')
  assert.equal((await getTripWeather({ ...trip, tripStartDate: '2026-11-18' }, { fetcher, now: lateUtc })).available, false)
})
