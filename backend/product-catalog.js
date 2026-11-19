import { isIsoDate } from './booking-domain.js'

const normalizeCity = value => String(value || '')
  .trim()
  .replace(/(北|南|东|西)?站$/, '')
  .replace(/(北|南|东|西)$/, '')

function dateLabel(date) {
  const value = new Date(`${date}T12:00:00`)
  if (Number.isNaN(value.getTime())) return date
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][value.getDay()]
  return `${date} 周${weekday}`
}

function stablePrice(product, date) {
  let hash = 0
  for (const character of `${product.id}:${date}`) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }
  return Math.max(120, Math.round(product.price * (0.9 + (hash % 31) / 100)))
}

function datedProduct(product, date) {
  const id = `${product.type}-on-${date}--${product.id}`
  return {
    ...product,
    id,
    price: stablePrice(product, date),
    travelDate: date,
    dateLabel: dateLabel(date),
    href: `/demo/products/${id}`,
  }
}

function randomSample(products, count) {
  const sample = [...products]
  for (let index = 0; index < Math.min(count, sample.length); index += 1) {
    const swapIndex = index + Math.floor(Math.random() * (sample.length - index))
    const current = sample[index]
    sample[index] = sample[swapIndex]
    sample[swapIndex] = current
  }
  return sample.slice(0, count)
}

function parseDatedId(id) {
  const match = String(id).match(/^(flight|train)-on-(\d{4}-\d{2}-\d{2})--(.+)$/)
  if (match) {
    const [, type, date, baseId] = match
    return isIsoDate(date) ? { type, date, baseId } : null
  }
  const hotel = String(id).match(/^hotel-stay-(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})--(.+)$/)
  if (!hotel) return null
  const [, checkIn, checkOut, baseId] = hotel
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut) || checkOut <= checkIn) return null
  return { type: 'hotel', checkIn, checkOut, baseId }
}

function datedHotel(product, checkIn, checkOut) {
  return {
    ...product,
    id: `hotel-stay-${checkIn}-${checkOut}--${product.id}`,
    checkIn,
    checkOut,
    checkInStart: checkIn,
    checkInEnd: checkIn,
    checkOutLimit: checkOut,
    href: `/demo/products/hotel-stay-${checkIn}-${checkOut}--${product.id}`,
  }
}

export function listProducts(catalog, search) {
  const type = search.get('type')
  const destination = search.get('destination')
  const origin = search.get('origin')
  const travelDate = search.get('travelDate')
  const checkIn = search.get('checkIn')
  const checkOut = search.get('checkOut')
  const limitValue = Number.parseInt(search.get('limit'), 10)
  const limit = Number.isInteger(limitValue) && limitValue > 0 ? Math.min(limitValue, 100) : null
  if (['flight', 'train'].includes(type) && origin && destination && travelDate) {
    if (!isIsoDate(travelDate)) return []
    const normalizedOrigin = normalizeCity(origin)
    const normalizedDestination = normalizeCity(destination)
    const products = catalog
      .filter(product => product.type === type
        && normalizeCity(product.origin) === normalizedOrigin
        && normalizeCity(product.arrivalCity) === normalizedDestination)
      .map(product => datedProduct(product, travelDate))
    return limit ? products.slice(0, limit) : products
  }
  if (type === 'hotel' && destination && checkIn && checkOut) {
    if (!isIsoDate(checkIn) || !isIsoDate(checkOut) || checkOut <= checkIn) return []
    const products = catalog.filter(product => product.type === 'hotel' && product.destination === destination)
      .map(product => datedHotel(product, checkIn, checkOut))
    return limit ? products.slice(0, limit) : products
  }
  let products = catalog.filter(product =>
    (!destination || product.destination === destination) &&
    (!type || product.type === type))
  if (type === 'flight' && search.get('recommend') === 'low-fare' && limit) {
    const lowFarePoolSize = Math.max(limit * 4, Math.ceil(products.length * 0.2))
    const lowFarePool = [...products]
      .sort((a, b) => a.price - b.price)
      .slice(0, lowFarePoolSize)
    products = randomSample(lowFarePool, limit).sort((a, b) => a.price - b.price)
  } else if (limit) {
    products = products.slice(0, limit)
  }
  return products
}

export function findProduct(catalog, id) {
  const exact = catalog.find(product => product.id === id)
  if (exact) return exact
  const dated = parseDatedId(id)
  if (!dated) return null
  const base = catalog.find(product => product.id === dated.baseId && product.type === dated.type)
  if (!base) return null
  return dated.type === 'hotel'
    ? datedHotel(base, dated.checkIn, dated.checkOut)
    : datedProduct(base, dated.date)
}

export function withOffers(products, offersByType) {
  return products.map(product => ({ ...product, offers: offersByType[product.type] || [] }))
}
