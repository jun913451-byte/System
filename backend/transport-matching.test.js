import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { matchTransport } from './transport-matching.js'

const date = '2027-06-12'
const localTrain = { type: 'train', origin: '成都', arrivalCity: '都江堰', travelDate: date }
const localOtherDate = { ...localTrain, travelDate: '2027-06-13' }
const reverseTrain = { ...localTrain, origin: '都江堰', arrivalCity: '成都' }
const localFlight = { ...localTrain, type: 'flight' }
const products = [
  { type: 'flight', origin: '北京', arrivalCity: '成都', travelDate: date },
  { type: 'train', origin: '北京', arrivalCity: '成都', travelDate: date },
  localTrain, localOtherDate, reverseTrain, localFlight,
]
const item = { type: 'transport', title: '成都乘城际列车前往都江堰' }
const context = { destination: '成都', departureCity: '北京' }

test('Chengdu local train never matches the Beijing to Chengdu catalogue', () => {
  const catalog = JSON.parse(readFileSync(new URL('./demo-products.json', import.meta.url)))
  const all = Array.isArray(catalog) ? catalog : catalog.products
  for (const place of ['都江堰', '青城山']) {
    assert.deepEqual(matchTransport(all, { ...item, title: `成都乘城际列车前往${place}` }, { ...context, date }), [])
  }
})

test('local options require matching mode, direction and exact date', () => {
  assert.deepEqual(matchTransport(products, item, { ...context, date }), [localTrain])
  assert.deepEqual(matchTransport(products, item, { ...context, date: '2027-06-14' }), [])
  assert.deepEqual(matchTransport(products, item, context), [])
  assert.deepEqual(matchTransport(products, { ...item, title: '都江堰乘城际列车返回成都' }, { ...context, date }), [reverseTrain])
  assert.deepEqual(matchTransport(products, { ...item, title: '都江堰 → 成都 城际列车' }, { ...context, date }), [reverseTrain])
})

test('explicit ticket request permits undated route matches, but not wrong dates', () => {
  assert.deepEqual(matchTransport(products, item, { ...context, purchaseRequested: true }), [localTrain, localOtherDate])
  assert.deepEqual(matchTransport(products, item, { ...context, date: '2027-06-14', purchaseRequested: true }), [])
})

test('trip legs use the correct transport mode and do not guess missing routes', () => {
  assert.deepEqual(matchTransport(products, { type: 'transport', travelLeg: 'arrival', title: '乘火车抵达成都' }, { ...context, date }), [products[1]])
  assert.deepEqual(matchTransport(products, { type: 'transport', travelLeg: 'arrival', title: '乘飞机抵达成都' }, { ...context, date }), [products[0]])
  assert.deepEqual(matchTransport(products, { type: 'transport', travelLeg: 'arrival', title: '乘飞机抵达成都' }, { destination: '成都', date }), [])
  assert.deepEqual(matchTransport(products, { ...item, travelLeg: 'arrival' }, { ...context, date }), [localTrain])
  assert.deepEqual(matchTransport(products, { type: 'transport', title: '成都前往都江堰' }, { ...context, date }), [])
  assert.deepEqual(matchTransport(products, { ...item, bookingId: 'booked' }, { ...context, date }), [])
})
