import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyBookingConflicts, createBookingSnapshot, findBookingConflict, findIntentConflict } from './booking-domain.js'

const flight = {
  id: 'flight-1',
  type: 'flight',
  destination: '杭州',
  origin: '上海',
  arrivalCity: '杭州',
  direction: 'out',
  title: '上海 → 杭州',
  price: 520,
  provider: '模拟航空',
  departTime: '08:00',
  arriveTime: '09:30',
  travelDate: '2027-06-12',
}
const project = { destination: '杭州', days: 3, tripStartDate: '2027-06-12' }

test('booking snapshot records product and selected travel date', () => {
  const order = createBookingSnapshot({ ...flight, travelDate: undefined }, { travelDate: '2027-06-13' })
  assert.equal(order.productId, 'flight-1')
  assert.equal(order.travelDate, '2027-06-13')
  assert.equal(order.origin, '上海')
})

test('scheduled transport product rejects dates without matching availability', () => {
  assert.throws(
    () => createBookingSnapshot({ ...flight, travelDate: '2027-06-12' }, { travelDate: '2027-06-13' }),
    /无可用订单/,
  )
})

test('transport total is calculated from the server product price and passenger count', () => {
  const order = createBookingSnapshot(flight, { passengers: 2 })
  assert.equal(order.totalPrice, 1040)
  assert.equal(order.passengers, 2)
})

test('flight fare offer is validated and included in the server-calculated order total', () => {
  const order = createBookingSnapshot(flight, { offerId: 'fare-standard', passengers: 2 })
  assert.equal(order.offerName, '经济舱标准')
  assert.equal(order.price, 700)
  assert.equal(order.totalPrice, 1400)
  assert.throws(() => createBookingSnapshot(flight, { offerId: 'client-invented-fare' }), /方案无效/)
})

test('hotel snapshot requires a valid non-empty stay range', () => {
  const hotel = { ...flight, id: 'hotel-1', type: 'hotel' }
  assert.throws(() => createBookingSnapshot(hotel, { checkIn: '2027-06-12', checkOut: '2027-06-12' }))
})

test('hotel total includes nights and room count', () => {
  const hotel = { ...flight, id: 'hotel-1', type: 'hotel', price: 400 }
  const order = createBookingSnapshot(hotel, {
    checkIn: '2027-06-12',
    checkOut: '2027-06-15',
    rooms: 2,
  })
  assert.equal(order.nights, 3)
  assert.equal(order.rooms, 2)
  assert.equal(order.guests, 1)
  assert.equal(order.totalPrice, 2400)
})

test('hotel room offer is validated and included in the server-calculated stay total', () => {
  const hotel = { ...flight, id: 'hotel-1', type: 'hotel', price: 400 }
  const order = createBookingSnapshot(hotel, {
    checkIn: '2027-06-12',
    checkOut: '2027-06-15',
    rooms: 2,
    offerId: 'room-breakfast',
  })
  assert.equal(order.offerName, '含早房')
  assert.equal(order.price, 468)
  assert.equal(order.totalPrice, 2808)
})

test('hotel snapshot rejects dates outside the platform demo range', () => {
  const hotel = {
    ...flight,
    id: 'hotel-1',
    type: 'hotel',
    checkInStart: '2027-06-12',
    checkInEnd: '2027-06-19',
    checkOutLimit: '2027-06-20',
  }
  assert.throws(
    () => createBookingSnapshot(hotel, { checkIn: '2027-06-20', checkOut: '2027-06-21' }),
    /超出演示商品/,
  )
})

test('matching destination and dates do not conflict', () => {
  const order = createBookingSnapshot(flight)
  assert.equal(findBookingConflict(order, [], project), '')
})

test('out-of-range booking is a conflict', () => {
  const order = createBookingSnapshot({ ...flight, travelDate: undefined }, { travelDate: '2027-06-16' })
  assert.match(findBookingConflict(order, [], project), /超出当前行程日期范围/)
})

test('duplicate travel leg is a conflict', () => {
  const order = createBookingSnapshot(flight)
  const duplicate = { ...order, productId: 'flight-2', title: '另一班上海 → 杭州' }
  assert.match(findBookingConflict(order, [duplicate], project), /重复或时间重叠/)
})

test('overlapping stays at different hotels are a conflict', () => {
  const hotel = { ...flight, id: 'hotel-1', type: 'hotel', destination: '杭州' }
  const order = createBookingSnapshot(hotel, { checkIn: '2027-06-12', checkOut: '2027-06-14' })
  const existing = { ...order, id: 'booking-1', productId: 'hotel-2', title: '另一家酒店' }
  assert.match(findBookingConflict(order, [existing], project), /酒店订单日期重叠/)
})

test('explicit dialogue date conflicting with a booked return asks before itinerary changes', () => {
  const bookedReturn = { ...createBookingSnapshot(flight), direction: 'in', travelDate: '2027-06-14' }
  assert.match(findIntentConflict('把返程改到6月15日', [bookedReturn]), /已确认订单日期为2027-06-14/)
})

test('hard conflicts require a shared traveller and compare real transport times across routes and dates', () => {
  const original = { ...createBookingSnapshot(flight), id: 'one', travellers: [{ id: 'a' }] }
  const unrelated = { ...original, id: 'two', origin: '北京', arrivalCity: '成都', travellers: [{ id: 'b' }] }
  assert.deepEqual(classifyBookingConflicts(original, [unrelated]), [])
  assert.equal(classifyBookingConflicts(original, [{ ...unrelated, travellers: [{ id: 'a' }] }])[0].code, 'transport_overlap')
  const overnight = { ...original, travelDate: '2027-06-11', departTime: '23:30', arriveTime: '08:30' }
  assert.equal(classifyBookingConflicts(original, [overnight])[0].severity, 'hard')
  assert.deepEqual(classifyBookingConflicts(original, [{ ...overnight, arriveTime: '07:00' }]), [])
})

test('overlapping hotel stays conflict even at the same hotel but not for different travellers', () => {
  const hotel = { ...flight, id: 'hotel-1', type: 'hotel' }
  const order = { ...createBookingSnapshot(hotel, { checkIn: '2027-06-12', checkOut: '2027-06-14' }), travellers: [{ id: 'a' }] }
  assert.equal(classifyBookingConflicts(order, [{ ...order, id: 'other' }])[0].code, 'hotel_overlap')
  assert.deepEqual(classifyBookingConflicts(order, [{ ...order, travellers: [{ id: 'b' }] }]), [])
  assert.deepEqual(classifyBookingConflicts(order, [{ ...order, checkIn: '2027-06-14', checkOut: '2027-06-15' }]), [])
})

test('short connections need a specific common hub for a hard conflict', () => {
  const first = { ...createBookingSnapshot(flight), id: 'first', travellers: [{ id: 'a' }], arrivePort: '杭州萧山国际机场' }
  const next = { ...first, id: 'next', origin: '杭州', arrivalCity: '成都', departTime: '10:30', arriveTime: '13:00', departPort: '杭州萧山国际机场' }
  assert.equal(classifyBookingConflicts(next, [first])[0].code, 'short_connection')
  assert.equal(classifyBookingConflicts({ ...next, departTime: '11:30' }, [first]).length, 0)
  assert.equal(classifyBookingConflicts({ ...next, departPort: '杭州机场' }, [first])[0].severity, 'soft')
  const train = { ...first, type: 'train', arrivePort: '杭州东站' }
  const nextTrain = { ...next, type: 'train', departPort: '杭州东站', departTime: '09:50' }
  assert.equal(classifyBookingConflicts(nextTrain, [train])[0].severity, 'hard')
  assert.deepEqual(classifyBookingConflicts({ ...nextTrain, departTime: '10:00' }, [train]), [])
})

test('trip location and date mismatches are soft and return trips do not mismatch solely due to destination', () => {
  const order = { ...createBookingSnapshot(flight), travellers: [{ id: 'a' }] }
  const wrong = classifyBookingConflicts({ ...order, origin: '北京', arrivalCity: '成都', travelDate: '2027-06-20' }, [], project)
  assert.deepEqual(wrong.map(item => item.code), ['destination', 'date'])
  assert.ok(wrong.every(item => item.severity === 'soft'))
  assert.deepEqual(classifyBookingConflicts({ ...order, origin: '杭州', arrivalCity: '上海', direction: 'in' }, [], project), [])
})
