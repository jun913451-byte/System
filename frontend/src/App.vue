<script setup>
import { computed, onMounted, ref } from 'vue'
import ProductChannel from './components/ProductChannel.vue'
import demoAvatar from './assets/demo-avatar.svg'
import {
  ArrowRight, Bell, BookOpen, BusFront, CalendarDays, Check, ChevronDown, CircleHelp,
  Clock3, Compass, Heart, Hotel, Map, MapPin, Menu, Plane, RotateCcw, Search,
  Sparkles, Ticket, TrainFront, Wallet, X,
} from 'lucide-vue-next'

const activeNav = ref('AI行程助手')
const navCollapsed = ref(false)
const notice = ref('')
const searchQuery = ref('')
const phase = ref('overview')
const productPage = ref('')
function readSaved(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}
const plannedItems = ref(readSaved('trip-demo-plans'))
const favorites = ref(readSaved('trip-demo-favorites'))
const orderFilter = ref('全部订单')
const demoOrders = [
  { type: '机票', title: '沈阳 → 杭州 · 往返交通', detail: '2027年6月12日出发 · 原定6月15日返程', code: 'DEMO-F001' },
  { type: '酒店', title: '杭州湖滨亚朵酒店', detail: '2027年6月12日入住 · 6月15日退房 · 3晚', code: 'DEMO-H001' },
  { type: '门票·活动', title: '西湖游船联票', detail: '2027年6月15日 · 1位成人', code: 'DEMO-T001' },
]
const filteredOrders = computed(() => demoOrders.filter(item => orderFilter.value === '全部订单' || item.type === orderFilter.value))
const selectedPlan = ref(0)
const busy = ref(false)
const error = ref('')
const confirmed = ref(false)
const processed = ref(false)
const steps = ['影响分析', '方案比较', '确认方案', '办理结果']
const currentStep = computed(() => ({ overview: -1, impact: 0, options: 1, confirm: 2, result: 3 }[phase.value]))

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
  { label: '旅游', icon: Compass },
  { label: '门票·活动', icon: Ticket },
  { label: '汽车·船票', icon: BusFront },
  { label: '用车', icon: MapPin },
]
const discoveryNav = [
  { label: 'AI行程助手', icon: Sparkles },
  { label: '攻略·景点', icon: BookOpen },
  { label: '旅游地图', icon: Map },
]
const productConfigs = {
  酒店: {
    title: '预订酒店', subtitle: '搜索目的地住宿',
    fields: [
      { key: 'destination', label: '目的地 / 酒店名称', value: '杭州' },
      { key: 'dates', label: '入住 / 退房', value: '6月12日 — 6月15日' },
      { key: 'guests', label: '房间及住客', value: '1间 · 1位' },
      { key: 'keyword', label: '关键词（选填）', value: '' },
    ],
    samples: [
      ['杭州湖滨亚朵酒店', '湖滨商圈 · 含早餐 · 可免费取消（模拟）', '¥ 468', '距西湖步行约 8 分钟', {
        area: '湖滨商圈', stars: 4, score: '4.8', grade: '超棒', reviews: '3120条评价', oldPrice: '¥ 528',
        image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=720&q=80',
      }],
      ['杭州西湖逸衡酒店', '西湖景区 · 双床房 · 含早餐 · 免费取消（模拟）', '¥ 526', '距灵隐寺车程约 25 分钟', {
        area: '西湖景区', stars: 4, score: '4.9', reviews: '2640条评价', grade: '超棒', oldPrice: '¥ 598',
        image: 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=720&q=80',
      }],
      ['杭州武林广场全季酒店', '武林商圈 · 大床房 · 到店付款（模拟）', '¥ 389', '地铁站步行约 5 分钟', {
        area: '武林广场', stars: 3, score: '4.7', grade: '很好', reviews: '4180条评价', oldPrice: '¥ 439',
        image: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=720&q=80',
      }],
      ['杭州灵隐禅意隐居酒店', '灵隐飞来峰 · 含早餐 · 庭院景观（模拟）', '¥ 618', '步行可达灵隐景区入口', {
        area: '灵隐周边', stars: 5, score: '4.9', grade: '超棒', reviews: '1850条评价', oldPrice: '¥ 699',
        image: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=720&q=80',
      }],
      ['杭州西湖柳莺里君亭酒店', '南山路湖畔 · 免费取消 · 观景露台（模拟）', '¥ 558', '紧邻柳浪闻莺与雷峰塔', {
        area: '西湖景区', stars: 4, score: '4.8', grade: '超棒', reviews: '2290条评价', oldPrice: '¥ 620',
        image: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=720&q=80',
      }],
      ['杭州湖滨银泰桔子水晶酒店', '湖滨商圈 · 智能客房 · 免费取消（模拟）', '¥ 435', '龙翔桥地铁口步行约 4 分钟', {
        area: '湖滨商圈', stars: 4, score: '4.8', grade: '超棒', reviews: '3560条评价', oldPrice: '¥ 489',
        image: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=720&q=80',
      }],
    ],
  },
  机票: {
    title: '机票查询', subtitle: '比较往返航班与出行时间',
    fields: [
      { key: 'origin', label: '出发城市', value: '沈阳' },
      { key: 'destination', label: '到达城市', value: '杭州' },
      { key: 'depart', label: '出发日期', value: '6月12日' },
      { key: 'return', label: '返程日期', value: '6月15日' },
    ],
    samples: [
      ['沈阳 → 杭州 · 直飞', '09:20 桃仙T3 — 11:45 萧山T4 · 约 2小时25分', '¥ 860', '模拟航班 MF8062 · 经济舱 4.6折', {
        direction: 'out', code: 'MF8062', departTime: '09:20', arriveTime: '11:45', departPort: '沈阳桃仙 T3', arrivePort: '杭州萧山 T4', duration: '2h25m', stop: '直飞', discount: '4.6折', dateLabel: '2027-06-12 周六',
      }],
      ['沈阳 → 杭州 · 经停', '07:40 桃仙T3 — 12:55 萧山T3 · 经停青岛', '¥ 690', '模拟航班 CZ6521 · 经济舱 3.7折', {
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
      { key: 'origin', label: '出发站', value: '沈阳北' },
      { key: 'destination', label: '到达站', value: '杭州东' },
      { key: 'depart', label: '乘车日期', value: '6月12日' },
      { key: 'passengers', label: '乘车人', value: '1位成人' },
    ],
    samples: [
      ['G1226 · 沈阳北 → 杭州东', '07:55 — 18:42 · 历时 10小时47分', '¥ 823', '二等座 · 模拟班次'],
      ['G1234 · 沈阳北 → 杭州东', '10:15 — 21:36 · 历时 11小时21分', '¥ 790', '二等座 · 模拟班次'],
      ['返程 · 杭州东 → 沈阳北', '6月14日可选车次 · 详情待核实', '¥ 806', '二等座 · 模拟班次'],
    ],
  },
  旅游: {
    title: '杭州旅游', subtitle: '按日期和天数浏览适合的行程建议',
    fields: [
      { key: 'destination', label: '目的地', value: '杭州' },
      { key: 'dates', label: '出行日期', value: '6月12日' },
      { key: 'days', label: '出游天数', value: '4天3晚' },
      { key: 'style', label: '旅行偏好', value: '文化古迹 · 慢节奏' },
    ],
    samples: [
      ['西湖经典漫游', '断桥残雪 · 苏堤 · 花港观鱼 · 雷峰塔', '半日', '行程建议 · 未预订'],
      ['灵隐寺与飞来峰', '上午游览 · 预留景区交通时间', '半日', '行程建议 · 未预订'],
      ['河坊街与南宋御街', '历史街区 · 可安排在返程前一晚', '2小时', '行程建议 · 未预订'],
    ],
  },
  '门票·活动': {
    title: '门票与活动', subtitle: '查找景点门票与可调整的活动计划',
    fields: [
      { key: 'destination', label: '城市 / 景点', value: '杭州' },
      { key: 'date', label: '游玩日期', value: '6月14日' },
      { key: 'guests', label: '出行人数', value: '1位成人' },
      { key: 'keyword', label: '景点关键词', value: '西湖' },
    ],
    samples: [
      ['西湖游船联票', '6月14日 · 具体班次以模拟库存为准', '¥ 75', '模拟门票 · 可改期状态待核实'],
      ['灵隐寺与飞来峰门票', '景区预约时段 · 建议提前确认', '¥ 45', '模拟门票 · 未预订'],
      ['宋城千古情演出', '晚场演出 · 杭州宋城景区', '¥ 280', '模拟活动 · 未预订'],
    ],
  },
  '汽车·船票': {
    title: '汽车与船票', subtitle: '查看城际巴士及水上交通班次',
    fields: [
      { key: 'origin', label: '出发地', value: '杭州' },
      { key: 'destination', label: '目的地', value: '乌镇' },
      { key: 'date', label: '出发日期', value: '6月14日' },
      { key: 'passengers', label: '乘车人数', value: '1位成人' },
    ],
    samples: [
      ['杭州客运中心 → 乌镇汽车站', '08:30 发车 · 约 1小时20分', '¥ 55', '模拟班次 · 余票待核实'],
      ['杭州 → 千岛湖客运班线', '09:00 发车 · 约 2小时', '¥ 78', '模拟班次 · 余票待核实'],
      ['京杭大运河游船', '武林门码头 · 日间航线', '¥ 120', '模拟船票 · 未预订'],
    ],
  },
  用车: {
    title: '用车服务', subtitle: '填写接送地点与出发时间',
    fields: [
      { key: 'pickup', label: '上车地点', value: '杭州湖滨亚朵酒店' },
      { key: 'dropoff', label: '目的地', value: '杭州东站' },
      { key: 'date', label: '用车日期', value: '6月14日' },
      { key: 'time', label: '出发时间', value: '09:00' },
    ],
    samples: [
      ['舒适型 · 4座', '适合 1–3 位乘客 · 行李 2 件', '¥ 68', '模拟预估 · 不可实际下单'],
      ['商务型 · 6座', '适合多人及大件行李', '¥ 128', '模拟预估 · 不可实际下单'],
      ['出租车参考', '按里程计价 · 价格以实际为准', '¥ 52', '模拟估算 · 不可实际下单'],
    ],
  },
  '攻略·景点': {
    title: '杭州攻略与景点', subtitle: '根据当前行程浏览目的地灵感与安排',
    fields: [
      { key: 'destination', label: '目的地', value: '杭州' },
      { key: 'topic', label: '感兴趣的主题', value: '文化古迹' },
      { key: 'dates', label: '计划日期', value: '6月13日' },
      { key: 'duration', label: '可用时长', value: '半日' },
    ],
    samples: [
      ['灵隐寺与飞来峰', '建议上午前往 · 预留交通时间', '半日', '攻略建议 · 可加入未预订计划'],
      ['西湖十景漫步路线', '苏堤 → 花港观鱼 → 雷峰塔', '约 3 小时', '攻略建议 · 可加入未预订计划'],
      ['河坊街历史街区', '南宋御街 · 胡雪岩故居周边', '约 2 小时', '攻略建议 · 可加入未预订计划'],
    ],
  },
  旅游地图: {
    title: '杭州旅游地图', subtitle: '以地点和路线组织景点，不提供实时导航',
    fields: [
      { key: 'destination', label: '城市', value: '杭州' },
      { key: 'area', label: '区域', value: '西湖区' },
      { key: 'interest', label: '地点类型', value: '景点与文化古迹' },
      { key: 'date', label: '行程日期', value: '6月13日' },
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
  if (await post('/api/reset')) {
    phase.value = 'overview'
    selectedPlan.value = 0
    plannedItems.value = []
    favorites.value = []
    localStorage.removeItem('trip-demo-plans')
    localStorage.removeItem('trip-demo-favorites')
    goHome()
  }
}
function startChange() {
  productPage.value = ''
  setRoute('AI行程助手')
  phase.value = 'impact'
  activeNav.value = 'AI行程助手'
  notice.value = ''
}
function showNotice(message) {
  notice.value = message
}
function jumpTo(id, nav) {
  productPage.value = ''
  activeNav.value = nav
  notice.value = ''
  phase.value = 'overview'
  requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
}
function navigateService(label) {
  if (label === 'AI行程助手') return startChange()
  activeNav.value = label
  productPage.value = label
  notice.value = ''
  setRoute(label)
  window.scrollTo({ top: 0 })
}
function searchDemo() {
  const query = searchQuery.value.trim()
  if (!query) return showNotice('请输入酒店、机票、火车票、景点或攻略关键词。')
  const channel = /火车|高铁/.test(query) ? '火车票' : /机票|航班|沈阳|返程/.test(query) ? '机票' : /门票|游船|宋城/.test(query) ? '门票·活动' : /攻略|灵隐|景点/.test(query) ? '攻略·景点' : '酒店'
  navigateService(channel)
  searchSeed.value = { query, nonce: Date.now() }
}
const searchSeed = ref(null)
function setRoute(label) {
  history.pushState(null, '', label ? `#${encodeURIComponent(label)}` : location.pathname)
}
function restoreRoute() {
  let label = ''
  try { label = decodeURIComponent(location.hash.slice(1)) } catch {}
  productPage.value = productConfigs[label] || ['我的订单', '收藏夹'].includes(label) ? label : ''
  activeNav.value = label || 'AI行程助手'
  if (label === 'AI行程助手') phase.value = 'impact'
  notice.value = ''
}
function savePlan(item) {
  if (!plannedItems.value.some(saved => saved.id === item.id)) {
    plannedItems.value.push(item)
    localStorage.setItem('trip-demo-plans', JSON.stringify(plannedItems.value))
  }
}
function toggleFavorite(item) {
  const index = favorites.value.findIndex(saved => saved.id === item.id)
  if (index < 0) favorites.value.push(item)
  else favorites.value.splice(index, 1)
  localStorage.setItem('trip-demo-favorites', JSON.stringify(favorites.value))
}
function removePlan(id) {
  plannedItems.value = plannedItems.value.filter(item => item.id !== id)
  localStorage.setItem('trip-demo-plans', JSON.stringify(plannedItems.value))
}
function goHome() {
  productPage.value = ''
  setRoute('')
  phase.value = 'overview'
  activeNav.value = 'AI行程助手'
  notice.value = ''
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
onMounted(async () => {
  await loadState()
  restoreRoute()
  window.addEventListener('popstate', restoreRoute)
})
</script>

<template>
  <div class="app-shell" :class="{ 'nav-collapsed': navCollapsed }">
    <aside class="side-rail">
      <button class="menu-toggle" aria-label="收起或展开导航" @click="navCollapsed = !navCollapsed"><Menu :size="21" /></button>
      <div class="rail-group">
        <button v-for="item in serviceNav" :key="item.label" class="rail-link" :class="{ active: activeNav === item.label }" @click="navigateService(item.label)"><component :is="item.icon" :size="19" /><span>{{ item.label }}</span></button>
      </div>
      <div class="rail-group discovery-group">
        <button v-for="item in discoveryNav" :key="item.label" class="rail-link" :class="{ active: activeNav === item.label }" @click="navigateService(item.label)"><component :is="item.icon" :size="19" /><span>{{ item.label }}</span><span v-if="item.label === 'AI行程助手'" class="rail-new">NEW</span></button>
      </div>
      <div class="rail-group misc-group">
        <button class="rail-link" :class="{ active: activeNav === '收藏夹' }" @click="navigateService('收藏夹')"><Heart :size="19" /><span>收藏夹</span></button>
        <button class="rail-link" :class="{ active: activeNav === '我的订单' }" @click="navigateService('我的订单')"><CalendarDays :size="19" /><span>我的订单</span></button>
      </div>
    </aside>
    <div class="demo-strip"><span><Sparkles :size="14" /> 课程演示 · 商品、价格与订单均为模拟</span><button @click="resetDemo"><RotateCcw :size="14" /> 重置演示</button></div>
    <header class="topbar">
      <button class="brand" @click="goHome"><span class="brand-mark"><Compass :size="24" /></span><span>携程旅行</span></button>
      <label class="global-search"><Search :size="18" /><input v-model="searchQuery" aria-label="搜索旅行相关" placeholder="搜索酒店、机票、景点和攻略" @keydown.enter="searchDemo" /><button aria-label="搜索" @click.prevent="searchDemo"><Search :size="19" /></button></label>
      <div class="account">
        <div class="account-profile" aria-label="当前用户：用户1234"><img class="account-avatar" :src="demoAvatar" alt="虚构用户头像" /><span>用户1234</span></div>
        <i></i><button class="order-link" @click="navigateService('我的订单')">我的订单 <ChevronDown :size="13" /></button><i></i><button @click="showNotice('客服入口未接入。模拟办理结果和待回复事项会直接显示在行程页面。')">联系客服</button><i></i><button class="icon-button" aria-label="消息" @click="showNotice('暂无新消息。酒店待回复状态会显示在本次模拟办理结果中。')"><Bell :size="18" /></button>
      </div>
    </header>

    <div v-if="notice" class="nav-notice global-notice" role="status"><span>{{ notice }}</span><button aria-label="关闭提示" @click="notice = ''"><X :size="16" /></button></div>
    <main :class="{ 'channel-main': productPage }">
      <template v-if="productPage">
        <ProductChannel v-if="productConfigs[productPage]" :key="productPage" :channel="productPage" :config="productConfigs[productPage]" :favorites="favorites" :plans="plannedItems" :search-seed="searchSeed" @add-plan="savePlan" @favorite="toggleFavorite" @home="goHome" @navigate="navigateService" @open-assistant="startChange" @view-trip="goHome" />
        <section v-else class="personal-page">
          <h1>{{ productPage }}</h1>
          <p>杭州之旅 · 2027年6月12日—15日</p>
          <template v-if="productPage === '我的订单'">
            <div class="channel-tabs" aria-label="订单类型"><button v-for="tab in ['全部订单', '机票', '酒店', '门票·活动']" :key="tab" :class="{ selected: orderFilter === tab }" @click="orderFilter = tab">{{ tab }}</button></div>
            <article v-for="item in filteredOrders" :key="item.code" class="personal-card"><div><span class="confirmed-tag">模拟已订</span><small> {{ item.code }}</small><h3>{{ item.title }}</h3><p>{{ item.detail }}</p><p v-if="processed">{{ item.type === '酒店' ? '缩住申请待回复，原订单仍有效' : '模拟改签 / 改期至6月14日' }}</p></div><button class="outline-button" @click="startChange">查看行程与退改 <ArrowRight :size="14" /></button></article>
          </template>
          <template v-else>
            <div v-if="!favorites.length" class="channel-empty"><Heart :size="34" /><h2>还没有收藏的产品</h2><p>在频道中点收藏，方便之后比较和查看。</p><button class="primary-button" @click="navigateService('酒店')">去看看酒店</button></div>
            <article v-for="item in favorites" :key="item.id" class="personal-card"><div><small>{{ item.channel }} · 模拟产品</small><h3>{{ item.title }}</h3><p>{{ item.detail }}</p><b>{{ item.price }}</b></div><div class="personal-actions"><button class="outline-button" @click="navigateService(item.channel)">查看所属频道</button><button class="text-button" @click="toggleFavorite(item)">取消收藏</button></div></article>
          </template>
        </section>
      </template>
      <template v-else>
      <section class="destination-hero">
        <img src="https://ak-d.tripcdn.com/images/1mi6q12000ruisefs81D3.jpg?proc=source%2Ftrip" alt="杭州西湖与雷峰塔" />
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
            <button class="quiet-button" @click="showNotice('课程演示目前仅包含 2027 年 6 月的杭州行程。')"><span>6月12日—15日</span><ChevronDown :size="15" /></button>
          </div>

          <div v-if="phase === 'overview'" class="status-banner">
            <div class="banner-title"><span class="banner-icon"><Sparkles :size="20" /></span><div><strong>杭州行程助手</strong><small>跨订单行程协同 · 只在你确认后模拟办理</small></div><span class="demo-badge">演示案例</span></div>
            <div class="search-fields">
              <div class="search-field"><small>当前行程</small><strong>沈阳往返杭州</strong><span>2027年6月12日—15日 · 4天3晚</span></div>
              <div class="search-field"><small>返程调整为</small><strong>6月14日 · 周一</strong><span>尽量保留灵隐寺安排</span></div>
              <button class="primary-button" @click="startChange"><Search :size="18" /> 分析行程</button>
            </div>
            <p class="banner-foot"><Clock3 :size="14" /> 额外支出尽量少 · 变更前先比较费用、退款预估和待核实条件</p>
          </div>

          <div v-else class="flow-panel">
            <div class="flow-top"><div><span class="live-dot"></span>提前返程协同 <span class="sim-pill">模拟流程</span></div><button class="close-flow" aria-label="返回行程总览" @click="phase = 'overview'"><X :size="17" /></button></div>
            <div class="stepper"><div v-for="(step, i) in steps" :key="step" class="step" :class="{ done: i < currentStep, current: i === currentStep }"><span>{{ i < currentStep ? '✓' : `0${i + 1}` }}</span>{{ step }}</div></div>
            <template v-if="phase === 'impact' || phase === 'options'">
              <div class="request-line"><span class="request-avatar">李</span><div><small>你的调整需求</small><p>“我需要提前一天回沈阳，希望尽量保留灵隐寺，额外支出少一点。”</p></div></div>
              <div class="impact-heading"><div><h3>{{ phase === 'impact' ? '发现 3 项可能受影响' : '选择适合你的调整方案' }}</h3><p>订单不会自动变更，具体退改以产品规则及供应方确认为准。</p></div><span class="impact-count">6月14日返程</span></div>
              <div class="impact-list">
                <div class="impact-row"><div class="product-icon flight"><TrainFront :size="18" /></div><div class="impact-info"><strong>返程交通 · 沈阳方向</strong><small>原定 6月15日 · 需提前至 6月14日</small></div><span class="impact-state urgent">需调整</span></div>
                <div class="impact-row"><div class="product-icon stay"><Hotel :size="18" /></div><div class="impact-info"><strong>杭州湖滨亚朵酒店</strong><small>原住 6月12日—15日 · 可能涉及缩短入住</small></div><span class="impact-state check">待核实</span></div>
                <div class="impact-row"><div class="product-icon ticket"><Ticket :size="18" /></div><div class="impact-info"><strong>西湖游船联票</strong><small>原定 6月15日 · 可比较改期选项</small></div><span class="impact-state check">待核实</span></div>
              </div>
              <template v-if="phase === 'options'">
                <div class="options-grid">
                  <button v-for="(plan, i) in plans" :key="plan.name" class="plan-card" :class="{ chosen: selectedPlan === i }" @click="selectedPlan = i">
                    <span class="plan-top"><span>{{ plan.name }}</span><Check v-if="selectedPlan === i" :size="16" /></span>
                    <span class="plan-tag" :class="plan.tone">{{ plan.tag }}</span>
                    <span class="plan-price">{{ plan.total }}<small> 预计新增</small></span>
                    <span class="plan-refund">{{ plan.refund }}</span>
                    <span class="plan-detail">{{ plan.detail }}</span>
                  </button>
                </div>
                <div class="fine-print"><Wallet :size="15" /> 退款金额仅为演示估算，不代表到账；酒店缩住与门票改期需供应方确认。</div>
              </template>
              <div v-if="error" class="error-text">{{ error }}</div>
              <div class="flow-actions"><button class="text-button" @click="phase = phase === 'options' ? 'impact' : 'overview'">{{ phase === 'options' ? '返回影响清单' : '暂不调整' }}</button><button v-if="phase === 'impact'" class="primary-button" @click="phase = 'options'">比较调整方案 <ArrowRight :size="16" /></button><button v-else class="primary-button" @click="choosePlan">选择此方案 <ArrowRight :size="16" /></button></div>
            </template>
            <template v-else-if="phase === 'confirm'">
              <div class="confirm-box"><div class="confirm-symbol"><Check :size="20" /></div><div><h3>请确认本次模拟办理</h3><p>你选择了「{{ currentPlan.name }}」，预计新增支出 <b>{{ currentPlan.total }}</b>，{{ currentPlan.refund }}。</p></div></div>
                <div class="confirm-items"><span>将尝试办理</span><b>返程交通改签、西湖游船联票改期</b><span>需供应方回复</span><b>酒店缩短一晚及对应退款</b></div>
                <p class="legal-note">点击下方按钮仅授权本原型展示模拟结果，不会产生真实订单、扣款或退款。</p>
                <div v-if="error" class="error-text" role="alert">{{ error }}</div><div class="flow-actions"><button class="text-button" @click="phase = 'options'">返回修改</button><button class="primary-button" :disabled="busy" @click="processPlan">{{ busy ? '正在办理…' : '确认并查看模拟结果' }} <ArrowRight :size="16" /></button></div>
            </template>
            <template v-else>
              <div class="result-heading"><span class="result-mark"><Check :size="20" /></span><div><h3>模拟办理已完成</h3><p>本页面仅展示模拟回执，不代表真实供应方处理结果。</p></div></div>
              <div class="result-list">
                <div class="result-row"><div class="product-icon flight"><TrainFront :size="18" /></div><div class="impact-info"><strong>返程交通改签</strong><small>6月14日 · 沈阳方向</small></div><span class="result-state success"><Check :size="13" /> 模拟成功</span></div>
                <div class="result-row"><div class="product-icon ticket"><Ticket :size="18" /></div><div class="impact-info"><strong>西湖游船联票</strong><small>已调整至 6月14日</small></div><span class="result-state success"><Check :size="13" /> 模拟成功</span></div>
                <div class="result-row"><div class="product-icon stay"><Hotel :size="18" /></div><div class="impact-info"><strong>杭州湖滨亚朵酒店</strong><small>缩住申请已提交 · 预计退款 ¥420（模拟）</small></div><span class="result-state pending"><Clock3 :size="13" /> 等待回复</span></div>
              </div>
              <div class="follow-up"><strong>还有一项待跟进</strong><span>酒店尚未确认缩住与退款。退款预计金额不等于实际到账，可稍后查看供应方回复。</span></div>
              <div class="flow-actions"><span class="sim-complete">3 项处理 · 1 项待回复</span><button class="primary-button" @click="phase = 'overview'">返回行程总览 <ArrowRight :size="16" /></button></div>
            </template>
          </div>

          <div class="quick-links">
            <button @click="jumpTo('itinerary', '我的订单')"><span class="quick-symbol blue-symbol"><CalendarDays :size="22" /></span><span><b>杭州行程</b><small>按日期查看安排</small></span><ArrowRight :size="15" /></button>
            <button @click="startChange"><span class="quick-symbol orange-symbol"><Sparkles :size="22" /></span><span><b>行程助手</b><small>调整计划 · 查看订单影响</small></span><ArrowRight :size="15" /></button>
          </div>

          <div class="itinerary-head" id="itinerary"><div><h3>你的安排</h3><span>已订订单与行程安排分开展示</span></div><button class="outline-button" @click="navigateService('我的订单')">查看全部 <ArrowRight :size="14" /></button></div>
          <div v-for="item in plannedItems" :key="item.id" class="added-plan"><div><span class="planned-tag">未预订计划</span><strong>{{ item.title }}</strong><p>{{ item.date }} · {{ item.detail }}</p></div><button class="text-button" @click="removePlan(item.id)">移除</button></div>
          <div class="day-block">
            <div class="day-rail"><strong>12</strong><span>六月 · 周六</span><i></i></div>
            <div class="day-items">
              <div class="booking-card" id="transport-booking"><div class="booking-icon flight"><Plane :size="18" /></div><div class="booking-main"><div><span class="confirmed-tag">已订</span><strong>沈阳 → 杭州</strong></div><p>09:20 — 11:45 · 沈阳桃仙机场 T3</p></div><span class="booking-code">交通订单</span></div>
              <div class="booking-card" id="hotel-booking"><div class="booking-icon stay"><Hotel :size="18" /></div><div class="booking-main"><div><span class="confirmed-tag">已订</span><strong>杭州湖滨亚朵酒店</strong></div><p>入住 6月12日 · 退房 6月15日 · 3 晚</p></div><span class="booking-code">酒店订单</span></div>
            </div>
          </div>
          <div class="day-block second-day">
            <div class="day-rail"><strong>13</strong><span>六月 · 周日</span><i></i></div>
            <div class="day-items"><div class="plan-note" id="planned-activity"><div class="booking-icon planned"><MapPin :size="18" /></div><div class="booking-main"><div><span class="planned-tag">未预订计划</span><strong>灵隐寺与飞来峰</strong></div><p>上午游览 · 已加入行程，尚未购买门票</p></div><span class="booking-code">行程安排</span></div></div>
          </div>
          <div class="next-day"><span>14</span><div><b>6月14日 · 周一</b><small>西湖漫步 · 返程待安排</small></div><span class="day-alert">待调整</span></div>
          <div class="next-day" id="ticket-booking"><span>15</span><div><b>6月15日 · 周二</b><small>原返程交通 · 西湖游船联票</small></div><span class="booked-small">2 项已订</span></div>
          <footer><span>行程日期：2027年6月</span><button @click="showNotice('本原型不连接携程真实订单、商品、价格或供应商；模拟结果仅用于课程演示。')"><CircleHelp :size="14" /> 原型说明</button></footer>
        </section>
      </div>
      </template>
    </main>
  </div>
</template>
