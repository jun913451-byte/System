import test from 'node:test'
import assert from 'node:assert/strict'
import { requestedTripStartDate } from './trip-date-intent.js'

test('only an explicit whole-trip date request changes the trip start', () => {
  assert.equal(requestedTripStartDate('把整个行程改到25日', '2026-11-22'), '2026-11-25')
  assert.equal(requestedTripStartDate('把行程改到11月25日', '2026-11-22'), '2026-11-25')
  assert.equal(requestedTripStartDate('把行程改到 11 月 25 日。', '2026-11-22'), '2026-11-25')
  assert.equal(requestedTripStartDate('把行程改到 2026 年 12 月 3 日', '2026-11-22'), '2026-12-03')
  assert.equal(requestedTripStartDate('把行程调整到2026-12-03', '2026-11-22'), '2026-12-03')
  assert.equal(requestedTripStartDate('把西湖安排改到25日', '2026-11-22'), '')
  assert.equal(requestedTripStartDate('把行程改到2月30日', '2026-11-22'), '')
})
