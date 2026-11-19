import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const output = join(root, 'backend', 'demo-products.json')
const cities = [
  { name: '杭州', code: 'HGH', hubs: ['沈阳', '北京', '上海', '广州', '成都'] },
  { name: '苏州', code: 'SZV', hubs: ['北京', '上海', '南京', '杭州'] },
  { name: '成都', code: 'CTU', hubs: ['北京', '上海', '广州', '杭州'] },
  { name: '北京', code: 'BJS', hubs: ['上海', '广州', '成都', '杭州'] },
  { name: '上海', code: 'SHA', hubs: ['北京', '广州', '成都', '杭州'] },
  { name: '广州', code: 'CAN', hubs: ['北京', '上海', '成都', '杭州'] },
]
const provincialCapitals = [
  ['北京', 'BJS'], ['天津', 'TSN'], ['石家庄', 'SJW'], ['太原', 'TYN'], ['呼和浩特', 'HET'],
  ['沈阳', 'SHE'], ['长春', 'CGQ'], ['哈尔滨', 'HRB'], ['上海', 'SHA'], ['南京', 'NKG'],
  ['杭州', 'HGH'], ['合肥', 'HFE'], ['福州', 'FOC'], ['南昌', 'KHN'], ['济南', 'TNA'],
  ['郑州', 'CGO'], ['武汉', 'WUH'], ['长沙', 'CSX'], ['广州', 'CAN'], ['南宁', 'NNG'],
  ['海口', 'HAK'], ['重庆', 'CKG'], ['成都', 'CTU'], ['贵阳', 'KWE'], ['昆明', 'KMG'],
  ['拉萨', 'LXA'], ['西安', 'XIY'], ['兰州', 'LHW'], ['西宁', 'XNN'], ['银川', 'INC'],
  ['乌鲁木齐', 'URC'],
].map(([name, code]) => ({ name, code }))
const hotelDestinations = [...provincialCapitals, { name: '苏州', code: 'SZV' }]
const hotelNames = ['城市优选酒店', '悦居商务酒店', '云栖精品酒店', '锦程精选酒店', '城市花园酒店', '栖居酒店']
const hotelDetails = ['市中心 · 交通便利', '近地铁 · 含早餐', '核心商圈 · 可免费取消', '双床房 · 适合短途出行', '交通枢纽周边 · 精品客房', '安静舒适 · 可免费取消']
const hotelProviders = ['城市住宿', '精选旅宿', '商务酒店', '城市住宿', '旅行优选', '精选旅宿']
const sights = ['城市博物馆', '历史街区', '湖滨公园', '艺术中心']
const hotelImages = [
  'photo-1566073771259-6a8506099945',
  'photo-1618773928121-c32242e63f39',
  'photo-1590490360182-c33d57733427',
  'photo-1582719478250-c89cae4dc85b',
  'photo-1542314831-068cd1dbfeeb',
  'photo-1551882547-ff40c63fe5fa',
]
const sightImages = [
  'photo-1564399579883-451a5d44ec08',
  'photo-1519501025264-65ba15a82390',
  'photo-1441974231531-c6227db76b6e',
  'photo-1579783902614-a3fb3927b6a5',
]
const flightImage = 'photo-1436491865332-7a61a109cc05'
const trainImage = 'photo-1474487548417-781cb71495f3'

const products = []
const formatTime = value => `${String(Math.floor(value / 60) % 24).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
for (const city of cities) {
  city.hubs.forEach((hub, index) => {
    const routes = [
      { origin: hub, destination: city.name, direction: 'out' },
      { origin: city.name, destination: hub, direction: 'in' },
    ]
    routes.forEach((route, routeIndex) => {
      const routeId = `${city.code}-${index + 1}-${route.direction}`
      for (let option = 0; option < 3; option += 1) {
        const flightDuration = 125 + index * 35 + option * 20
        const flightDeparture = (7 + index + routeIndex * 5 + option * 2) * 60 + 20
        const flightStop = (index + option) % 2 ? '经停' : '直飞'
        const id = `${routeId}-${option + 1}`
        products.push({
          id: `flight-${id}`,
          type: 'flight',
          destination: city.name,
          origin: route.origin,
          arrivalCity: route.destination,
          direction: route.direction,
          title: `${route.origin} → ${route.destination} · ${flightStop}`,
          detail: `${formatTime(flightDeparture)} 出发 · 约 ${Math.floor(flightDuration / 60)} 小时 ${flightDuration % 60} 分`,
          price: 520 + index * 115 + option * 68,
          unit: '元/人起',
          provider: ['东方航空', '南方航空', '海南航空', '中国国航'][(index + option) % 4],
          code: `MU${String(2100 + index * 37 + routeIndex * 11 + option * 13).padStart(4, '0')}`,
          departTime: formatTime(flightDeparture),
          arriveTime: formatTime(flightDeparture + flightDuration),
          travelDate: route.direction === 'in' ? '2027-06-14' : '2027-06-12',
          departPort: `${route.origin}机场`,
          arrivePort: `${route.destination}机场`,
          duration: `${Math.floor(flightDuration / 60)}h${String(flightDuration % 60).padStart(2, '0')}m`,
          stop: flightStop,
          discount: `${(3.8 + index * 0.4 + option * 0.3).toFixed(1)}折`,
          dateLabel: route.direction === 'in' ? '2027-06-14 周一' : '2027-06-12 周六',
          image: `https://images.unsplash.com/${flightImage}?auto=format&fit=crop&w=900&q=75`,
          href: `/demo/products/flight-${id}`,
        })
      }
      for (let option = 0; option < 2; option += 1) {
        const id = `${routeId}-${option + 1}`
        products.push({
          id: `train-${id}`,
          type: 'train',
          destination: city.name,
          origin: route.origin,
          arrivalCity: route.destination,
          direction: route.direction,
          title: `G${1220 + index * 8 + routeIndex * 3 + option * 2} · ${route.origin} → ${route.destination}`,
          detail: `${formatTime((8 + index + routeIndex * 4 + option * 3) * 60 + 6)} 出发 · 约 ${3 + index} 小时`,
          departTime: formatTime((8 + index + routeIndex * 4 + option * 3) * 60 + 6),
          arriveTime: formatTime((8 + index + routeIndex * 4 + option * 3) * 60 + 6 + (3 + index) * 60),
          travelDate: route.direction === 'in' ? '2027-06-14' : '2027-06-12',
          price: 198 + index * 86 + option * 42,
          unit: '元/人起',
          provider: '铁路出行',
          image: `https://images.unsplash.com/${trainImage}?auto=format&fit=crop&w=900&q=75`,
          href: `/demo/products/train-${id}`,
        })
      }
    })
  })
  sights.forEach((name, index) => products.push({
    id: `sight-${city.code}-${index + 1}`,
    type: 'sight',
    destination: city.name,
    title: `${city.name}${name}`,
    detail: ['建议预留 2 小时', '适合步行游览', '开放时间出发前确认', '可按兴趣灵活安排'][index],
    price: [0, 45, 68, 35][index],
    unit: index === 0 ? '免费' : '元/人起',
    provider: '景点灵感',
    image: `https://images.unsplash.com/${sightImages[index]}?auto=format&fit=crop&w=900&q=75`,
    href: `/demo/products/sight-${city.code}-${index + 1}`,
  }))
}

const existingCapitalPairs = new Set(cities.flatMap(city => city.hubs
  .filter(hub => provincialCapitals.some(capital => capital.name === hub))
  .map(hub => [city.name, hub].sort().join('|'))))

for (const city of provincialCapitals) {
  const cityIndex = provincialCapitals.findIndex(capital => capital.code === city.code)
  for (const hub of provincialCapitals) {
    if (hub.code === city.code || existingCapitalPairs.has([city.name, hub.name].sort().join('|'))) continue

    const hubIndex = provincialCapitals.findIndex(capital => capital.code === hub.code)
    const routes = [
      { origin: hub.name, destination: city.name, direction: 'out' },
      { origin: city.name, destination: hub.name, direction: 'in' },
    ]

    routes.forEach((route, routeIndex) => {
      const routeId = `${hub.code}-${city.code}-${route.direction}`
      for (let option = 0; option < 3; option += 1) {
        const flightDuration = 125 + (Math.abs(cityIndex - hubIndex) % 8) * 25 + option * 20
        const flightDeparture = (7 + (hubIndex % 8) + routeIndex * 5 + option * 2) * 60 + 20
        const flightStop = (cityIndex + hubIndex + option) % 2 ? '经停' : '直飞'
        const id = `${routeId}-${option + 1}`
        products.push({
          id: `flight-${id}`,
          type: 'flight',
          destination: city.name,
          origin: route.origin,
          arrivalCity: route.destination,
          direction: route.direction,
          title: `${route.origin} → ${route.destination} · ${flightStop}`,
          detail: `${formatTime(flightDeparture)} 出发 · 约 ${Math.floor(flightDuration / 60)} 小时 ${flightDuration % 60} 分`,
          price: 480 + ((cityIndex * 31 + hubIndex * 17) % 9) * 75 + option * 68,
          unit: '元/人起',
          provider: ['东方航空', '南方航空', '海南航空', '中国国航'][(cityIndex + hubIndex + option) % 4],
          code: `MU${String(2100 + cityIndex * 37 + hubIndex * 11 + routeIndex * 13 + option).padStart(4, '0')}`,
          departTime: formatTime(flightDeparture),
          arriveTime: formatTime(flightDeparture + flightDuration),
          travelDate: route.direction === 'in' ? '2027-06-14' : '2027-06-12',
          departPort: `${route.origin}机场`,
          arrivePort: `${route.destination}机场`,
          duration: `${Math.floor(flightDuration / 60)}h${String(flightDuration % 60).padStart(2, '0')}m`,
          stop: flightStop,
          discount: `${(3.8 + ((cityIndex + hubIndex) % 6) * 0.3 + option * 0.2).toFixed(1)}折`,
          dateLabel: route.direction === 'in' ? '2027-06-14 周一' : '2027-06-12 周六',
          image: `https://images.unsplash.com/${flightImage}?auto=format&fit=crop&w=900&q=75`,
          href: `/demo/products/flight-${id}`,
        })
      }

      for (let option = 0; option < 2; option += 1) {
        const id = `${routeId}-${option + 1}`
        const trainHours = 3 + (Math.abs(cityIndex - hubIndex) % 9)
        products.push({
          id: `train-${id}`,
          type: 'train',
          destination: city.name,
          origin: route.origin,
          arrivalCity: route.destination,
          direction: route.direction,
          title: `G${1220 + (hubIndex * 17 + cityIndex * 7 + routeIndex * 3 + option * 2) % 700} · ${route.origin} → ${route.destination}`,
          detail: `${formatTime((8 + hubIndex % 8 + routeIndex * 4 + option * 3) * 60 + 6)} 出发 · 约 ${trainHours} 小时`,
          departTime: formatTime((8 + hubIndex % 8 + routeIndex * 4 + option * 3) * 60 + 6),
          arriveTime: formatTime((8 + hubIndex % 8 + routeIndex * 4 + option * 3) * 60 + 6 + trainHours * 60),
          travelDate: route.direction === 'in' ? '2027-06-14' : '2027-06-12',
          price: 198 + ((cityIndex * 23 + hubIndex * 13) % 8) * 64 + option * 42,
          unit: '元/人起',
          provider: '铁路出行',
          image: `https://images.unsplash.com/${trainImage}?auto=format&fit=crop&w=900&q=75`,
          href: `/demo/products/train-${id}`,
        })
      }
    })

    existingCapitalPairs.add([city.name, hub.name].sort().join('|'))
  }
}

for (const city of hotelDestinations) {
  hotelNames.forEach((name, index) => products.push({
    id: `hotel-${city.code}-${index + 1}`,
    type: 'hotel',
    destination: city.name,
    title: `${city.name}${name}`,
    detail: hotelDetails[index],
    checkInStart: '2027-06-12',
    checkInEnd: '2027-06-19',
    checkOutLimit: '2027-06-20',
    price: 328 + index * 82,
    unit: '元/晚起',
    provider: hotelProviders[index],
    image: `https://images.unsplash.com/${hotelImages[index % hotelImages.length]}?auto=format&fit=crop&w=900&q=75`,
    href: `/demo/products/hotel-${city.code}-${index + 1}`,
  }))
}

mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), products }, null, 2)}\n`)
console.log(`Generated ${products.length} simulated products at ${output}`)
