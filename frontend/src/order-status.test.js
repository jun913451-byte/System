import test from 'node:test'
import assert from 'node:assert/strict'
import { localDate, orderStatus, sortOrders } from './order-status.js'

const today = '2027-06-14'

test('transport status follows the local travel date', () => {
  assert.equal(orderStatus({ type: 'flight', travelDate: '2027-06-15' }, today), '待出行')
  assert.equal(orderStatus({ type: 'train', travelDate: today }, today), '出行中')
  assert.equal(orderStatus({ type: 'flight', travelDate: '2027-06-13' }, today), '已完成')
  assert.equal(orderStatus({ type: 'train' }, today), '待出行')
})

test('hotel stay includes check-in but excludes check-out', () => {
  const hotel = { type: 'hotel', checkIn: '2027-06-12', checkOut: '2027-06-14' }
  assert.equal(orderStatus(hotel, '2027-06-11'), '待出行')
  assert.equal(orderStatus(hotel, '2027-06-12'), '出行中')
  assert.equal(orderStatus(hotel, '2027-06-13'), '出行中')
  assert.equal(orderStatus(hotel, '2027-06-14'), '已完成')
})

test('explicit terminal states take precedence over dates', () => {
  assert.equal(orderStatus({ status: 'cancelled', travelDate: '2020-01-01' }, today), '已取消')
  assert.equal(orderStatus({ status: 'completed', travelDate: '2030-01-01' }, today), '已完成')
  assert.equal(orderStatus(null, today), '')
})

test('completed orders sort last while preserving input and relative order', () => {
  const orders = [
    { id: 1, type: 'hotel', checkIn: '2027-06-12', checkOut: today },
    { id: 2, status: 'cancelled' },
    { id: 3, travelDate: '2027-06-15' },
    { id: 4, status: 'completed' },
    { id: 5, travelDate: today },
  ]
  assert.deepEqual(sortOrders(orders, today).map(order => order.id), [2, 3, 5, 1, 4])
  assert.deepEqual(orders.map(order => order.id), [1, 2, 3, 4, 5])
})

test('local date uses local calendar fields', () => {
  assert.equal(localDate(new Date(2027, 0, 2, 23, 59)), '2027-01-02')
})
