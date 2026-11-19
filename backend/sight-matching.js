function category(text) {
  if (/博物馆|纪念馆|展览馆/.test(text)) return 'museum'
  if (/美术馆|艺术中心|画廊/.test(text)) return 'art'
  if (/游乐|乐园|主题公园/.test(text)) return 'amusement'
  if (/公园|花园|森林|绿地/.test(text)) return 'park'
  if (/街区|古街|步行街/.test(text)) return 'street'
  if (/陵|墓|古迹|古建筑|古城|寺|庙|宫/.test(text)) return 'heritage'
  if (/山|峰|峡谷/.test(text)) return 'mountain'
  if (/湖|河|海|水|湿地/.test(text)) return 'water'
  return ''
}

export function matchSight(products, item) {
  const title = String(item.title || '').trim()
  if (!title) return []
  const exact = products.find(product => product.title === title)
  if (exact) return [exact]
  const wanted = category(title)
  if (!wanted) return []
  const match = products.find(product => category(product.title || '') === wanted)
  return match ? [match] : []
}
