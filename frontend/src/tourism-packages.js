// Curated combinations of existing demo catalogue products, not bookable bundles.
export const tourismPackages = [
  {
    id: 'hangzhou-autumn-5d-2026',
    title: '沈阳出发 · 杭州五日漫游',
    origin: '沈阳',
    destination: '杭州',
    days: 5,
    startDate: '2026-11-25',
    detail: '往返航班、四晚住宿与西湖周边游览',
    components: [
      { label: '去程航班', id: 'flight-on-2026-11-25--flight-HGH-1-out-1', channel: '机票', travelDate: '2026-11-25' },
      { label: '返程航班', id: 'flight-on-2026-11-29--flight-HGH-1-in-1', channel: '机票', travelDate: '2026-11-29' },
      { label: '住宿', id: 'hotel-stay-2026-11-25-2026-11-29--hotel-HGH-1', channel: '酒店', checkIn: '2026-11-25', checkOut: '2026-11-29' },
      { label: '景点', id: 'sight-HGH-3', channel: '攻略·景点', visitDate: '2026-11-26' },
    ],
  },
  {
    id: 'hangzhou-city-3d',
    title: '沈阳出发 · 杭州城市漫游',
    origin: '沈阳',
    destination: '杭州',
    days: 3,
    startDate: '2027-06-12',
    detail: '往返航班、城市酒店与博物馆',
    components: [
      { label: '去程航班', id: 'flight-HGH-1-out-1', channel: '机票', travelDate: '2027-06-12' },
      { label: '返程航班', id: 'flight-HGH-1-in-1', channel: '机票', travelDate: '2027-06-14' },
      { label: '住宿', id: 'hotel-HGH-1', channel: '酒店', checkIn: '2027-06-12', checkOut: '2027-06-14' },
      { label: '景点', id: 'sight-HGH-1', channel: '攻略·景点', visitDate: '2027-06-13' },
    ],
  },
  ...[
    ['beijing-city-3d', '上海', '北京', 'BJS', 'flight', '城市文化之旅'],
    ['chengdu-city-3d', '北京', '成都', 'CTU', 'flight', '成都城市漫游'],
    ['shanghai-city-3d', '北京', '上海', 'SHA', 'train', '上海城市漫步'],
    ['guangzhou-city-3d', '北京', '广州', 'CAN', 'flight', '广州城市探索'],
    ['suzhou-city-3d', '北京', '苏州', 'SZV', 'train', '苏州人文之旅'],
  ].map(([id, origin, destination, code, transport, name]) => ({
    id,
    title: `${origin}出发 · ${name}`,
    origin,
    destination,
    days: 3,
    startDate: '2027-06-12',
    detail: `往返${transport === 'flight' ? '航班' : '火车'}、城市酒店与景点`,
    components: [
      { label: `去程${transport === 'flight' ? '航班' : '火车'}`, id: `${transport}-${code}-1-out-1`, channel: transport === 'flight' ? '机票' : '火车票', travelDate: '2027-06-12' },
      { label: `返程${transport === 'flight' ? '航班' : '火车'}`, id: `${transport}-${code}-1-in-1`, channel: transport === 'flight' ? '机票' : '火车票', travelDate: '2027-06-14' },
      { label: '住宿', id: `hotel-${code}-1`, channel: '酒店', checkIn: '2027-06-12', checkOut: '2027-06-14' },
      { label: '景点', id: `sight-${code}-1`, channel: '攻略·景点', visitDate: '2027-06-13' },
    ],
  })),
]

export function calculatePackagePrice(item, products, travellerCount = 1) {
  if (!item || !Number.isInteger(travellerCount) || travellerCount < 1) return null
  const purchasable = item.components.filter(component => ['机票', '火车票', '酒店'].includes(component.channel))
  if (!purchasable.length) return null

  let originalTotal = 0
  for (const component of purchasable) {
    const product = products?.[component.id]
    if (!product || !Number.isFinite(Number(product.price))) return null
    if (component.channel === '酒店') {
      const nights = (Date.parse(`${component.checkOut}T00:00:00Z`) - Date.parse(`${component.checkIn}T00:00:00Z`)) / 86400000
      if (!Number.isInteger(nights) || nights < 1) return null
      originalTotal += Number(product.price) * nights * Math.ceil(travellerCount / 2)
    } else {
      originalTotal += Number(product.price) * travellerCount
    }
  }

  const discountedTotal = Math.round(originalTotal * 0.8)
  return { originalTotal, discountedTotal, discountAmount: originalTotal - discountedTotal }
}

export function packageLink(id, from = '#旅游') {
  return `#product?${new URLSearchParams({ channel: '旅游', id, from })}`
}

export function productLink(component, from) {
  return `#product?${new URLSearchParams({ channel: component.channel, id: component.id, from })}`
}

export function findPackageComponent(productId, from) {
  if (!from?.startsWith('#product?')) return null
  const params = new URLSearchParams(from.slice('#product?'.length))
  if (params.get('channel') !== '旅游') return null
  const item = tourismPackages.find(entry => entry.id === params.get('id'))
  const component = item?.components.find(entry => entry.id === productId)
  return component ? { item, component } : null
}

export function searchValuesFromRoute(from, channel) {
  if (!from?.startsWith('#results?')) return {}
  const params = new URLSearchParams(from.slice('#results?'.length))
  if (params.get('channel') !== channel) return {}
  return Object.fromEntries(params.entries())
}

export function componentDateLabel(component) {
  if (component?.channel === '酒店' && component.checkIn && component.checkOut) {
    return `入住 ${component.checkIn} · 退房 ${component.checkOut}`
  }
  if (component?.visitDate) return `游览日期 ${component.visitDate}`
  if (component?.travelDate) return `出行日期 ${component.travelDate}`
  return ''
}

export function matchingPackages(destination, days, origin = '', startDate = '') {
  const city = String(destination || '').trim()
  const duration = Number(days)
  const from = String(origin || '').trim()
  if (!city || !from || !startDate || !Number.isInteger(duration) || duration < 1) return []
  return tourismPackages.filter(item => item.destination === city && item.days === duration
    && item.origin === from && item.startDate === startDate)
}
