<script setup>
import InteractiveHoverButton from './components/ui/InteractiveHoverButton.vue'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import ProductChannel from './components/ProductChannel.vue'
import ProjectAssistant from './components/ProjectAssistant.vue'
import HomeHero from './components/HomeHero.vue'
import OrderDetail from './components/OrderDetail.vue'
import { alertNavigationTarget } from './alert-navigation.js'
import { localDate, orderStatus, sortOrders } from './order-status.js'
import demoAvatar from './assets/demo-avatar.svg'
import westLakeImage from './assets/west-lake.webp'
import {
  ArrowRight, Bell, BookOpen, CalendarDays, Check, CircleAlert,
  CircleHelp, Clock3, Compass, Heart, Hotel, Map as MapIcon, MapPin, Menu, Plane, RotateCcw, Search,
  Sparkles, Ticket, TrainFront, Wallet, X,
} from 'lucide-vue-next'

const activeNav = ref('首页')
const channelIntro = ref(false)
let channelIntroTimer
const pendingTripAlerts = ref(0)
const tripWarning = ref(null)
const bookingAlerts = ref([])
const alertsOpen = ref(false)
const locallyReadAlertIds = new Set()
const unreadBookingAlerts = computed(() => bookingAlerts.value.filter(
  alert => alert.status === 'pending' && !alert.readAt && !locallyReadAlertIds.has(alert.id),
))
const unreadHardAlerts = computed(() => unreadBookingAlerts.value.filter(alert => alert.severity === 'hard'))
const assistantOpen = ref(false)
const assistantProjectId = ref('')
const navCollapsed = ref(false)
watch(assistantOpen, (open) => {
  if (open) window.scrollTo({ top: 0 })
}, { flush: 'sync' })
const notice = ref('')
const searchQuery = ref('')
const phase = ref('overview')
const productPage = ref('home')
const searchRoute = ref(null)
const isSearchResultsPage = ref(false)
const productRouteId = ref('')
const productRouteMode = ref('detail')
const productReturnHash = ref('')
function readSaved(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}
const legacyPlansKey = 'trip-demo-plans'
function readLegacyPlans() {
  const items = readSaved(legacyPlansKey)
  return Array.isArray(items) ? items.filter(item => item && typeof item.id === 'string') : []
}
const plannedItems = ref(readLegacyPlans())
const legacyPlanSyncError = ref('')
const legacyPlanSyncBusy = ref(false)
let planStateVersion = 0
let planMutationQueue = Promise.resolve()
function enqueuePlanMutation(action) {
  const operation = planMutationQueue.then(action, action)
  planMutationQueue = operation.catch(() => {})
  return operation
}
function mergePlans(serverPlans, localPlans = readLegacyPlans()) {
  const byId = new Map(localPlans.map(item => [item.id, item]))
  for (const item of serverPlans) byId.set(item.id, item)
  return [...byId.values()]
}
function replacePlan(item) {
  plannedItems.value = [...plannedItems.value.filter(saved => saved.id !== item.id), item]
}
function removeLegacyPlanIfUnchanged(item) {
  const latest = readLegacyPlans()
  const remaining = latest.filter(saved => saved.id !== item.id || JSON.stringify(saved) !== JSON.stringify(item))
  localStorage.setItem(legacyPlansKey, JSON.stringify(remaining))
  return remaining
}
const favorites = ref(readSaved('trip-demo-favorites'))
const orderFilter = ref('全部订单')
const customerOrders = ref([])
const orderRouteId = ref('')
const currentOrder = computed(() => customerOrders.value.find(order => order.id === orderRouteId.value))
const orderItems = computed(() => {
  const today = localDate()
  return sortOrders(customerOrders.value, today).map(order => ({
    id: order.id,
    type: ({ flight: '机票', train: '火车票', hotel: '酒店' })[order.type],
    title: order.title,
    detail: order.type === 'hotel'
      ? `${order.offerName ? `${order.offerName} · ` : ''}${order.checkIn} 入住 · ${order.checkOut} 退房 · ${order.nights} 晚 · ${order.rooms} 间 · ${order.guests} 人`
      : `${order.offerName ? `${order.offerName} · ` : ''}${order.travelDate} · ${order.origin} ${order.departTime} → ${order.arrivalCity} ${order.arriveTime} · ${order.passengers} 人`,
    code: order.orderCode,
    price: order.totalPrice,
    projectDestination: order.projectDestination,
    status: orderStatus(order, today),
    createdAt: order.createdAt,
  }))
})
const filteredOrders = computed(() => orderItems.value.filter(item => orderFilter.value === '全部订单' || item.type === orderFilter.value))
const selectedPlan = ref(0)
const busy = ref(false)
const error = ref('')
const confirmed = ref(false)
const processed = ref(false)
const steps = ['影响分析', '方案比较', '确认方案', '办理结果']
const currentStep = computed(() => ({ overview: -1, impact: 0, options: 1, confirm: 2, result: 3 }[phase.value]))
let alertRefreshTimer
const seenTripAlertIds = new Set()

async function refreshTripAlerts() {
  try {
    const [response, alertsResponse] = await Promise.all([fetch('/api/projects'), fetch('/api/alerts')])
    if (!response.ok || !alertsResponse.ok) return
    const [data, alertsData] = await Promise.all([response.json(), alertsResponse.json()])
    const previous = bookingAlerts.value
    const next = alertsData.alerts || []
    bookingAlerts.value = next
    if (next.some(alert => alert.id === tripWarning.value?.id && alert.status === 'resolved')) {
      tripWarning.value = null
    }
    const signature = alert => JSON.stringify([alert.status, alert.readAt, alert.details, alert.projectId])
    const oldById = new Map(previous.map(alert => [alert.id, alert]))
    const changedProjects = new Set()
    for (const alert of next) {
      const old = oldById.get(alert.id)
      if (!old || signature(old) !== signature(alert)) {
        if (old?.projectId) changedProjects.add(old.projectId)
        if (alert.projectId) changedProjects.add(alert.projectId)
      }
    }
    for (const projectId of changedProjects) {
      window.dispatchEvent(new CustomEvent('trip-alert-refresh', { detail: { projectId } }))
    }
    pendingTripAlerts.value = data.projects.reduce((sum, project) => sum + Number(project.pendingAssistantEvents || 0), 0)
    const bookingAlert = unreadHardAlerts.value.find(alert => !seenTripAlertIds.has(alert.id))
    if (bookingAlert) {
      seenTripAlertIds.add(bookingAlert.id)
      tripWarning.value = {
        id: bookingAlert.id, projectId: bookingAlert.projectId,
        destination: bookingAlert.projectDestination || '订单', details: bookingAlert.details,
      }
      return
    }
    const alertProject = data.projects.find(project =>
      project.latestAlertId && !locallyReadAlertIds.has(project.latestAlertId),
    )
    if (alertProject?.latestAlertId && !seenTripAlertIds.has(alertProject.latestAlertId)) {
      seenTripAlertIds.add(alertProject.latestAlertId)
      tripWarning.value = {
        id: alertProject.latestAlertId,
        projectId: alertProject.id,
        destination: alertProject.destination,
        details: alertProject.latestAlertDetails,
      }
    }
  } catch {}
}

async function markBookingAlertRead(alert) {
  if (alert.readAt) return
  const response = await fetch(`/api/alerts/${encodeURIComponent(alert.id)}/read`, { method: 'POST' })
  if (!response.ok) return
  locallyReadAlertIds.add(alert.id)
  if (tripWarning.value?.id === alert.id) tripWarning.value = null
  await refreshTripAlerts()
  window.dispatchEvent(new CustomEvent('trip-alert-refresh', { detail: { projectId: alert.projectId } }))
}
async function viewBookingAlert(alert) {
  await markBookingAlertRead(alert)
  alertsOpen.value = false
  const target = alertNavigationTarget(alert)
  if (target?.type === 'assistant') {
    history.pushState(null, '', `#${encodeURIComponent('AI行程助手')}?${new URLSearchParams({ project: target.projectId })}`)
    restoreRoute()
    return
  }
  if (!target) return
  await refreshCustomerOrders()
  navigateService('我的订单')
  await nextTick()
  openOrder(target.orderId)
}
function handleTripAlertRead(event) {
  const readAlertIds = new Set(event.detail?.alertIds || [])
  for (const id of readAlertIds) locallyReadAlertIds.add(id)
  if (tripWarning.value && (
    tripWarning.value.projectId === event.detail?.projectId
    || readAlertIds.has(tripWarning.value.id)
  )) tripWarning.value = null
  refreshTripAlerts()
}

async function refreshCustomerOrders() {
  try {
    const response = await fetch('/api/orders')
    if (response.ok) customerOrders.value = (await response.json()).orders || []
  } catch {}
}

function handleOrderCreated(result) {
  const createdOrders = result.orders || (result.order ? [result.order] : [])
  customerOrders.value = [...createdOrders, ...customerOrders.value.filter(order => !createdOrders.some(created => created.id === order.id))]
  if (result.conflict) refreshTripAlerts()
}

const plans = [
  { name: '费用优先', tag: '新增支出较低', total: '¥ 386', refund: '预计退 ¥ 420', detail: '改签至 14 日早班 · 酒店申请缩短一晚 · 门票改期', tone: 'green' },
  { name: '改动最少', tag: '行程更从容', total: '¥ 628', refund: '预计退 ¥ 280', detail: '改签至 14 日午班 · 酒店保留原订单 · 门票改期', tone: 'blue' },
  { name: '体验优先', tag: '保留更多安排', total: '¥ 912', refund: '预计退 ¥ 160', detail: '改签至 14 日晚班 · 保留灵隐寺 · 门票改期', tone: 'orange' },
]
const currentPlan = computed(() => plans[selectedPlan.value])
const serviceNav = [
  { label: '酒店', icon: Hotel },
  { label: '机票', icon: Plane },
  { label: '火车票', icon: TrainFront },
]
const discoveryNav = [
  { label: '旅游', icon: Compass },
  { label: '攻略·景点', display: '景点', icon: BookOpen },
  { label: '旅游地图', display: '地图', icon: MapIcon },
]
const displayChannelName = (channel) => ({ '攻略·景点': '景点', '旅游地图': '地图' })[channel] || channel
const productConfigs = {
  酒店: {
    title: '预订酒店', subtitle: '搜索目的地住宿',
    fields: [
      { key: 'destination', label: '目的地 / 酒店名称', value: '' },
      { key: 'dates', label: '入住 / 退房', value: '' },
      { key: 'guests', label: '房间及住客', value: '' },
      { key: 'keyword', label: '关键词（选填）', value: '' },
    ],
    samples: [
      ['杭州湖滨亚朵酒店', '湖滨商圈 · 含早餐 · 可免费取消', '¥ 468', '距西湖步行约 8 分钟', {
        area: '湖滨商圈', stars: 4, score: '4.8', grade: '超棒', reviews: '3120条评价', oldPrice: '¥ 528',
        image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=720&q=80',
      }],
      ['杭州西湖逸衡酒店', '西湖景区 · 双床房 · 含早餐 · 免费取消', '¥ 526', '距灵隐寺车程约 25 分钟', {
        area: '西湖景区', stars: 4, score: '4.9', reviews: '2640条评价', grade: '超棒', oldPrice: '¥ 598',
        image: 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=720&q=80',
      }],
      ['杭州武林广场全季酒店', '武林商圈 · 大床房 · 到店付款', '¥ 389', '地铁站步行约 5 分钟', {
        area: '武林广场', stars: 3, score: '4.7', grade: '很好', reviews: '4180条评价', oldPrice: '¥ 439',
        image: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=720&q=80',
      }],
      ['杭州灵隐禅意隐居酒店', '灵隐飞来峰 · 含早餐 · 庭院景观', '¥ 618', '步行可达灵隐景区入口', {
        area: '灵隐周边', stars: 5, score: '4.9', grade: '超棒', reviews: '1850条评价', oldPrice: '¥ 699',
        image: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=720&q=80',
      }],
      ['杭州西湖柳莺里君亭酒店', '南山路湖畔 · 免费取消 · 观景露台', '¥ 558', '紧邻柳浪闻莺与雷峰塔', {
        area: '西湖景区', stars: 4, score: '4.8', grade: '超棒', reviews: '2290条评价', oldPrice: '¥ 620',
        image: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=720&q=80',
      }],
      ['杭州湖滨银泰桔子水晶酒店', '湖滨商圈 · 智能客房 · 免费取消', '¥ 435', '龙翔桥地铁口步行约 4 分钟', {
        area: '湖滨商圈', stars: 4, score: '4.8', grade: '超棒', reviews: '3560条评价', oldPrice: '¥ 489',
        image: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=720&q=80',
      }],
    ],
  },
  机票: {
    title: '机票查询', subtitle: '比较往返航班与出行时间',
    fields: [
      { key: 'origin', label: '出发城市', value: '' },
      { key: 'destination', label: '到达城市', value: '' },
      { key: 'depart', label: '出发日期', value: '' },
      { key: 'return', label: '返程日期', value: '' },
    ],
    samples: [
      ['沈阳 → 杭州 · 直飞', '09:20 桃仙T3 — 11:45 萧山T4 · 约 2小时25分', '¥ 860', '航班 MF8062 · 经济舱 4.6折', {
        direction: 'out', code: 'MF8062', departTime: '09:20', arriveTime: '11:45', departPort: '沈阳桃仙 T3', arrivePort: '杭州萧山 T4', duration: '2h25m', stop: '直飞', discount: '4.6折', dateLabel: '2027-06-12 周六',
      }],
      ['沈阳 → 杭州 · 经停', '07:40 桃仙T3 — 12:55 萧山T3 · 经停青岛', '¥ 690', '航班 CZ6521 · 经济舱 3.7折', {
        direction: 'out', code: 'CZ6521', departTime: '07:40', arriveTime: '12:55', departPort: '沈阳桃仙 T3', arrivePort: '杭州萧山 T3', duration: '5h15m', stop: '经停青岛', discount: '3.7折', dateLabel: '2027-06-12 周六',
      }],
      ['杭州 → 沈阳 · 14日早班直飞', '08:35 萧山T4 — 11:05 桃仙T3 · 约 2小时30分', '¥ 780', '提前返程候选 · 对应「费用优先」时段', {
        direction: 'in', code: 'CA1753', departTime: '08:35', arriveTime: '11:05', departPort: '杭州萧山 T4', arrivePort: '沈阳桃仙 T3', duration: '2h30m', stop: '直飞', discount: '4.2折', dateLabel: '2027-06-14 周一',
      }],
      ['杭州 → 沈阳 · 14日午班直飞', '14:10 萧山T4 — 16:40 桃仙T3 · 约 2小时30分', '¥ 920', '提前返程候选 · 对应「改动最少」时段', {
        direction: 'in', code: 'HU7348', departTime: '14:10', arriveTime: '16:40', departPort: '杭州萧山 T4', arrivePort: '沈阳桃仙 T3', duration: '2h30m', stop: '直飞', discount: '4.9折', dateLabel: '2027-06-14 周一',
      }],
      ['杭州 → 沈阳 · 14日晚班直飞', '20:15 萧山T3 — 22:45 桃仙T3 · 约 2小时30分', '¥ 1050', '保留灵隐寺白天游览 · 对应「体验优先」时段', {
        direction: 'in', code: 'ZH9216', departTime: '20:15', arriveTime: '22:45', departPort: '杭州萧山 T3', arrivePort: '沈阳桃仙 T3', duration: '2h30m', stop: '直飞', discount: '5.6折', dateLabel: '2027-06-14 周一',
      }],
    ],
  },
  火车票: {
    title: '火车票查询', subtitle: '查看出发到达与席别信息',
    fields: [
      { key: 'origin', label: '出发站', value: '' },
      { key: 'destination', label: '到达站', value: '' },
      { key: 'depart', label: '乘车日期', value: '' },
      { key: 'return', label: '返程日期', value: '' },
      { key: 'passengers', label: '乘车人', value: '' },
    ],
    samples: [
      ['G1226 · 沈阳北 → 杭州东', '07:55 — 18:42 · 历时 10小时47分', '¥ 823', '二等座'],
      ['G1234 · 沈阳北 → 杭州东', '10:15 — 21:36 · 历时 11小时21分', '¥ 790', '二等座'],
      ['返程 · 杭州东 → 沈阳北', '6月14日可选车次 · 详情待核实', '¥ 806', '二等座'],
    ],
  },
  旅游: {
    title: '旅行目的地', subtitle: '按日期和天数浏览行程灵感',
    fields: [
      { key: 'destination', label: '目的地', value: '' },
      { key: 'dates', label: '出行日期', value: '' },
      { key: 'days', label: '出游天数', value: '' },
      { key: 'style', label: '旅行偏好', value: '' },
    ],
    samples: [
      ['大理古城与洱海', '古城街巷 · 湖畔骑行 · 苍山远眺', '半日', '行程建议 · 未预订', { destination: '大理' }],
      ['西安城墙与碑林', '古城步行 · 城墙骑行 · 历史街区', '半日', '行程建议 · 未预订', { destination: '西安' }],
      ['鼓浪屿街巷漫步', '历史建筑 · 海岸步道 · 轮渡出行', '2小时', '行程建议 · 未预订', { destination: '厦门' }],
    ],
  },
  '攻略·景点': {
    title: '景点', subtitle: '浏览不同目的地的旅行灵感与安排',
    fields: [
      { key: 'destination', label: '目的地', value: '' },
      { key: 'topic', label: '感兴趣的主题', value: '' },
      { key: 'dates', label: '计划日期', value: '' },
      { key: 'duration', label: '可用时长', value: '' },
    ],
    samples: [
      ['洱海与大理古城', '环湖慢行 · 古城街巷 · 苍山风景', '半日', '攻略建议 · 可加入未预订计划', { destination: '大理' }],
      ['西安城墙与古城漫步', '城墙步道 · 碑林街区 · 城市历史', '约 3 小时', '攻略建议 · 可加入未预订计划', { destination: '西安' }],
      ['鼓浪屿街巷与海岸', '历史建筑 · 岛上步行 · 海边风景', '约 2 小时', '攻略建议 · 可加入未预订计划', { destination: '厦门' }],
    ],
  },
  旅游地图: {
    title: '地图', subtitle: '以地点和路线组织景点，不提供实时导航',
    fields: [
      { key: 'destination', label: '城市', value: '' },
      { key: 'area', label: '区域', value: '' },
      { key: 'interest', label: '地点类型', value: '' },
      { key: 'date', label: '行程日期', value: '' },
    ],
    samples: [
      ['灵隐寺 → 西湖', '西北方向 · 建议预留景区交通时间', '约 7 km', '路线估算 · 非实时地图'],
      ['雷峰塔 → 河坊街', '南山路方向 · 可步行与公交组合', '约 3 km', '路线估算 · 非实时地图'],
      ['杭州东站 → 湖滨商圈', '地铁 1 号线 · 站点以实际运营为准', '约 9 km', '路线估算 · 非实时地图'],
    ],
  },
}

async function loadState() {
  try {
    const response = await fetch('/api/state')
    const data = await response.json()
    confirmed.value = Boolean(data.confirmed)
    processed.value = Boolean(data.processed)
    if (processed.value) phase.value = 'result'
    else if (confirmed.value) phase.value = 'confirm'
  } catch { error.value = '演示服务暂不可用，请确认服务已启动。' }
}

async function post(url, body = {}) {
  busy.value = true
  error.value = ''
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || '请求失败')
    confirmed.value = Boolean(data.confirmed)
    processed.value = Boolean(data.processed)
    return true
  } catch (err) {
    error.value = err.message
    return false
  } finally { busy.value = false }
}

async function processPlan() {
  if (await post('/api/confirm', { confirmed: true }) && await post('/api/process')) phase.value = 'result'
}
function choosePlan() {
  phase.value = 'confirm'
}
async function resetDemo() {
  if (!window.confirm('确定删除全部订单吗？对话、行程、计划和收藏将保留。此操作无法撤销。')) return
  try {
    const response = await fetch('/api/reset-orders', { method: 'POST' })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || '清除订单失败，请重试')
    customerOrders.value = []
    const deletedAlertIds = new Set(bookingAlerts.value.filter(alert => alert.orderId).map(alert => alert.id))
    bookingAlerts.value = bookingAlerts.value.filter(alert => !alert.orderId)
    if (deletedAlertIds.has(tripWarning.value?.id)) tripWarning.value = null
    if (orderRouteId.value) closeOrder()
    await refreshTripAlerts()
    for (const projectId of data.projectIds || []) {
      window.dispatchEvent(new CustomEvent('trip-alert-refresh', { detail: { projectId } }))
    }
    window.alert(`已删除 ${data.deleted} 个订单，对话和其他数据已保留。`)
  } catch (err) {
    window.alert(err.message || '清除订单失败，请重试')
  }
}
function startChange() {
  navigateService('AI行程助手')
}
function showNotice(message) {
  notice.value = message
}
function beginChannelIntro() {
  channelIntro.value = true
  window.clearTimeout(channelIntroTimer)
  channelIntroTimer = window.setTimeout(() => { channelIntro.value = false }, 2300)
}
function jumpTo(id, nav) {
  productPage.value = ''
  activeNav.value = nav
  notice.value = ''
  phase.value = 'overview'
  requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
}
function navigateService(label) {
  if (['计划', '购物车'].includes(label)) {
    goHome()
    return
  }
  if (label === '景点') label = '攻略·景点'
  if (label === '地图') label = '旅游地图'
  if (['门票·活动', '汽车·船票', '用车'].includes(label)) label = '酒店'
  orderRouteId.value = ''
  isSearchResultsPage.value = false
  searchRoute.value = null
  productRouteId.value = ''
  productRouteMode.value = 'detail'
  productReturnHash.value = ''
  if (label === 'AI行程助手') {
    assistantProjectId.value = ''
    assistantOpen.value = true
    productPage.value = ''
    activeNav.value = label
    notice.value = ''
    setRoute(label)
    return
  }
  const enterChannel = productPage.value === 'home' && ['旅游', '酒店'].includes(label)
  const updatePage = async () => {
    assistantOpen.value = false
    activeNav.value = label
    productPage.value = label
    notice.value = ''
    setRoute(label)
    window.scrollTo({ top: 0 })
    await nextTick()
    if (enterChannel) beginChannelIntro()
  }
  updatePage()
}
function searchDemo() {
  const query = searchQuery.value.trim()
  if (!query) return showNotice('请输入酒店、机票、火车票、景点或攻略关键词。')
  const channel = /火车|高铁/.test(query) ? '火车票' : /机票|航班|沈阳|返程/.test(query) ? '机票' : /门票|游船|宋城|攻略|灵隐|景点/.test(query) ? '攻略·景点' : '酒店'
  navigateService(channel)
  searchSeed.value = { query, nonce: Date.now() }
}
const searchSeed = ref(null)
function openSearchResults(search) {
  orderRouteId.value = ''
  assistantOpen.value = false
  activeNav.value = search.channel
  productPage.value = search.channel
  productRouteId.value = ''
  productRouteMode.value = 'detail'
  productReturnHash.value = ''
  searchRoute.value = search
  isSearchResultsPage.value = true
  notice.value = ''
  const params = new URLSearchParams({ channel: search.channel, tripType: search.tripType || '单程' })
  if (search.candidateId) params.set('candidateId', search.candidateId)
  if (search.returnHash) params.set('from', search.returnHash)
  for (const [key, value] of Object.entries(search.values || {})) {
    if (String(value || '').trim()) params.set(key, value)
  }
  history.pushState(search.returnHash ? { assistantResults: true } : null, '', `#results?${params.toString()}`)
  window.scrollTo({ top: 0 })
}
function openAssistantProduct({ resource, projectId }) {
  const returnHash = `#${encodeURIComponent('AI行程助手')}?${new URLSearchParams({ project: projectId })}`
  history.replaceState(null, '', returnHash)
  const channel = { flight: '机票', train: '火车票', hotel: '酒店' }[resource.type]
  if (resource.type === 'hotel') {
    assistantOpen.value = false
    activeNav.value = channel
    productPage.value = channel
    openProductRoute(resource.id)
  } else {
    openSearchResults({
      channel, tripType: '单程', candidateId: resource.id, returnHash,
      values: { origin: resource.origin, destination: resource.arrivalCity, depart: resource.travelDate },
    })
  }
}
function returnToAssistant() {
  const target = searchRoute.value?.returnHash
  if (!target) return
  if (history.state?.assistantResults) history.back()
  else {
    history.replaceState(null, '', target)
    restoreRoute()
  }
}
function productRouteUrl(id, mode, returnHash) {
  const params = new URLSearchParams({ channel: productPage.value, id, from: returnHash })
  return `#${mode === 'purchase' ? 'purchase' : 'product'}?${params.toString()}`
}
function openProductRoute(productId) {
  const returnHash = location.hash || `#${encodeURIComponent(productPage.value)}`
  productReturnHash.value = returnHash
  productRouteId.value = productId
  productRouteMode.value = 'detail'
  history.pushState({ productRoute: true, returnHash }, '', productRouteUrl(productId, 'detail', returnHash))
  window.scrollTo({ top: 0 })
}
function openPurchaseRoute() {
  productRouteMode.value = 'purchase'
  history.pushState(
    { productRoute: true, purchaseRoute: true, returnHash: productReturnHash.value },
    '',
    productRouteUrl(productRouteId.value, 'purchase', productReturnHash.value),
  )
  window.scrollTo({ top: 0 })
}
function openRoundtripPurchase(productId) {
  if (!productId) return
  const returnHash = productReturnHash.value || location.hash || `#${encodeURIComponent(productPage.value)}`
  productReturnHash.value = returnHash
  productRouteId.value = productId
  productRouteMode.value = 'purchase'
  history.pushState(
    { productRoute: true, purchaseRoute: true, returnHash },
    '',
    productRouteUrl(productId, 'purchase', returnHash),
  )
  window.scrollTo({ top: 0 })
}
function backToProductDetail() {
  if (history.state?.purchaseRoute) {
    history.back()
    return
  }
  productRouteMode.value = 'detail'
  history.replaceState(
    { productRoute: true, returnHash: productReturnHash.value },
    '',
    productRouteUrl(productRouteId.value, 'detail', productReturnHash.value),
  )
}
function closeProductRoute() {
  if (history.state?.productRoute) {
    history.back()
    return
  }
  const target = productReturnHash.value || `#${encodeURIComponent(productPage.value)}`
  history.replaceState(null, '', target)
  restoreRoute()
}
function editSearch() {
  isSearchResultsPage.value = false
  productRouteId.value = ''
  productRouteMode.value = 'detail'
  productReturnHash.value = ''
  history.replaceState(null, '', `#${encodeURIComponent(productPage.value)}`)
  window.scrollTo({ top: 0 })
}
function openOrder(id) {
  orderRouteId.value = id
  history.pushState({ orderRoute: true }, '', `#order?${new URLSearchParams({ id })}`)
  window.scrollTo({ top: 0 })
}
async function openConflictOrder(id) {
  await refreshCustomerOrders()
  navigateService('我的订单')
  await nextTick()
  openOrder(id)
}
function closeOrder() {
  if (history.state?.orderRoute) {
    history.back()
    return
  }
  history.replaceState(null, '', `#${encodeURIComponent('我的订单')}`)
  restoreRoute()
}
function updateOrder(order) {
  customerOrders.value = customerOrders.value.map(item => item.id === order.id ? order : item)
}
function bookAgain(order) {
  const channel = ({ flight: '机票', train: '火车票', hotel: '酒店' })[order.type]
  if (!channel) return
  navigateService(channel)
  openProductRoute(order.productId)
}
function setRoute(label) {
  history.pushState(null, '', label ? `#${encodeURIComponent(label)}` : location.pathname)
}
function restoreRoute() {
  let label = ''
  let routeQuery = ''
  try {
    const hash = location.hash.slice(1)
    const queryIndex = hash.indexOf('?')
    label = decodeURIComponent(queryIndex < 0 ? hash : hash.slice(0, queryIndex))
    routeQuery = queryIndex < 0 ? '' : hash.slice(queryIndex + 1)
  } catch {}
  if (label !== 'order') orderRouteId.value = ''
  if (label === 'order') {
    const id = new URLSearchParams(routeQuery).get('id')
    if (id) {
      orderRouteId.value = id
      assistantOpen.value = false
      productPage.value = '我的订单'
      activeNav.value = '我的订单'
      isSearchResultsPage.value = false
      notice.value = ''
      return
    }
  }
  if (!['product', 'purchase'].includes(label)) {
    productRouteId.value = ''
    productRouteMode.value = 'detail'
    productReturnHash.value = ''
  }
  if (label === 'results') {
    const params = new URLSearchParams(routeQuery)
    const channel = params.get('channel')
    if (productConfigs[channel]) {
      const values = Object.fromEntries(params.entries())
      delete values.channel
      delete values.tripType
      delete values.candidateId
      delete values.from
      searchRoute.value = { channel, values, tripType: params.get('tripType') || '单程', candidateId: params.get('candidateId') || '', returnHash: params.get('from') || '' }
      isSearchResultsPage.value = true
      assistantOpen.value = false
      productPage.value = channel
      activeNav.value = channel
      notice.value = ''
      return
    }
  }
  if (label === 'product' || label === 'purchase') {
    const params = new URLSearchParams(routeQuery)
    const channel = params.get('channel')
    const id = params.get('id')
    if (productConfigs[channel] && id) {
      productPage.value = channel
      activeNav.value = channel
      productRouteId.value = id
      productRouteMode.value = label === 'purchase' ? 'purchase' : 'detail'
      productReturnHash.value = params.get('from') || `#${encodeURIComponent(channel)}`
      searchRoute.value = null
      isSearchResultsPage.value = false
      assistantOpen.value = false
      notice.value = ''
      return
    }
  }
  productRouteId.value = ''
  productRouteMode.value = 'detail'
  productReturnHash.value = ''
  isSearchResultsPage.value = false
  searchRoute.value = null
  if (label === 'home-discover') {
    history.replaceState(null, '', location.pathname + location.search)
    label = ''
  }
  if (['计划', '购物车'].includes(label)) label = ''
  if (!label) {
    assistantOpen.value = false
    productPage.value = 'home'
    activeNav.value = '首页'
    notice.value = ''
    return
  }
  if (label === 'home') {
    assistantOpen.value = false
    productPage.value = 'home'
    activeNav.value = '首页'
    notice.value = ''
    return
  }
  if (['门票·活动', '汽车·船票', '用车'].includes(label)) label = '酒店'
  if (label === '景点') label = '攻略·景点'
  if (label === '地图') label = '旅游地图'
  assistantOpen.value = label === 'AI行程助手'
  assistantProjectId.value = assistantOpen.value ? new URLSearchParams(routeQuery).get('project') || '' : ''
  productPage.value = productConfigs[label] || ['我的订单', '收藏夹'].includes(label) ? label : ''
  activeNav.value = label || 'AI行程助手'
  if (label === 'AI行程助手') phase.value = 'impact'
  notice.value = ''
}
async function syncLegacyPlans() {
  if (legacyPlanSyncBusy.value) return
  legacyPlanSyncBusy.value = true
  legacyPlanSyncError.value = ''
  try {
    const version = planStateVersion
    const response = await fetch('/api/plans')
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || '无法读取待安排计划')
    const serverPlans = Array.isArray(data.items) ? data.items : []
    const legacyPlans = readLegacyPlans()
    if (version === planStateVersion) plannedItems.value = mergePlans(serverPlans, legacyPlans)
    for (const item of legacyPlans) {
      await enqueuePlanMutation(async () => {
        const result = await fetch('/api/plans', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(item),
        })
        const saved = await result.json()
        if (!result.ok) throw new Error(saved.error || `无法迁移「${item.title || item.id}」`)
        planStateVersion += 1
        replacePlan(saved.item)
        removeLegacyPlanIfUnchanged(item)
      })
    }
  } catch (failure) {
    legacyPlanSyncError.value = failure.message || '旧计划同步失败，请重试。'
    notice.value = legacyPlanSyncError.value
  } finally {
    legacyPlanSyncBusy.value = false
  }
}
async function savePlan(item) {
  try {
    await enqueuePlanMutation(async () => {
      const response = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(item),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '添加待安排计划失败')
      planStateVersion += 1
      replacePlan(data.item)
      notice.value = ''
    })
  } catch (failure) {
    notice.value = failure.message || '添加计划失败，请重试。'
  }
}
function toggleFavorite(item) {
  const index = favorites.value.findIndex(saved => saved.id === item.id)
  if (index < 0) favorites.value.push(item)
  else favorites.value.splice(index, 1)
  localStorage.setItem('trip-demo-favorites', JSON.stringify(favorites.value))
}
async function removePlan(id) {
  try {
    await enqueuePlanMutation(async () => {
      const response = await fetch(`/api/plans/${encodeURIComponent(id)}`, { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '移除待安排计划失败')
      planStateVersion += 1
      plannedItems.value = plannedItems.value.filter(item => item.id !== id)
      const latest = readLegacyPlans().filter(item => item.id !== id)
      localStorage.setItem(legacyPlansKey, JSON.stringify(latest))
      notice.value = ''
    })
  } catch (failure) {
    notice.value = failure.message || '移除计划失败，请重试。'
  }
}
function updateSavedPlan(item) {
  if (!item?.id) return
  planStateVersion += 1
  replacePlan(item)
}
function goHome() {
  orderRouteId.value = ''
  isSearchResultsPage.value = false
  searchRoute.value = null
  productRouteId.value = ''
  productRouteMode.value = 'detail'
  productReturnHash.value = ''
  assistantOpen.value = false
  productPage.value = 'home'
  setRoute('')
  phase.value = 'overview'
  activeNav.value = '首页'
  notice.value = ''
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
onMounted(async () => {
  await loadState()
  await syncLegacyPlans()
  await refreshCustomerOrders()
  restoreRoute()
  await refreshTripAlerts()
  alertRefreshTimer = window.setInterval(refreshTripAlerts, 15000)
  window.addEventListener('popstate', restoreRoute)
  window.addEventListener('trip-alert-read', handleTripAlertRead)
})
onUnmounted(() => {
  window.clearTimeout(channelIntroTimer)
  window.removeEventListener('popstate', restoreRoute)
  window.removeEventListener('trip-alert-read', handleTripAlertRead)
  window.clearInterval(alertRefreshTimer)
})
</script>

<template>
  <div class="app-shell" :class="{ 'nav-collapsed': navCollapsed, 'assistant-mode': assistantOpen, 'map-mode': productPage === '旅游地图' && !assistantOpen, 'home-mode': productPage === 'home' && !assistantOpen, 'channel-intro': channelIntro }">
    <aside class="side-rail">
      <button class="menu-toggle" :aria-label="navCollapsed ? '展开导航栏' : '收起导航栏'" :title="navCollapsed ? '展开导航栏' : '收起导航栏'" :aria-expanded="!navCollapsed" @click="navCollapsed = !navCollapsed"><Menu :size="21" /></button>
      <div class="rail-group">
        <button v-for="item in serviceNav" :key="item.label" class="rail-link" :aria-label="item.label" :title="item.label" :class="{ active: activeNav === item.label }" @click="navigateService(item.label)"><component :is="item.icon" :size="19" /><span>{{ item.label }}</span></button>
      </div>
      <div class="rail-group discovery-group">
        <button v-for="item in discoveryNav" :key="item.label" class="rail-link" :aria-label="item.display || item.label" :title="item.display || item.label" :class="{ active: activeNav === item.label }" @click="navigateService(item.label)"><component :is="item.icon" :size="19" /><span>{{ item.display || item.label }}</span></button>
      </div>
      <div class="rail-group misc-group">
        <button class="rail-link" aria-label="AI行程助手" title="AI行程助手" :class="{ active: activeNav === 'AI行程助手' }" @click="navigateService('AI行程助手')"><Sparkles :size="19" /><span>AI行程助手</span><span v-if="pendingTripAlerts" class="rail-alert-dot" :aria-label="`${pendingTripAlerts} 条待查看提醒`"></span></button>
        <button class="rail-link" aria-label="收藏夹" title="收藏夹" :class="{ active: activeNav === '收藏夹' }" @click="navigateService('收藏夹')"><Heart :size="19" /><span>收藏夹</span></button>
        <button class="rail-link" aria-label="我的订单" title="我的订单" :class="{ active: activeNav === '我的订单' }" @click="navigateService('我的订单')"><CalendarDays :size="19" /><span>我的订单</span><span v-if="unreadHardAlerts.length" class="rail-alert-dot" aria-label="有未读订单冲突"></span></button>
      </div>
    </aside>
    <div class="demo-strip"><span><Sparkles :size="14" /> 课程演示 · 商品、价格与订单为演示数据</span><button @click="resetDemo"><RotateCcw :size="14" /> 重置演示</button></div>
    <header class="topbar" :class="{ 'alerts-open': alertsOpen }">
      <button class="brand" @click="goHome"><span class="brand-mark"><Compass :size="24" /></span><span>携程旅行</span></button>
      <label class="global-search"><Search :size="18" /><input v-model="searchQuery" aria-label="搜索旅行相关" placeholder="搜索酒店、机票、景点和攻略" @keydown.enter="searchDemo" /><button aria-label="搜索" @click.prevent="searchDemo"><Search :size="19" /></button></label>
      <div class="account">
        <div class="account-profile" aria-label="当前用户：用户1234"><img class="account-avatar" :src="demoAvatar" alt="虚构用户头像" /><span>用户1234</span></div>
        <i></i>
        <a class="order-link account-action" :href="`#${encodeURIComponent('我的订单')}`" :aria-current="productPage === '我的订单' && !orderRouteId ? 'page' : undefined" @click.left.exact.prevent="navigateService('我的订单')">我的订单</a>
        <i></i>
        <button type="button" class="account-action" @click="showNotice('客服入口未接入。办理结果和待回复事项会直接显示在行程页面。')">联系客服</button>
        <i></i>
        <div class="alerts-anchor"><button type="button" class="icon-button account-action" aria-label="消息" :aria-expanded="alertsOpen" @click="alertsOpen = !alertsOpen"><Bell :size="18" /><span v-if="unreadBookingAlerts.length || pendingTripAlerts" class="alerts-dot"></span></button><section v-if="alertsOpen" class="alerts-popover" aria-label="消息通知"><div class="alerts-heading"><strong>消息通知</strong><button aria-label="关闭消息" @click="alertsOpen = false"><X :size="16" /></button></div><p v-if="!bookingAlerts.length" class="alerts-empty">暂无提醒</p><button v-for="alert in bookingAlerts" :key="alert.id" class="alert-item" @click="viewBookingAlert(alert)"><span :class="{ 'alert-unread': !alert.readAt && alert.status === 'pending' }"><strong>{{ alert.title }}</strong><small>{{ alert.orderTitle || alert.projectDestination || (alert.code === 'assistant_reply' ? '行程助手回复' : '') }}</small><span>{{ alert.details }}</span></span></button></section></div>
      </div>
    </header>

    <Transition name="notice">
      <div v-if="(notice || legacyPlanSyncError) && productPage !== 'home'" class="nav-notice global-notice" role="status"><span>{{ notice || legacyPlanSyncError }}</span><button v-if="legacyPlanSyncError" type="button" :disabled="legacyPlanSyncBusy" @click="syncLegacyPlans">{{ legacyPlanSyncBusy ? '正在重试…' : '重试同步' }}</button><button aria-label="关闭提示" @click="notice = ''"><X :size="16" /></button></div>
    </Transition>
    <Transition name="alert">
    <div v-if="tripWarning" class="trip-warning" role="alert">
      <span class="trip-warning-icon"><CircleAlert :size="18" /></span>
      <div><strong>{{ tripWarning.destination }}行程需要确认</strong><p>{{ tripWarning.details }}</p></div>
      <button aria-label="关闭提醒" title="关闭提醒" @click="bookingAlerts.find(alert => alert.id === tripWarning.id) ? markBookingAlertRead(bookingAlerts.find(alert => alert.id === tripWarning.id)) : tripWarning = null"><X :size="17" /></button>
    </div>
    </Transition>
    <Transition :name="productPage === '旅游地图' && !assistantOpen ? 'workspace-map' : 'workspace'" mode="out-in">
    <div v-if="assistantOpen" key="assistant" class="assistant-container"><ProjectAssistant :key="assistantProjectId || 'assistant'" :initial-project-id="assistantProjectId" @open-product="openAssistantProduct" @open-order="openConflictOrder" /></div>
    <main v-else key="channels" :class="{ 'channel-main': productPage && productPage !== 'home' }">
      <div v-if="channelIntro && productPage !== 'home'" class="channel-gradient-cover" aria-hidden="true"></div>
      <HomeHero v-if="productPage === 'home'" key="home" @navigate="navigateService" />
      <template v-else-if="productPage">
        <ProductChannel v-if="productConfigs[productPage]" :key="productPage" :channel="productPage" :config="productConfigs[productPage]" :favorites="favorites" :plans="plannedItems" :search-seed="searchSeed" :result-view="isSearchResultsPage" :search-state="searchRoute" :product-route-id="productRouteId" :product-route-mode="productRouteMode" :product-return-hash="productReturnHash" @search="openSearchResults" @edit-search="editSearch" @return-assistant="returnToAssistant" @product-open="openProductRoute" @purchase-open="openPurchaseRoute" @roundtrip-purchase="openRoundtripPurchase" @purchase-back="backToProductDetail" @product-close="closeProductRoute" @add-plan="savePlan" @favorite="toggleFavorite" @home="goHome" @navigate="navigateService" @open-assistant="startChange" @view-trip="goHome" @order-created="handleOrderCreated" />
        <OrderDetail v-else-if="productPage === '我的订单' && orderRouteId" :order="currentOrder" @back="closeOrder" @updated="updateOrder" @book-again="bookAgain" />
        <section v-else :key="productPage" class="personal-page">
          <h1>{{ productPage }}</h1>
          <template v-if="productPage === '我的订单'">
            <div class="channel-tabs" aria-label="订单类型"><button v-for="tab in ['全部订单', '机票', '火车票', '酒店']" :key="tab" :class="{ selected: orderFilter === tab }" @click="orderFilter = tab">{{ tab }}</button></div>
            <article v-for="(item, index) in filteredOrders" :key="item.code" v-reveal="{ delay: Math.min(index, 3) * 80, variant: index < 3 ? (index % 2 ? 'right' : 'left') : 'fade' }" class="personal-card"><div><span class="confirmed-tag">{{ item.status }}</span><small> {{ item.code }}</small><h3>{{ item.title }}</h3><p>{{ item.detail }}</p><p v-if="item.projectDestination">关联行程：{{ item.projectDestination }}</p><button v-for="alert in bookingAlerts.filter(entry => entry.orderId === item.id && entry.severity === 'hard' && entry.status === 'pending')" :key="alert.id" class="order-alert" @click="markBookingAlertRead(alert)">{{ alert.readAt ? '' : '● ' }}{{ alert.details }}</button><b v-if="item.price">¥ {{ Number(item.price).toLocaleString('zh-CN') }}</b></div><InteractiveHoverButton class="outline-button" @click="openOrder(item.id)" variant="outline">查看订单详情</InteractiveHoverButton></article>
          </template>
          <template v-else>
            <div v-if="!favorites.length" class="channel-empty"><Heart :size="34" /><h2>还没有收藏的产品</h2><p>在频道中点收藏，方便之后比较和查看。</p><InteractiveHoverButton class="primary-button" @click="navigateService('酒店')" variant="solid">去看看酒店</InteractiveHoverButton></div>
            <article v-for="(item, index) in favorites" :key="item.id" v-reveal="{ delay: Math.min(index, 3) * 80, variant: index < 3 ? (index % 2 ? 'right' : 'left') : 'fade' }" class="personal-card"><div><small>{{ displayChannelName(item.channel) }}</small><h3>{{ item.title }}</h3><p>{{ item.detail }}</p><b>{{ item.price }}</b></div><div class="personal-actions"><InteractiveHoverButton class="outline-button" @click="navigateService(item.channel)" variant="outline">查看所属频道</InteractiveHoverButton><button class="text-button" @click="toggleFavorite(item)">取消收藏</button></div></article>
          </template>
        </section>
      </template>
      <template v-else>
      <section v-reveal="{ variant: 'right', delay: 80 }" class="destination-hero">
        <img :src="westLakeImage" alt="杭州西湖与雷峰塔" />
        <div class="hero-shade"></div>
        <div class="hero-content">
          <div class="eyebrow">MY TRIPS · 杭州之旅</div>
          <h1>山水有约，<em>行程有序。</em></h1>
          <p>沈阳往返杭州 · 4 天 3 晚 · 1 位出行人</p>
          <div class="trip-date"><MapPin :size="15" /> 2027年6月12日 — 6月15日 <span></span> <Plane :size="15" /> 往返已安排</div>
        </div>
        <div class="hero-stamp">行程<br /><b>进行中</b></div>
      </section>

      <div class="workspace">
        <section class="trip-content">
          <div class="content-heading">
            <div><div class="section-kicker">YOUR HANGZHOU JOURNEY</div><h2>杭州行程 <span class="order-count">3 项已订</span></h2></div>
            <span class="quiet-button"><span>6月12日—15日</span></span>
          </div>

          <Transition name="phase" mode="out-in">
          <div v-if="phase === 'overview'" key="overview" v-reveal="{ variant: 'left' }" class="status-banner">
            <div class="banner-title"><span class="banner-icon"><Sparkles :size="20" /></span><div><strong>杭州行程助手</strong><small>跨订单行程协同 · 办理前由你确认</small></div></div>
            <div class="search-fields">
              <div class="search-field"><small>当前行程</small><strong>沈阳往返杭州</strong><span>2027年6月12日—15日 · 4天3晚</span></div>
              <div class="search-field"><small>返程调整为</small><strong>6月14日 · 周一</strong><span>尽量保留灵隐寺安排</span></div>
              <InteractiveHoverButton class="primary-button" @click="startChange" variant="solid"><Search :size="18" /> 分析行程</InteractiveHoverButton>
            </div>
            <p class="banner-foot"><Clock3 :size="14" /> 额外支出尽量少 · 变更前先比较费用、退款预估和待核实条件</p>
          </div>

          <div v-else key="flow" v-reveal="{ variant: 'left' }" class="flow-panel">
            <div class="flow-top"><div><span class="live-dot"></span>提前返程协同 <span class="sim-pill">流程预览</span></div><button class="close-flow" aria-label="返回行程总览" @click="phase = 'overview'"><X :size="17" /></button></div>
            <div class="stepper"><div v-for="(step, i) in steps" :key="step" class="step" :class="{ done: i < currentStep, current: i === currentStep }"><span>{{ i < currentStep ? '✓' : `0${i + 1}` }}</span>{{ step }}</div></div>
            <template v-if="phase === 'impact' || phase === 'options'">
              <div class="request-line"><span class="request-avatar">李</span><div><small>你的调整需求</small><p>“我需要提前一天回沈阳，希望尽量保留灵隐寺，额外支出少一点。”</p></div></div>
              <div class="impact-heading"><div><h3>{{ phase === 'impact' ? '发现 3 项可能受影响' : '选择适合你的调整方案' }}</h3><p>订单不会自动变更，具体退改以产品规则及供应方确认为准。</p></div><span class="impact-count">6月14日返程</span></div>
              <div class="impact-list">
                <div v-reveal="{ variant: 'fade' }" class="impact-row"><div class="product-icon flight"><TrainFront :size="18" /></div><div class="impact-info"><strong>返程交通 · 沈阳方向</strong><small>原定 6月15日 · 需提前至 6月14日</small></div><span class="impact-state urgent">需调整</span></div>
                <div v-reveal="{ delay: 70, variant: 'fade' }" class="impact-row"><div class="product-icon stay"><Hotel :size="18" /></div><div class="impact-info"><strong>杭州湖滨亚朵酒店</strong><small>原住 6月12日—15日 · 可能涉及缩短入住</small></div><span class="impact-state check">待核实</span></div>
                <div v-reveal="{ delay: 140, variant: 'fade' }" class="impact-row"><div class="product-icon ticket"><Ticket :size="18" /></div><div class="impact-info"><strong>西湖游船联票</strong><small>原定 6月15日 · 可比较改期选项</small></div><span class="impact-state check">待核实</span></div>
              </div>
              <template v-if="phase === 'options'">
                <div class="options-grid">
                  <button v-for="(plan, i) in plans" :key="plan.name" v-reveal="{ delay: i * 75 }" class="plan-card" :class="{ chosen: selectedPlan === i }" @click="selectedPlan = i">
                    <span class="plan-top"><span>{{ plan.name }}</span><Check v-if="selectedPlan === i" :size="16" /></span>
                    <span class="plan-tag" :class="plan.tone">{{ plan.tag }}</span>
                    <span class="plan-price">{{ plan.total }}<small> 预计新增</small></span>
                    <span class="plan-refund">{{ plan.refund }}</span>
                    <span class="plan-detail">{{ plan.detail }}</span>
                  </button>
                </div>
                <div class="fine-print"><Wallet :size="15" /> 退款金额不代表到账；酒店缩住与门票改期需供应方确认。</div>
              </template>
              <div v-if="error" class="error-text">{{ error }}</div>
              <div class="flow-actions"><button class="text-button" @click="phase = phase === 'options' ? 'impact' : 'overview'">{{ phase === 'options' ? '返回影响清单' : '暂不调整' }}</button><InteractiveHoverButton v-if="phase === 'impact'" class="primary-button" @click="phase = 'options'" variant="solid">比较调整方案</InteractiveHoverButton><InteractiveHoverButton v-else class="primary-button" @click="choosePlan" variant="solid">选择此方案</InteractiveHoverButton></div>
            </template>
            <template v-else-if="phase === 'confirm'">
              <div class="confirm-box"><div class="confirm-symbol"><Check :size="20" /></div><div><h3>请确认本次办理</h3><p>你选择了「{{ currentPlan.name }}」，预计新增支出 <b>{{ currentPlan.total }}</b>，{{ currentPlan.refund }}。</p></div></div>
                <div class="confirm-items"><span>将尝试办理</span><b>返程交通改签、西湖游船联票改期</b><span>需供应方回复</span><b>酒店缩短一晚及对应退款</b></div>
                <p class="legal-note">点击下方按钮仅展示处理结果，不会产生真实订单、扣款或退款。</p>
                <div v-if="error" class="error-text" role="alert">{{ error }}</div><div class="flow-actions"><button class="text-button" @click="phase = 'options'">返回修改</button><InteractiveHoverButton class="primary-button" :disabled="busy" @click="processPlan" variant="solid">{{ busy ? '正在办理…' : '确认并查看结果' }}</InteractiveHoverButton></div>
            </template>
            <template v-else>
              <div class="result-heading"><span class="result-mark"><Check :size="20" /></span><div><h3>办理已完成</h3><p>本页面展示处理回执，最终结果以供应方确认为准。</p></div></div>
              <div class="result-list">
                <div v-reveal="{ variant: 'fade' }" class="result-row"><div class="product-icon flight"><TrainFront :size="18" /></div><div class="impact-info"><strong>返程交通改签</strong><small>6月14日 · 沈阳方向</small></div><span class="result-state success"><Check :size="13" /> 已完成</span></div>
                <div v-reveal="{ delay: 70, variant: 'fade' }" class="result-row"><div class="product-icon ticket"><Ticket :size="18" /></div><div class="impact-info"><strong>西湖游船联票</strong><small>已调整至 6月14日</small></div><span class="result-state success"><Check :size="13" /> 已完成</span></div>
                <div v-reveal="{ delay: 140, variant: 'fade' }" class="result-row"><div class="product-icon stay"><Hotel :size="18" /></div><div class="impact-info"><strong>杭州湖滨亚朵酒店</strong><small>缩住申请已提交 · 预计退款 ¥420</small></div><span class="result-state pending"><Clock3 :size="13" /> 等待回复</span></div>
              </div>
              <div class="follow-up"><strong>还有一项待跟进</strong><span>酒店尚未确认缩住与退款。退款预计金额不等于实际到账，可稍后查看供应方回复。</span></div>
              <div class="flow-actions"><span class="sim-complete">3 项处理 · 1 项待回复</span><InteractiveHoverButton class="primary-button" @click="phase = 'overview'" variant="solid">返回行程总览</InteractiveHoverButton></div>
            </template>
          </div>
          </Transition>

          <div class="quick-links">
            <button v-reveal="{ variant: 'fade' }" @click="jumpTo('itinerary', '我的订单')"><span class="quick-symbol blue-symbol"><CalendarDays :size="22" /></span><span><b>杭州行程</b><small>按日期查看安排</small></span><ArrowRight :size="15" /></button>
            <button v-reveal="{ delay: 80, variant: 'fade' }" @click="startChange"><span class="quick-symbol orange-symbol"><Sparkles :size="22" /></span><span><b>行程助手</b><small>调整计划 · 查看订单影响</small></span><ArrowRight :size="15" /></button>
          </div>

          <div class="itinerary-head" id="itinerary"><div><h3>你的安排</h3><span>已订订单与行程安排分开展示</span></div><InteractiveHoverButton class="outline-button" @click="navigateService('我的订单')" variant="outline">查看全部</InteractiveHoverButton></div>
          <div v-for="(item, index) in plannedItems" :key="item.id" v-reveal="{ delay: index * 70, variant: 'fade' }" class="added-plan"><div><span class="planned-tag">未预订计划</span><strong>{{ item.title }}</strong><p>{{ item.date }} · {{ item.detail }}</p></div><button class="text-button" @click="removePlan(item.id)">移除</button></div>
          <div class="day-block">
            <div class="day-rail"><strong>12</strong><span>六月 · 周六</span><i></i></div>
            <div class="day-items">
              <div v-reveal="{ delay: 0, variant: 'fade' }" class="booking-card" id="transport-booking"><div class="booking-icon flight"><Plane :size="18" /></div><div class="booking-main"><div><span class="confirmed-tag">已订</span><strong>沈阳 → 杭州</strong></div><p>09:20 — 11:45 · 沈阳桃仙机场 T3</p></div><span class="booking-code">交通订单</span></div>
              <div v-reveal="{ delay: 80, variant: 'fade' }" class="booking-card" id="hotel-booking"><div class="booking-icon stay"><Hotel :size="18" /></div><div class="booking-main"><div><span class="confirmed-tag">已订</span><strong>杭州湖滨亚朵酒店</strong></div><p>入住 6月12日 · 退房 6月15日 · 3 晚</p></div><span class="booking-code">酒店订单</span></div>
            </div>
          </div>
          <div class="day-block second-day">
            <div class="day-rail"><strong>13</strong><span>六月 · 周日</span><i></i></div>
            <div class="day-items"><div v-reveal="{ variant: 'fade' }" class="plan-note" id="planned-activity"><div class="booking-icon planned"><MapPin :size="18" /></div><div class="booking-main"><div><span class="planned-tag">未预订计划</span><strong>灵隐寺与飞来峰</strong></div><p>上午游览 · 已加入行程，尚未购买门票</p></div><span class="booking-code">行程安排</span></div></div>
          </div>
          <div class="next-day"><span>14</span><div><b>6月14日 · 周一</b><small>西湖漫步 · 返程待安排</small></div><span class="day-alert">待调整</span></div>
          <div class="next-day" id="ticket-booking"><span>15</span><div><b>6月15日 · 周二</b><small>原返程交通 · 西湖游船联票</small></div><span class="booked-small">2 项已订</span></div>
          <footer><span>行程日期：2027年6月</span><button @click="showNotice('本原型不连接携程真实订单、商品、价格或供应商；当前内容仅用于课程演示。')"><CircleHelp :size="14" /> 原型说明</button></footer>
        </section>
      </div>
      </template>
    </main>
    </Transition>
  </div>
</template>
