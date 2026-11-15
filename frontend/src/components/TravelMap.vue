<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ArrowRight, BusFront, Check, ChevronRight, Clock3, Heart, Hotel, Layers,
  LocateFixed, MapPin, Minus, Plus, Search, Ticket, Utensils, X,
} from 'lucide-vue-next'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './travel-map.css'

const props = defineProps({
  favorites: { type: Array, default: () => [] },
  plans: { type: Array, default: () => [] },
})
const emit = defineEmits(['add-plan'])

const mapElement = ref(null)
const query = ref('')
const activeFilter = ref('全部')
const activeDayIndex = ref(0)
const activePointId = ref('')
const routePanelOpen = ref(false)
const layerMenuOpen = ref(false)
const showRouteLine = ref(true)
const showPlaceMarkers = ref(true)
const baseMapStatus = ref('loading')
let map
let tileLayer
let markerLayer
let routeLayer
let resizeObserver

const mapPoints = [
  { id: 'broken-bridge', name: '断桥残雪', category: '景点', coordinates: [30.2596, 120.1574], detail: '西湖经典步道 · 适合清晨漫步', area: '北山街', color: '#1687d5' },
  { id: 'pinghu-autumn', name: '平湖秋月', category: '景点', coordinates: [30.2558, 120.1425], detail: '西湖西北岸 · 可衔接白堤漫步', area: '孤山路', color: '#1687d5' },
  { id: 'louwailou', name: '楼外楼', category: '美食', coordinates: [30.2561, 120.1451], detail: '孤山路餐饮点 · 营业信息以现场为准', area: '孤山路', color: '#df8a43' },
  { id: 'lakeside-hotel', name: '杭州湖滨亚朵酒店', category: '酒店', coordinates: [30.2551, 120.1648], detail: '湖滨商圈 · 临近西湖', area: '湖滨商圈', color: '#4a9b76', order: '模拟已订酒店' },
  { id: 'lingyin', name: '灵隐寺', category: '景点', coordinates: [30.2406, 120.1018], detail: '飞来峰景区 · 建议预留半天', area: '灵隐', color: '#1687d5' },
  { id: 'sudi', name: '苏堤', category: '景点', coordinates: [30.2451, 120.1431], detail: '湖山步行路线 · 可根据体力调整', area: '西湖西南岸', color: '#1687d5' },
  { id: 'leifeng', name: '雷峰塔', category: '景点', coordinates: [30.2319, 120.1485], detail: '南屏山景区 · 参观时段请自行核实', area: '南山路', color: '#1687d5' },
  { id: 'hefang', name: '河坊街', category: '景点', coordinates: [30.2419, 120.1717], detail: '历史街区 · 适合安排在傍晚', area: '清河坊', color: '#1687d5' },
  { id: 'boat-pier', name: '西湖游船码头', category: '交通', coordinates: [30.2472, 120.1516], detail: '湖滨公园码头 · 可搭乘西湖游船', area: '湖滨公园', color: '#6476c8', order: '模拟已订门票' },
  { id: 'east-station', name: '杭州东站', category: '交通', coordinates: [30.2901, 120.2122], detail: '铁路出行枢纽', area: '天城路', color: '#6476c8' },
  { id: 'airport', name: '杭州萧山国际机场', category: '交通', coordinates: [30.2361, 120.4346], detail: '萧山区主要航空枢纽', area: '萧山区', color: '#6476c8', order: '模拟已订机票' },
  { id: 'xixi', name: '西溪国家湿地公园', category: '景点', coordinates: [30.2732, 120.0674], detail: '湿地游览区 · 入口与开放信息请自行核实', area: '天目山路', color: '#1687d5' },
]

const routeDays = [
  { date: '6月12日', label: '湖滨初见', pointIds: ['lakeside-hotel', 'broken-bridge', 'pinghu-autumn', 'louwailou'] },
  { date: '6月13日', label: '山寺湖景', pointIds: ['lingyin', 'sudi', 'leifeng', 'lakeside-hotel'] },
  { date: '6月14日', label: '宋韵街巷', pointIds: ['hefang', 'boat-pier', 'lakeside-hotel'] },
  { date: '6月15日', label: '返程出发', pointIds: ['lakeside-hotel', 'airport'] },
]

const mapFilters = [
  { label: '全部', icon: MapPin },
  { label: '景点', icon: MapPin },
  { label: '酒店', icon: Hotel },
  { label: '美食', icon: Utensils },
  { label: '交通', icon: BusFront },
  { label: '收藏', icon: Heart },
  { label: '订单', icon: Ticket },
]
const activeDay = computed(() => routeDays[activeDayIndex.value])
const activeStops = computed(() => activeDay.value.pointIds
  .map(id => mapPoints.find(point => point.id === id))
  .filter(Boolean))
const selectedPoint = computed(() => visiblePoints.value.find(point => point.id === activePointId.value) || null)
const selectedPointPlanned = computed(() => selectedPoint.value && props.plans.some(plan => plan.id === `map-${selectedPoint.value.id}`))
const visiblePoints = computed(() => {
  const normalizedQuery = query.value.trim().toLowerCase()
  return mapPoints.filter(point => {
    const matchesFilter = activeFilter.value === '全部'
      || (activeFilter.value === '订单' ? Boolean(point.order) : activeFilter.value === '收藏'
        ? props.favorites.some(item => `${item.title} ${item.detail}`.includes(point.name) || point.name.includes(item.title))
        : point.category === activeFilter.value)
    const matchesQuery = !normalizedQuery || `${point.name} ${point.category} ${point.area} ${point.detail}`.toLowerCase().includes(normalizedQuery)
    return matchesFilter && matchesQuery
  })
})
const routeNumber = id => activeStops.value.findIndex(point => point.id === id) + 1

function buildMarkerIcon(point) {
  const marker = document.createElement('div')
  marker.className = `travel-map-marker${point.id === activePointId.value ? ' is-selected' : ''}`
  marker.style.setProperty('--marker-color', point.color)

  const badge = document.createElement('span')
  badge.className = 'travel-map-marker-badge'
  const number = routeNumber(point.id)
  badge.textContent = number ? String(number) : point.category === '酒店' ? '住' : point.category === '美食' ? '食' : '景'

  const label = document.createElement('span')
  label.className = 'travel-map-marker-label'
  label.textContent = point.name
  marker.append(badge, label)

  return L.divIcon({
    className: 'travel-map-marker-icon',
    html: marker.outerHTML,
    iconSize: [108, 58],
    iconAnchor: [54, 23],
  })
}

function drawMapLayers() {
  if (!map || !markerLayer || !routeLayer) return
  markerLayer.clearLayers()
  routeLayer.clearLayers()

  if (showRouteLine.value) {
    const coordinates = activeStops.value.map(point => point.coordinates)
    if (coordinates.length > 1) {
      L.polyline(coordinates, {
        color: '#f28c38',
        weight: 5,
        opacity: 0.88,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: '1 9',
      }).addTo(routeLayer)
    }
  }

  if (!showPlaceMarkers.value) return
  for (const point of visiblePoints.value) {
    const marker = L.marker(point.coordinates, {
      icon: buildMarkerIcon(point),
      title: point.name,
      alt: point.name,
      keyboard: true,
      riseOnHover: true,
    }).addTo(markerLayer)
    marker.on('click', () => { activePointId.value = point.id })
  }
}

function selectPoint(point, panToPoint = true) {
  activePointId.value = point.id
  if (panToPoint && map) map.flyTo(point.coordinates, Math.max(map.getZoom(), 13), { duration: 0.45 })
}

function selectDay(index) {
  activeDayIndex.value = index
  const stops = routeDays[index].pointIds.map(id => mapPoints.find(point => point.id === id)).filter(Boolean)
  if (stops.length && map) {
    map.fitBounds(L.latLngBounds(stops.map(point => point.coordinates)), {
      paddingTopLeft: [72, 110],
      paddingBottomRight: [72, 80],
      maxZoom: 13,
      animate: true,
      duration: 0.5,
    })
    activePointId.value = stops[0].id
  }
}

function addSelectedPoint() {
  if (!selectedPoint.value || selectedPoint.value.order || selectedPointPlanned.value) return
  const point = selectedPoint.value
  emit('add-plan', {
    id: `map-${point.id}`,
    channel: '旅游地图',
    title: point.name,
    detail: point.detail,
    price: '行程建议',
    note: '杭州地图地点 · 未预订计划',
    index: mapPoints.findIndex(item => item.id === point.id),
    date: activeDay.value.date,
  })
}

function zoomIn() { map?.zoomIn() }
function zoomOut() { map?.zoomOut() }
function locateRoute() {
  if (map) selectDay(activeDayIndex.value)
}

onMounted(async () => {
  if (!mapElement.value) return
  map = L.map(mapElement.value, {
    zoomControl: false,
    attributionControl: true,
    scrollWheelZoom: true,
    preferCanvas: true,
    minZoom: 5,
    maxZoom: 18,
  }).setView([30.253, 120.151], 12.5)
  map.attributionControl.setPrefix(false)

  const tileUrl = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
  tileLayer = L.tileLayer(tileUrl, {
    maxZoom: 19,
    updateWhenIdle: true,
    keepBuffer: 2,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
  })
  let initialTileErrors = 0
  let initialLoadComplete = false
  tileLayer.once('load', () => {
    initialLoadComplete = true
    baseMapStatus.value = initialTileErrors ? 'error' : 'ready'
  })
  tileLayer.on('tileerror', () => {
    if (!initialLoadComplete) initialTileErrors += 1
  })
  tileLayer.addTo(map)

  markerLayer = L.layerGroup().addTo(map)
  routeLayer = L.layerGroup().addTo(map)
  await nextTick()
  map.invalidateSize()
  drawMapLayers()
  resizeObserver = new ResizeObserver(() => map?.invalidateSize({ pan: false }))
  resizeObserver.observe(mapElement.value)
})

watch([visiblePoints, activeDayIndex, activePointId, showRouteLine, showPlaceMarkers], () => {
  nextTick(drawMapLayers)
}, { deep: true })
watch(visiblePoints, points => {
  if (!points.some(point => point.id === activePointId.value)) activePointId.value = ''
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  map?.remove()
  map = null
})
</script>

<template>
  <section class="product-channel travel-map-channel" aria-label="杭州旅游地图">
    <div ref="mapElement" class="travel-map-canvas" role="application" aria-label="可拖动与缩放的杭州地图"></div>

    <div v-if="baseMapStatus === 'loading'" class="travel-map-loading" role="status">
      <span></span>正在载入地图
    </div>
    <div v-else-if="baseMapStatus === 'error'" class="travel-map-loading is-error" role="status">
      地图底图暂不可用，请检查网络连接
    </div>

    <div class="travel-map-toolbar">
      <label class="travel-map-search">
        <Search :size="20" />
        <input v-model="query" aria-label="搜索杭州地点" placeholder="搜索杭州地点、酒店或路线" />
        <button v-if="query" type="button" aria-label="清空搜索" @click="query = ''"><X :size="17" /></button>
      </label>
      <nav class="travel-map-filters" aria-label="地图地点分类">
        <button
          v-for="item in mapFilters"
          :key="item.label"
          type="button"
          :class="{ selected: activeFilter === item.label }"
          :aria-pressed="activeFilter === item.label"
          @click="activeFilter = item.label"
        >
          <component :is="item.icon" :size="17" />
          <span>{{ item.label }}</span>
        </button>
      </nav>
      <button class="travel-map-route-toggle" type="button" :aria-expanded="routePanelOpen" @click="routePanelOpen = !routePanelOpen">
        <MapPin :size="18" /><span>我的线路</span><span class="travel-map-route-count">4天</span>
      </button>
    </div>

    <div v-if="layerMenuOpen" class="travel-map-layer-menu">
      <label><input v-model="showRouteLine" type="checkbox" /> 行程线路</label>
      <label><input v-model="showPlaceMarkers" type="checkbox" /> 地点标注</label>
      <button type="button" @click="layerMenuOpen = false">完成</button>
    </div>

    <div class="travel-map-controls" aria-label="地图控制">
      <button type="button" aria-label="地图图层" :aria-pressed="layerMenuOpen" @click="layerMenuOpen = !layerMenuOpen"><Layers :size="21" /></button>
      <button type="button" aria-label="定位当前线路" @click="locateRoute"><LocateFixed :size="21" /></button>
      <i></i>
      <button type="button" aria-label="放大地图" @click="zoomIn"><Plus :size="21" /></button>
      <button type="button" aria-label="缩小地图" @click="zoomOut"><Minus :size="21" /></button>
    </div>

    <article v-if="selectedPoint && !routePanelOpen" class="travel-map-place">
      <div class="travel-map-place-top">
        <span :style="{ '--marker-color': selectedPoint.color }">{{ selectedPoint.category }}</span>
        <button type="button" aria-label="关闭地点详情" @click="activePointId = ''"><X :size="16" /></button>
      </div>
      <h2>{{ selectedPoint.name }}</h2>
      <p>{{ selectedPoint.detail }}</p>
      <div class="travel-map-place-meta"><MapPin :size="14" />{{ selectedPoint.area }}<span>{{ activeDay.date }} · {{ activeDay.label }}</span></div>
      <div v-if="selectedPoint.order" class="travel-map-booking-state"><Check :size="15" />{{ selectedPoint.order }} · 订单事实</div>
      <button v-else-if="selectedPointPlanned" class="travel-map-add-button is-added" type="button" disabled><Check :size="17" />已加入行程</button>
      <button v-else class="travel-map-add-button" type="button" @click="addSelectedPoint"><Plus :size="18" />加入未预订计划</button>
    </article>

    <aside v-if="routePanelOpen" class="travel-map-route-panel">
      <div class="travel-map-panel-heading">
        <div><span>HANGZHOU · MY TRIP</span><h2>我的线路</h2><p>2027年6月12日—15日</p></div>
        <button type="button" aria-label="关闭我的线路" @click="routePanelOpen = false"><X :size="20" /></button>
      </div>
      <div class="travel-map-day-tabs" role="tablist" aria-label="选择出行日期">
        <button v-for="(day, index) in routeDays" :key="day.date" type="button" role="tab" :aria-selected="activeDayIndex === index" :class="{ selected: activeDayIndex === index }" @click="selectDay(index)">
          <span>{{ day.date }}</span><strong>{{ day.label }}</strong>
        </button>
      </div>
      <div class="travel-map-route-summary"><span><MapPin :size="16" />{{ activeStops.length }} 个地点</span><span><Clock3 :size="15" />按顺序串联 · 路线示意</span></div>
      <ol class="travel-map-stop-list">
        <li v-for="(point, index) in activeStops" :key="point.id">
          <button type="button" :class="{ selected: activePointId === point.id }" @click="selectPoint(point)">
            <span class="travel-map-stop-number">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="travel-map-stop-copy"><strong>{{ point.name }}</strong><small>{{ point.area }} · {{ point.category }}</small></span>
            <span v-if="point.order" class="travel-map-stop-status">{{ point.order }}</span>
            <ChevronRight :size="17" />
          </button>
        </li>
      </ol>
      <div class="travel-map-panel-note"><Ticket :size="15" />已订订单保持不变；未标注订单的地点仅为路线建议。</div>
      <button class="travel-map-panel-action" type="button" @click="routePanelOpen = false">返回地图 <ArrowRight :size="16" /></button>
    </aside>

    <div v-if="!visiblePoints.length" class="travel-map-empty">
      <Search :size="22" /><strong>没有找到对应地点</strong><button type="button" @click="query = ''; activeFilter = '全部'">清除筛选</button>
    </div>

    <div class="travel-map-credit">
      <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">报告地图问题 <ChevronRight :size="13" /></a>
    </div>
  </section>
</template>
