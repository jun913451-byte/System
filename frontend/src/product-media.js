import hotelPool from './assets/hotel-pool.webp'
import hotelBedroom from './assets/hotel-bedroom.webp'
import hotelSuite from './assets/hotel-suite.webp'
import hotelGardenRoom from './assets/hotel-garden-room.webp'
import hotelLobby from './assets/hotel-lobby.webp'
import hotelResort from './assets/hotel-resort.webp'
import hotelBuilding from './assets/hotel-building.webp'
import mountain from './assets/sight-mountain.webp'
import lake from './assets/sight-lake.webp'
import museum from './assets/sight-museum.webp'
import street from './assets/sight-street.webp'
import park from './assets/sight-park.webp'
import art from './assets/sight-art.webp'
import shopping from './assets/sight-shopping.webp'
import heritage from './assets/sight-heritage.webp'
import amusement from './assets/sight-amusement.webp'

// These are category illustrations, not photographs of the named products.
const hotelPhotos = {
  'photo-1566073771259-6a8506099945': hotelPool,
  'photo-1618773928121-c32242e63f39': hotelBedroom,
  'photo-1590490360182-c33d57733427': hotelSuite,
  'photo-1582719478250-c89cae4dc85b': hotelGardenRoom,
  'photo-1542314831-068cd1dbfeeb': hotelLobby,
  'photo-1551882547-ff40c63fe5fa': hotelResort,
  'photo-1564501049412-61c2a3083791': hotelBuilding,
}

export function productImage(product) {
  if (product?.type === 'hotel') {
    const id = product.image?.match(/photo-[\w-]+/)?.[0]
    return hotelPhotos[id] || hotelBedroom
  }
  if (product?.type !== 'sight') return product?.image || ''
  const title = `${product.title || ''} ${product.detail || ''}`
  if (/博物馆|纪念馆|展览馆/.test(title)) return museum
  if (/美术馆|艺术|画廊/.test(title)) return art
  if (/购物|商场|商圈/.test(title)) return shopping
  if (/游乐|乐园|主题公园/.test(title)) return amusement
  if (/陵|墓|古迹|古建筑|古城|寺|庙|宫/.test(title)) return heritage
  if (/公园|花园|森林|绿地/.test(title)) return park
  if (/街区|古街|步行街/.test(title)) return street
  if (/山|峰|峡谷/.test(title)) return mountain
  if (/湖|河|海|水|湿地/.test(title)) return lake
  return mountain
}
