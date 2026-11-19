import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { findProduct } from './product-catalog.js'
import { calculatePackagePrice, componentDateLabel, findPackageComponent, matchingPackages, packageLink, productLink, searchValuesFromRoute, tourismPackages } from '../frontend/src/tourism-packages.js'

const catalog = JSON.parse(readFileSync(new URL('./demo-products.json', import.meta.url))).products
const tourPackageDetailSource = readFileSync(new URL('../frontend/src/components/TourPackageDetail.vue', import.meta.url), 'utf8')
const productChannelSource = readFileSync(new URL('../frontend/src/components/ProductChannel.vue', import.meta.url), 'utf8')

test('curated packages reference existing correctly typed catalogue products', () => {
  assert.ok(tourismPackages.length >= 6)
  const types = { '机票': 'flight', '火车票': 'train', '酒店': 'hotel', '攻略·景点': 'sight' }
  for (const item of tourismPackages) {
    assert.ok(item.components.some(component => ['机票', '火车票'].includes(component.channel)))
    assert.ok(item.components.some(component => component.channel === '酒店'))
    assert.ok(item.components.some(component => component.channel === '攻略·景点'))
    for (const component of item.components) {
      const product = findProduct(catalog, component.id)
      assert.equal(product?.type, types[component.channel])
      assert.equal(product.destination, item.destination)
      const url = new URL(productLink(component, packageLink(item.id)), 'http://localhost/')
      const params = new URLSearchParams(url.hash.split('?')[1])
      assert.equal(params.get('id'), component.id)
      assert.equal(params.get('from'), packageLink(item.id))
    }
  }
})

test('package component dates match the existing products and stay inside the trip', () => {
  for (const item of tourismPackages) {
  const tripEnd = new Date(`${item.startDate}T00:00:00Z`)
  tripEnd.setUTCDate(tripEnd.getUTCDate() + item.days - 1)
  for (const component of item.components) {
    const product = findProduct(catalog, component.id)
    assert.ok(product)
    if (component.travelDate) assert.equal(component.travelDate, product.travelDate)
    if (component.travelDate && component.label.startsWith('去程')) assert.equal(product.origin, item.origin)
    if (component.travelDate && component.label.startsWith('返程')) assert.equal(product.arrivalCity, item.origin)
    if (component.checkIn) {
      assert.ok(component.checkIn >= product.checkInStart)
      assert.ok(component.checkOut > component.checkIn)
      assert.ok(new Date(`${component.checkOut}T00:00:00Z`) <= tripEnd)
    }
    if (component.visitDate) {
      assert.ok(component.visitDate >= item.startDate)
      assert.ok(component.visitDate <= tripEnd.toISOString().slice(0, 10))
    }
    assert.equal(componentDateLabel(component).length > 0, true)
  }
  }
})

test('package card price matches one-traveller checkout calculation and includes the 20 percent discount', () => {
  const products = Object.fromEntries(catalog.map(product => [product.id, product]))
  const hangzhou = tourismPackages.find(item => item.id === 'hangzhou-city-3d')
  assert.deepEqual(calculatePackagePrice(hangzhou, products), {
    originalTotal: 1696,
    discountedTotal: 1357,
    discountAmount: 339,
  })
  assert.equal(calculatePackagePrice(hangzhou, products, 2).originalTotal, 2736)
  assert.equal(calculatePackagePrice(hangzhou, products, 3).originalTotal, 4432)
  assert.equal(calculatePackagePrice(hangzhou, {}), null)
})

test('package product lookup returns the exact booking context for the shared product id', () => {
  const result = findPackageComponent('hotel-HGH-1', packageLink('hangzhou-city-3d'))
  assert.equal(result?.item.id, 'hangzhou-city-3d')
  assert.deepEqual(result?.component, {
    label: '住宿',
    id: 'hotel-HGH-1',
    channel: '酒店',
    checkIn: '2027-06-12',
    checkOut: '2027-06-14',
  })
  assert.equal(findPackageComponent('hotel-HGH-1', '#酒店'), null)
  assert.equal(findPackageComponent('hotel-HGH-1', packageLink('other')), null)
  assert.equal(findPackageComponent('hotel-HGH-1'), null)
})

test('search dates are recovered only from the matching result route', () => {
  const route = `#results?${new URLSearchParams({ channel: '酒店', checkin: '2027-06-16', checkout: '2027-06-18' })}`
  assert.equal(searchValuesFromRoute(route, '酒店').checkin, '2027-06-16')
  assert.equal(searchValuesFromRoute(route, '酒店').checkout, '2027-06-18')
  assert.deepEqual(searchValuesFromRoute(route, '机票'), {})
  assert.deepEqual(searchValuesFromRoute('#酒店', '酒店'), {})
})

test('package detail navigation uses the app route contract and saved plan feedback is deferred', () => {
  assert.match(tourPackageDetailSource, /history\.pushState/)
  assert.match(tourPackageDetailSource, /PopStateEvent\('popstate'\)/)
  assert.match(tourPackageDetailSource, /确认购买套餐/)
  assert.match(tourPackageDetailSource, /originalTotal\.value \* 0\.8/)
  assert.match(tourPackageDetailSource, /discountPackage|8 折/)
  assert.match(productChannelSource, /const savedPlan = computed/)
  assert.doesNotMatch(productChannelSource, /emit\('add-plan', item\)\s*feedback\.value = '已加入计划'/)
})

test('recommendations require matching destination, duration, origin and start date', () => {
  assert.equal(matchingPackages('杭州', 3, '沈阳', '2027-06-12')[0].id, 'hangzhou-city-3d')
  assert.equal(matchingPackages('杭州', 5, '沈阳', '2026-11-25')[0].id, 'hangzhou-autumn-5d-2026')
  assert.deepEqual(matchingPackages('杭州', 4, '沈阳', '2027-06-12'), [])
  assert.deepEqual(matchingPackages('成都', 3, '沈阳', '2027-06-12'), [])
  assert.deepEqual(matchingPackages('杭州', 3, '北京', '2027-06-12'), [])
  assert.deepEqual(matchingPackages('杭州', 3, '沈阳', '2027-06-13'), [])
  assert.deepEqual(matchingPackages('杭州', 3), [])
})
