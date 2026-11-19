const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function transportType(item) {
  const text = `${item.title || ''} ${item.description || ''}`
  const flight = /飞机|航班|机票|航空/.test(text)
  const train = /火车|高铁|动车|城际列车|城际铁路|列车|铁路|车次/.test(text)
  if (flight === train) return ''
  return flight ? 'flight' : 'train'
}

function describedRoute(products, text) {
  const routes = new Map()
  for (const product of products) {
    if (!product.origin || !product.arrivalCity || product.origin === product.arrivalCity) continue
    const origin = escapeRegExp(product.origin)
    const destination = escapeRegExp(product.arrivalCity)
    const pattern = new RegExp(`${origin}(?:市|站)?(?:\\s|乘|坐|搭乘|城际|高铁|动车|列车|火车|飞机|航班|出发|前往|返回|回到|去|至|到|→|—|-|/){1,30}${destination}(?:市|站)?`)
    if (pattern.test(text)) routes.set(`${product.origin}\0${product.arrivalCity}`, [product.origin, product.arrivalCity])
  }
  return routes.size === 1 ? [...routes.values()][0] : null
}

export function matchTransport(products, item, { destination = '', departureCity = '', date = '', purchaseRequested = false } = {}) {
  if (item.type !== 'transport' || item.bookingId) return []
  const type = transportType(item)
  if (!type) return []
  const candidates = products.filter(product => product.type === type)
  const text = `${item.title || ''} ${item.description || ''}`
  let route = describedRoute(candidates, text)

  // Only generic generated arrival/departure labels may use the trip's departure city.
  if (!route && destination && departureCity) {
    const city = escapeRegExp(destination)
    const title = String(item.title || '').trim()
    if (item.travelLeg === 'arrival' && new RegExp(`^乘(?:飞机|火车|高铁|动车)抵达${city}$`).test(title)) {
      route = [departureCity, destination]
    } else if (item.travelLeg === 'departure' && new RegExp(`^乘(?:飞机|火车|高铁|动车)离开${city}$`).test(title)) {
      route = [destination, departureCity]
    }
  }
  if (!route) return []

  const isTripLeg = Boolean(departureCity && (
    (route[0] === departureCity && route[1] === destination) ||
    (route[0] === destination && route[1] === departureCity)
  ))
  if (!isTripLeg && !purchaseRequested && !date) return []

  return candidates.filter(product =>
    product.origin === route[0] &&
    product.arrivalCity === route[1] &&
    (!date || product.travelDate === date)
  ).slice(0, 2)
}
