export function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

export function addDays(value, amount) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

export const BOOKING_OFFERS = {
  hotel: [
    { id: 'room-comfort', name: '舒适房', priceDelta: 0, detail: '基础房型 · 预付优惠', policy: '不可取消' },
    { id: 'room-breakfast', name: '含早房', priceDelta: 68, detail: '双人早餐 · 1 间', policy: '不可取消' },
    { id: 'room-flexible', name: '灵活入住', priceDelta: 128, detail: '双人早餐 · 入住当日 18:00 前可取消', policy: '限时免费取消' },
  ],
  flight: [
    { id: 'fare-saver', name: '经济舱特惠', priceDelta: 0, detail: '随身行李 · 退改按规则收费', policy: '特惠票价' },
    { id: 'fare-standard', name: '经济舱标准', priceDelta: 180, detail: '含托运行李 · 支持付费改签', policy: '行李保障' },
    { id: 'fare-flexible', name: '经济舱灵活', priceDelta: 420, detail: '含托运行李 · 改签服务更灵活', policy: '灵活出行' },
  ],
}

function selectedOffer(type, offerId) {
  const offers = BOOKING_OFFERS[type]
  const offer = offers?.find(item => item.id === (offerId || offers[0].id))
  if (!offer) throw new Error('所选产品方案无效，请重新选择')
  return offer
}

export function createBookingSnapshot(product, input = {}) {
  if (!product || !['flight', 'train', 'hotel'].includes(product.type)) {
    throw new Error('仅支持机票、火车票和酒店订单')
  }

  const offer = product.type === 'hotel' || product.type === 'flight'
    ? selectedOffer(product.type, input.offerId)
    : null
  const unitPrice = product.price + (offer?.priceDelta || 0)
  const base = {
    productId: product.id,
    type: product.type,
    title: product.title,
    destination: product.destination,
    price: unitPrice,
    provider: product.provider,
    createdAt: new Date().toISOString(),
    ...(offer ? { offerId: offer.id, offerName: offer.name, offerDetail: offer.detail, offerPolicy: offer.policy } : {}),
  }

  if (product.type === 'hotel') {
    const checkIn = input.checkIn
    const checkOut = input.checkOut
    if (!isIsoDate(checkIn) || !isIsoDate(checkOut) || checkOut <= checkIn) {
      throw new Error('酒店订单需要有效的入住和退房日期')
    }
    if ((product.checkInStart && checkIn < product.checkInStart)
      || (product.checkInEnd && checkIn > product.checkInEnd)
      || (product.checkOutLimit && checkOut > product.checkOutLimit)) {
      throw new Error('酒店日期超出演示商品的可选入住范围')
    }
    const rooms = Number(input.rooms || 1)
    if (!Number.isInteger(rooms) || rooms < 1 || rooms > 5) throw new Error('酒店房间数需为 1 到 5 间')
    const guests = Number(input.guests || 1)
    if (!Number.isInteger(guests) || guests < 1 || guests > 9) throw new Error('入住人数需为 1 到 9 人')
    return {
      ...base,
      checkIn,
      checkOut,
      nights: Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86400000),
      rooms,
      guests,
      totalPrice: unitPrice * Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86400000) * rooms,
    }
  }

  const travelDate = input.travelDate || product.travelDate
  if (!isIsoDate(travelDate)) throw new Error('机票和火车票订单需要有效的乘车日期')
  if (product.travelDate && travelDate !== product.travelDate) throw new Error('该班次在所选日期无可用订单，请返回列表选择对应日期')
  if (!product.origin || !product.arrivalCity || !product.departTime || !product.arriveTime) {
    throw new Error('商品缺少核对订单所需的路线或时刻')
  }
  const passengers = Number(input.passengers || 1)
  if (!Number.isInteger(passengers) || passengers < 1 || passengers > 9) throw new Error('出行人数需为 1 到 9 人')
  return {
    ...base,
    origin: product.origin,
    arrivalCity: product.arrivalCity,
    direction: product.direction,
    travelDate,
    departTime: product.departTime,
    arriveTime: product.arriveTime,
    ...(product.departPort ? { departPort: product.departPort } : {}),
    ...(product.arrivePort ? { arrivePort: product.arrivePort } : {}),
    code: product.code || '',
    passengers,
    totalPrice: unitPrice * passengers,
  }
}

function transportInterval(booking) {
  if (!isIsoDate(booking.travelDate)) return null
  const parse = value => {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value || '')
    return match ? Number(match[1]) * 60 + Number(match[2]) : null
  }
  const departure = parse(booking.departTime)
  const arrival = parse(booking.arriveTime)
  if (departure === null || arrival === null) return null
  const date = Date.parse(`${booking.travelDate}T00:00:00Z`) / 60000
  return [date + departure, date + arrival + (arrival < departure ? 1440 : 0)]
}

function sameTraveller(left, right) {
  const ids = new Set((left.travellers || []).map(person => person.id).filter(Boolean))
  return (right.travellers || []).some(person => person.id && ids.has(person.id))
}

function knownHub(name, city) {
  if (typeof name !== 'string' || !name.trim()) return false
  const hub = name.trim()
  return hub !== `${city}机场` && hub !== `${city}车站` && hub !== `${city}站`
}

// Booking facts without matching traveller identities are insufficient to establish a conflict.
export function classifyBookingConflicts(booking, existingBookings, project = null) {
  const conflicts = []
  if (project) {
    const places = booking.type === 'hotel' ? [booking.destination] : [booking.origin, booking.arrivalCity]
    if (places.every(place => place && place !== project.destination)) {
      conflicts.push({ severity: 'soft', code: 'destination', message: `订单地点与${project.destination}行程可能不一致` })
    }
    const start = booking.type === 'hotel' ? booking.checkIn : booking.travelDate
    const end = booking.type === 'hotel' ? booking.checkOut : isIsoDate(start) ? addDays(start, 1) : ''
    if (isIsoDate(project.tripStartDate) && isIsoDate(start) && isIsoDate(end)
      && Number.isInteger(project.days) && project.days > 0
      && (start < project.tripStartDate || end > addDays(project.tripStartDate, project.days))) {
      conflicts.push({ severity: 'soft', code: 'date', message: `订单日期${start}至${end}超出当前行程日期范围` })
    }
  }
  for (const existing of existingBookings) {
    if (!sameTraveller(booking, existing)) continue
    if (booking.type === 'hotel' && existing.type === 'hotel'
      && isIsoDate(booking.checkIn) && isIsoDate(booking.checkOut)
      && isIsoDate(existing.checkIn) && isIsoDate(existing.checkOut)
      && booking.checkIn < existing.checkOut && existing.checkIn < booking.checkOut) {
      const sameCity = booking.destination && booking.destination === existing.destination
      conflicts.push({ severity: sameCity ? 'hard' : 'soft', code: 'hotel_overlap', otherOrderId: existing.id,
        message: sameCity ? `酒店入住日期与订单「${existing.title}」重叠` : `异地酒店与订单「${existing.title}」入住日期重叠，请确认是否由同一人入住` })
    }
    if (booking.type === 'hotel' || existing.type === 'hotel') continue
    const current = transportInterval(booking)
    const previous = transportInterval(existing)
    if (!current || !previous) continue
    if (current[0] < previous[1] && previous[0] < current[1]) {
      conflicts.push({ severity: 'hard', code: 'transport_overlap', otherOrderId: existing.id, message: `交通时间与订单「${existing.title}」重叠` })
      continue
    }
    const [first, second, firstTimes, secondTimes] = previous[0] < current[0]
      ? [existing, booking, previous, current] : [booking, existing, current, previous]
    const gap = secondTimes[0] - firstTimes[1]
    if (gap >= 120 || !first.arrivalCity || first.arrivalCity !== second.origin) continue
    const sameMode = first.type === second.type
    const known = sameMode && knownHub(first.arrivePort, first.arrivalCity)
      && knownHub(second.departPort, second.origin)
    const threshold = first.type === 'flight' ? 120 : first.type === 'train' ? 30 : 0
    if (known && first.arrivePort === second.departPort && gap < threshold) {
      conflicts.push({ severity: 'hard', code: 'short_connection', otherOrderId: existing.id, message: `与订单「${existing.title}」的中转时间不足${threshold}分钟` })
    } else if ((!known || first.arrivePort !== second.departPort) && gap < 120) {
      conflicts.push({ severity: 'soft', code: 'uncertain_connection', otherOrderId: existing.id, message: `与订单「${existing.title}」的换乘时间较短，请确认交通枢纽及换乘安排` })
    }
  }
  return conflicts
}

function timeRange(value) {
  const [start, end] = value.split('-').map(Number)
  return [start, end < start ? end + 1440 : end]
}

function overlaps(left, right) {
  return left[0] < right[1] && right[0] < left[1]
}

export function findBookingConflict(booking, existingBookings, project) {
  if (booking.destination !== project.destination) {
    return `订单目的地为${booking.destination}，与当前${project.destination}行程不一致`
  }

  const startDate = project.tripStartDate
  const endDate = startDate ? addDays(startDate, project.days) : ''
  const bookingStart = booking.type === 'hotel' ? booking.checkIn : booking.travelDate
  const bookingEnd = booking.type === 'hotel' ? booking.checkOut : addDays(booking.travelDate, 1)
  if (startDate && (bookingStart < startDate || bookingEnd > endDate)) {
    return `订单日期${bookingStart}至${bookingEnd}超出当前行程日期范围`
  }

  for (const existing of existingBookings) {
    if (existing.type === 'hotel' && booking.type === 'hotel') {
      const sameHotel = existing.productId === booking.productId
      if (!sameHotel && existing.checkIn < booking.checkOut && booking.checkIn < existing.checkOut) {
        return `酒店订单日期重叠：${existing.title}与${booking.title}`
      }
    }
    if (existing.type !== 'hotel' && booking.type !== 'hotel'
      && existing.travelDate === booking.travelDate
      && existing.origin === booking.origin
      && existing.arrivalCity === booking.arrivalCity) {
      const sameLeg = existing.direction === booking.direction
      const timeOverlap = overlaps(timeRange(`${existing.departTime}-${existing.arriveTime}`), timeRange(`${booking.departTime}-${booking.arriveTime}`))
      if (sameLeg || timeOverlap) return `交通订单与已有订单${existing.title}重复或时间重叠`
    }
  }

  return ''
}

export function findIntentConflict(requestText, bookings) {
  const match = requestText.match(/(?:(20\d{2})年)?\s*(\d{1,2})月\s*(\d{1,2})日/)
    || requestText.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/)
  if (!match) return ''
  const year = match[1] || bookings[0]?.travelDate?.slice(0, 4) || bookings[0]?.checkIn?.slice(0, 4)
  const requestedDate = `${year}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`
  if (!isIsoDate(requestedDate)) return ''

  const asksOutbound = /出发|去程|去的时候|前往/.test(requestText)
  const asksReturn = /返程|回程|返航|返回|回来/.test(requestText)
  const asksHotel = /酒店|住宿|入住|退房/.test(requestText)
  for (const booking of bookings) {
    if (booking.type !== 'hotel' && asksOutbound && booking.direction === 'out' && booking.travelDate !== requestedDate) {
      return `你提到的出发日期是${requestedDate}，但已确认订单日期为${booking.travelDate}。订单不会被修改；你希望小程如何调整行程？`
    }
    if (booking.type !== 'hotel' && asksReturn && booking.direction === 'in' && booking.travelDate !== requestedDate) {
      return `你提到的返程日期是${requestedDate}，但已确认订单日期为${booking.travelDate}。订单不会被修改；你希望小程如何调整行程？`
    }
    if (booking.type === 'hotel' && asksHotel
      && (requestedDate < booking.checkIn || requestedDate >= booking.checkOut)) {
      return `你提到的住宿日期是${requestedDate}，与已确认酒店订单日期不一致。订单不会被修改；你希望小程如何调整行程？`
    }
  }
  return ''
}
