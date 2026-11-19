import test from 'node:test'
import assert from 'node:assert/strict'
import { findProduct, listProducts, withOffers } from './product-catalog.js'

const catalog = [
  { id: 'flight-SHE-HGH-out-1', type: 'flight', origin: '沈阳', arrivalCity: '杭州', destination: '杭州', travelDate: '2027-06-12', price: 520 },
  { id: 'flight-HGH-SHE-out-1', type: 'flight', origin: '杭州', arrivalCity: '沈阳', destination: '沈阳', travelDate: '2027-06-14', price: 610 },
  { id: 'train-SHE-HGH-out-1', type: 'train', origin: '沈阳北', arrivalCity: '杭州东', destination: '杭州', travelDate: '2027-06-12', price: 780 },
  { id: 'hotel-HGH-1', type: 'hotel', destination: '杭州', price: 400 },
]

test('ticket searches filter by route and apply the requested date', () => {
  const query = new URLSearchParams({
    type: 'flight', origin: '沈阳', destination: '杭州', travelDate: '2028-03-05',
  })
  const products = listProducts(catalog, query)
  assert.equal(products.length, 1)
  assert.equal(products[0].travelDate, '2028-03-05')
  assert.equal(products[0].dateLabel, '2028-03-05 周日')
})

test('station suffixes normalize while direction remains route-specific', () => {
  const query = new URLSearchParams({
    type: 'train', origin: '沈阳北站', destination: '杭州东站', travelDate: '2027-09-08',
  })
  const products = listProducts(catalog, query)
  assert.equal(products.length, 1)
  assert.equal(products[0].origin, '沈阳北')
  assert.equal(products[0].arrivalCity, '杭州东')
})

test('dated product IDs resolve to the same deterministic product for booking', () => {
  const query = new URLSearchParams({
    type: 'flight', origin: '沈阳', destination: '杭州', travelDate: '2028-03-05',
  })
  const [listed] = listProducts(catalog, query)
  const resolved = findProduct(catalog, listed.id)
  assert.deepEqual(resolved, listed)
  assert.equal(findProduct(catalog, 'flight-on-2028-99-99--flight-SHE-HGH-out-1'), null)
})

test('ticket searches reject invalid dates and honor limits without changing product resolution', () => {
  const flights = Array.from({ length: 150 }, (_, index) => ({
    ...catalog[0], id: `flight-${index}`,
  }))
  const query = new URLSearchParams({
    type: 'flight', origin: '沈阳', destination: '杭州', travelDate: '2028-02-30', limit: '1000',
  })
  assert.deepEqual(listProducts(flights, query), [])
  query.set('travelDate', '2028-02-29')
  const products = listProducts(flights, query)
  assert.equal(products.length, 100)
  assert.deepEqual(findProduct(flights, products[0].id), products[0])
  query.set('limit', '2')
  assert.equal(listProducts(flights, query).length, 2)
  assert.deepEqual(findProduct(flights, 'flight-0'), flights[0])
})

test('general catalogue requests retain their existing filtering and offer behavior', () => {
  const products = withOffers(listProducts(catalog, new URLSearchParams('type=hotel')), {
    hotel: [{ id: 'standard' }],
  })
  assert.equal(products.length, 1)
  assert.deepEqual(products[0].offers, [{ id: 'standard' }])
})

test('catalogue limits are opt-in and capped', () => {
  const products = Array.from({ length: 150 }, (_, index) => ({
    id: `hotel-${index}`,
    type: 'hotel',
    destination: '杭州',
  }))
  assert.equal(listProducts(products, new URLSearchParams('type=hotel')).length, 150)
  assert.equal(listProducts(products, new URLSearchParams('type=hotel&limit=2')).length, 2)
  assert.equal(listProducts(products, new URLSearchParams('limit=1000')).length, 100)
})

test('low-fare flight recommendations sample from the cheapest catalogue slice', () => {
  const flights = Array.from({ length: 100 }, (_, index) => ({
    id: `flight-${index}`,
    type: 'flight',
    destination: '杭州',
    price: index + 100,
  }))
  const products = listProducts(flights, new URLSearchParams('type=flight&recommend=low-fare&limit=8'))
  assert.equal(products.length, 8)
  assert.ok(products.every(product => product.price <= 131))
})

test('hotel searches can filter by destination before applying a limit', () => {
  const products = listProducts(catalog, new URLSearchParams('type=hotel&destination=杭州'))
  assert.equal(products.length, 1)
  assert.equal(products[0].destination, '杭州')
})

test('dated hotel searches resolve the same stay dates in details and booking', () => {
  const query = new URLSearchParams({
    type: 'hotel', destination: '杭州', checkIn: '2026-11-26', checkOut: '2026-11-27',
  })
  const [listed] = listProducts(catalog, query)
  assert.equal(listed.id, 'hotel-stay-2026-11-26-2026-11-27--hotel-HGH-1')
  assert.deepEqual(findProduct(catalog, listed.id), listed)
  assert.deepEqual(listProducts(catalog, new URLSearchParams(
    'type=hotel&destination=%E6%9D%AD%E5%B7%9E&checkIn=2026-11-26&checkOut=2026-11-26',
  )), [])
})
