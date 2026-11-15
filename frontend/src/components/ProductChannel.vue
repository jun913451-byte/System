<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ArrowLeftRight, ArrowRight, Check, ChevronLeft, ChevronRight, Compass, Heart, Hotel, MapPin, Plane, Search, ShieldCheck, Sparkles, TrainFront, X } from 'lucide-vue-next'
import TravelMap from './TravelMap.vue'
import hotelLakesideImage from '../assets/hotel-lakeside.webp'
import hotelRetreatImage from '../assets/hotel-retreat.webp'
import hotelCityImage from '../assets/hotel-city.webp'

const props = defineProps({
  channel: String, config: Object, favorites: Array, plans: Array, searchSeed: Object,
})
const emit = defineEmits(['add-plan', 'favorite', 'home', 'navigate', 'open-assistant', 'view-trip'])
const form = ref({})
const submitted = ref(null)
const searched = ref(false)
const selection = ref(null)
const tripType = ref('单程')
const sort = ref('推荐排序')
const filter = ref('全部')
const formError = ref('')
const feedback = ref('')
const returnFocus = ref(null)
const closeButton = ref(null)
const selectedTourRegion = ref('热门推荐')
const selectedTourDestination = ref('杭州')
const tourKeyword = ref('')
const selectedGuideRegion = ref('国内（含港澳台）')
const guidePanelOpen = ref(false)
const selectedGuideDestination = ref('杭州')
const guideSearchQuery = ref('')
const promoIndex = ref(0)
const promoTop = ref(123)
const promoHeight = ref(0)
let promoTimer
const lakePhoto = 'https://ak-d.tripcdn.com/images/1mi6q12000ruisefs81D3.jpg?proc=source%2Ftrip'
const hotelPromos = [
  {
    eyebrow: 'HANGZHOU HOTEL GUIDE',
    title: '住进湖畔，把西湖留给清晨',
    subtitle: '杭州湖滨 · 精选住宿灵感',
    image: hotelLakesideImage,
  },
  {
    eyebrow: 'SLOW DAYS IN HANGZHOU',
    title: '去灵隐山间，住一晚安静',
    subtitle: '灵隐飞来峰 · 山居与庭院',
    image: hotelRetreatImage,
  },
  {
    eyebrow: 'WEEKEND CITY STAY',
    title: '把城市周末，安排得刚刚好',
    subtitle: '湖滨商圈 · 出行与休憩',
    image: hotelCityImage,
  },
]
const flightPromoImage = 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1400&q=85'
const tourRegions = [
  { name: '热门推荐', places: ['三亚', '重庆', '厦门', '西双版纳', '大理', '日本', '成都', '北京', '新加坡', '土耳其', '沈阳', '韩国', '桂林', '西安', '昆明', '九寨沟', '冰岛', '香港', '济州岛', '马尔代夫', '泰国', '上海', '巴厘岛', '杭州'] },
  { name: '云南 / 贵州', places: ['云南', '西双版纳', '大理', '昆明', '贵阳', '丽江', '腾冲', '香格里拉', '贵州', '荔波', '黄果树', '梵净山'] },
  { name: '海南 / 福建', places: ['三亚', '厦门', '泉州', '海口', '福州', '万宁', '陵水', '鼓浪屿', '平潭', '漳州'] },
  { name: '东北', places: ['沈阳', '哈尔滨', '长白山', '丹东', '漠河', '雪乡', '延吉', '大连', '本溪', '长春'] },
  { name: '中国港澳台', places: ['香港', '澳门', '台湾', '日月潭', '台北', '九份', '台中', '高雄'] },
  { name: '国内其他', places: ['重庆', '成都', '北京', '桂林', '西安', '九寨沟', '上海', '杭州', '张家界', '青岛', '南京'] },
  { name: '亚洲', places: ['日本', '新加坡', '土耳其', '韩国', '济州岛', '马尔代夫', '泰国', '巴厘岛', '越南', '马来西亚'] },
  { name: '欧洲 / 美洲', places: ['土耳其', '冰岛', '西班牙', '瑞士', '意大利', '俄罗斯', '英国', '美国', '加拿大', '法国'] },
  { name: '非洲 / 大洋洲', places: ['澳大利亚', '埃及', '新西兰', '斐济', '摩洛哥', '肯尼亚', '毛里求斯'] },
]
const tourPlaceImages = [
  'photo-1537996194471-e657df975ab4', 'photo-1508804185872-d7badad00f7d', 'photo-1533105079780-92b9be482077',
  'photo-1518509562904-e7ef99cdcc86', 'photo-1540541338287-41700207dee6', 'photo-1516483638261-f4dbaf036963',
  'photo-1500530855697-b586d89ba3ee', 'photo-1519501025264-65ba15a82390', 'photo-1565967511849-76a60a516170',
  'photo-1512453979798-5ea266f8880c', 'photo-1500534623283-312aade485b7', 'photo-1501785888041-af3ef285b470',
  'photo-1519681393784-d120267933ba', 'photo-1514565131-fce0801e5785', 'photo-1519501025264-65ba15a82390',
  'photo-1500534314209-a25ddb2bd429', 'photo-1470770841072-f978cf4d019e', 'photo-1536599018102-9f803c140fc1',
  'photo-1500530855697-b586d89ba3ee', 'photo-1501785888041-af3ef285b470', 'photo-1530789253388-582c481c54b0',
  'photo-1477959858617-67f85cf4f1df', 'photo-1518837695005-2083093ee35b', 'photo-1470252649378-9c29740c9fa8',
]
const tourPlaces = tourRegions[0].places.map((name, index) => ({
  name,
  image: `https://images.unsplash.com/${tourPlaceImages[index]}?auto=format&fit=crop&w=360&h=240&q=80`,
}))
const tourPromoCards = [
  { title: '跟团游', detail: '省心省力 · 一站打包', image: 'photo-1464822759023-fed622ff2c3b', tone: 'forest', channel: '旅游地图' },
  { title: '私家团', detail: '独立出行 · 行程可调', image: 'photo-1509316785289-025f5b846b35', tone: 'amber', channel: '攻略·景点' },
  { title: '自由行', detail: '交通 · 酒店 · 景点随心组合', image: 'photo-1519046904884-53103b34b206', tone: 'teal', channel: '旅游地图' },
  { title: '定制旅行', detail: '出行省心 · 玩得尽兴', image: 'photo-1510414842594-a61c69b5ae57', tone: 'blue', channel: '攻略·景点' },
]
const guideRegions = [
  { name: '国内（含港澳台）', preview: '北京　上海　成都　杭州', groups: [
    { name: '直辖市', places: ['上海', '北京', '天津', '重庆'] },
    { name: '港澳台', places: ['香港', '澳门', '台北', '台中', '高雄', '花莲', '宜兰', '台南'] },
    { name: '海南', places: ['三亚', '海口', '陵水', '万宁', '琼海', '文昌', '保亭', '东方'] },
    { name: '浙江', places: ['杭州', '宁波', '湖州', '绍兴', '舟山', '温州', '嘉兴', '衢州', '金华', '义乌'] },
    { name: '广东', places: ['广州', '深圳', '珠海', '汕头', '惠州', '佛山', '潮州', '清远'] },
    { name: '江苏', places: ['南京', '苏州', '无锡', '扬州', '常州', '连云港', '镇江', '宜兴'] },
    { name: '山东', places: ['青岛', '威海', '济南', '烟台', '日照', '潍坊'] },
    { name: '云南', places: ['昆明', '大理', '丽江', '西双版纳', '香格里拉', '腾冲'] },
    { name: '四川', places: ['成都', '九寨沟', '峨眉山', '稻城亚丁', '都江堰', '乐山'] },
    { name: '东北', places: ['沈阳', '哈尔滨', '长白山', '大连', '延吉', '长春'] },
    { name: '西北', places: ['西安', '敦煌', '兰州', '青海湖', '乌鲁木齐', '银川'] },
    { name: '华中 / 华北', places: ['武汉', '长沙', '张家界', '郑州', '洛阳', '太原', '承德'] },
  ] },
  { name: '亚洲', preview: '迪拜　普吉岛　吉隆坡　新加坡', groups: [
    { name: '东亚', places: ['日本', '韩国', '济州岛', '东京', '大阪', '京都', '首尔', '釜山'] },
    { name: '东南亚', places: ['新加坡', '泰国', '越南', '马来西亚', '巴厘岛', '普吉岛', '清迈', '岘港'] },
    { name: '南亚', places: ['马尔代夫', '斯里兰卡', '尼泊尔', '印度', '不丹'] },
    { name: '中东', places: ['迪拜', '阿布扎比', '土耳其', '卡塔尔', '约旦'] },
  ] },
  { name: '欧洲', preview: '佛罗伦萨　罗马　巴塞罗那　巴黎', groups: [
    { name: '西欧', places: ['法国', '巴黎', '英国', '伦敦', '荷兰', '阿姆斯特丹', '比利时'] },
    { name: '南欧', places: ['意大利', '罗马', '佛罗伦萨', '西班牙', '巴塞罗那', '葡萄牙', '希腊'] },
    { name: '中欧', places: ['瑞士', '德国', '奥地利', '捷克', '匈牙利'] },
    { name: '北欧 / 东欧', places: ['冰岛', '挪威', '芬兰', '丹麦', '俄罗斯'] },
  ] },
  { name: '非洲', preview: '开普敦　开罗　赫尔格达　阿伊特本哈杜', groups: [
    { name: '北非', places: ['埃及', '开罗', '摩洛哥', '马拉喀什', '突尼斯'] },
    { name: '东非', places: ['肯尼亚', '坦桑尼亚', '塞舌尔', '埃塞俄比亚'] },
    { name: '南部非洲', places: ['南非', '开普敦', '纳米比亚', '博茨瓦纳', '毛里求斯'] },
  ] },
  { name: '北美洲', preview: '洛杉矶　纽约　猪岛　拉斯维加斯', groups: [
    { name: '美国', places: ['纽约', '洛杉矶', '旧金山', '拉斯维加斯', '夏威夷', '西雅图', '奥兰多'] },
    { name: '加拿大', places: ['温哥华', '多伦多', '班夫', '蒙特利尔', '魁北克'] },
    { name: '墨西哥 / 加勒比', places: ['墨西哥城', '坎昆', '古巴', '牙买加', '巴哈马'] },
  ] },
  { name: '南美洲', preview: '圣保罗　里约热内卢　布宜诺斯艾利斯', groups: [
    { name: '南美精选', places: ['巴西', '里约热内卢', '阿根廷', '秘鲁', '马丘比丘', '智利', '哥伦比亚'] },
  ] },
  { name: '大洋洲', preview: '悉尼　墨尔本　皇后镇　黄金海岸', groups: [
    { name: '澳大利亚', places: ['悉尼', '墨尔本', '黄金海岸', '大堡礁', '珀斯'] },
    { name: '新西兰 / 南太平洋', places: ['新西兰', '皇后镇', '奥克兰', '斐济', '大溪地'] },
  ] },
]
const guideStories = [
  { title: '西湖半日漫游', subtitle: '从湖滨步道走进西湖日常', image: 'photo-1519046904884-53103b34b206', tag: '路线灵感' },
  { title: '灵隐寺与飞来峰', subtitle: '留出半日，在山林古刹间慢行', image: 'photo-1470252649378-9c29740c9fa8', tag: '杭州景点' },
  { title: '河坊街与南宋御街', subtitle: '沿着老街巷，发现杭州旧时光', image: 'photo-1518005020951-eccb494ad742', tag: '城市漫步' },
]
const isTransport = computed(() => ['机票', '火车票', '汽车·船票'].includes(props.channel))
const isEditorial = computed(() => ['旅游', '攻略·景点', '门票·活动'].includes(props.channel))
const isHotel = computed(() => props.channel === '酒店')
const isFlight = computed(() => props.channel === '机票')
const isTourHome = computed(() => props.channel === '旅游')
const isGuideHome = computed(() => props.channel === '攻略·景点')
const isMap = computed(() => props.channel === '旅游地图')
const activeTourRegion = computed(() => tourRegions.find(region => region.name === selectedTourRegion.value) || tourRegions[0])
const activeGuideRegion = computed(() => guideRegions.find(region => region.name === selectedGuideRegion.value) || guideRegions[0])
const activeTourPlaces = computed(() => selectedTourRegion.value === '热门推荐'
  ? tourPlaces
  : activeTourRegion.value.places.map((name, index) => ({ name, image: tourPlaces[(index + tourRegions.findIndex(region => region.name === selectedTourRegion.value) * 3) % tourPlaces.length].image })))
const fields = computed(() => props.config.fields.flatMap(field => {
  if (field.key === 'dates' && props.channel === '酒店') return [
    { key: 'checkin', label: '入住日期', type: 'date', value: '2027-06-12' },
    { key: 'checkout', label: '退房日期', type: 'date', value: '2027-06-15' },
  ]
  if (field.key === 'return' && tripType.value === '单程') return []
  if (['dates', 'depart', 'return', 'date'].includes(field.key)) return [{ ...field, type: 'date', value: field.key === 'return' ? '2027-06-15' : ['旅游', '机票', '火车票'].includes(props.channel) ? '2027-06-12' : '2027-06-14' }]
  if (field.key === 'time') return [{ ...field, type: 'time' }]
  return [{ ...field, type: 'text' }]
}))
const filters = computed(() => props.channel === '酒店' ? ['全部', '含早餐', '免费取消'] : props.channel === '机票' ? ['全部', '直飞', '经停'] : props.channel === '火车票' ? ['全部', '上午出发', '下午出发'] : props.channel === '攻略·景点' ? ['全部', '寺庙文化', '西湖漫步', '历史街区'] : props.channel === '门票·活动' ? ['全部', '景区门票', '游船', '演出'] : ['全部'])
const products = computed(() => props.config.samples.map((sample, index) => ({
  id: `${props.channel}-${index}`, channel: props.channel, title: sample[0], detail: sample[1], price: sample[2], note: sample[3], index,
  ...(sample[4] || {}),
  amount: Number(sample[2].replace(/[^\d.]/g, '')) || 0,
  date: submitted.value?.checkin || submitted.value?.depart || submitted.value?.date || submitted.value?.dates || '2027-06-14',
})))
const resultItems = computed(() => {
  let items = products.value
  const values = submitted.value || (isFlight.value ? form.value : null)
  if (values) {
    // 本地商品目录只包含杭州案例，不能将同一批结果冒充其他城市。
    if (props.channel === '酒店' && !/杭州/.test(values.destination)) return []
    if (['旅游', '门票·活动', '攻略·景点', '旅游地图'].includes(props.channel) && !/杭州|西湖|灵隐|宋城|河坊/.test(values.destination)) return []
    if (['机票', '火车票'].includes(props.channel)) {
      const outward = /沈阳/.test(values.origin) && /杭州/.test(values.destination)
      const inward = /杭州/.test(values.origin) && /沈阳/.test(values.destination)
      if (!outward && !inward) return []
      items = items.filter(item => props.channel === '机票'
        ? (item.direction === 'in') === inward
        : inward ? item.index === 2 : item.index !== 2)
    }
    if (props.channel === '汽车·船票') {
      if (!/杭州|武林/.test(values.origin)) return []
      items = items.filter(item => item.title.includes(values.destination.trim()))
    }
    if (props.channel === '用车' && (!/杭州|湖滨/.test(values.pickup) || !/杭州|东站|萧山|西湖/.test(values.dropoff))) return []
    const keyword = (values.keyword || '').trim()
    if (keyword) items = items.filter(item => `${item.title} ${item.detail} ${item.note}`.includes(keyword))
  }
  if (filter.value !== '全部') {
    const indexFilters = { '上午出发': [0, 1], '下午出发': [2], '寺庙文化': [0], '西湖漫步': [1], '历史街区': [2], '景区门票': [1], 游船: [0], 演出: [2] }
    if (props.channel === '机票') items = filter.value === '直飞' ? items.filter(item => item.stop === '直飞') : filter.value === '经停' ? items.filter(item => item.stop !== '直飞') : items
    else if (props.channel === '酒店') items = filter.value === '免费取消' ? items.filter(item => /免费取消/.test(item.detail)) : filter.value === '含早餐' ? items.filter(item => /含早餐/.test(item.detail)) : items
    else items = indexFilters[filter.value] ? items.filter(item => indexFilters[filter.value].includes(item.index)) : items.filter(item => `${item.title}${item.detail}`.includes(filter.value))
  }
  return [...items].sort((a, b) => sort.value === '价格从低到高' ? a.amount - b.amount : sort.value === '价格从高到低' ? b.amount - a.amount : a.index - b.index)
})
const resultTitle = computed(() => searched.value ? `${props.channel}搜索结果` : props.channel === '攻略·景点' ? '杭州旅行灵感' : props.channel === '旅游地图' ? '杭州地点与路线' : `${props.channel}推荐`)
const hasFavorite = item => props.favorites.some(saved => saved.id === item.id)
const hasPlan = item => props.plans.some(saved => saved.id === item.id)
const fieldOptions = field => {
  if (field.key === 'guests') return ['1间 · 1位', '1间 · 2位', '2间 · 2位']
  if (field.key === 'passengers') return ['1位成人', '2位成人', '3位成人']
  return null
}
function resetForm() {
  form.value = Object.fromEntries(fields.value.map(field => [field.key, field.value]))
}
resetForm()
if (isTourHome.value) form.value.origin = '沈阳'
watch(tripType, () => { if (!form.value.return) form.value.return = '2027-06-15' })
function submitSearch() {
  formError.value = ''
  if (fields.value.some(field => !['keyword'].includes(field.key) && !String(form.value[field.key] || '').trim())) {
    formError.value = '请补全搜索条件。'
    return
  }
  if (props.channel === '酒店' && form.value.checkout <= form.value.checkin) {
    formError.value = '退房日期需要晚于入住日期。'
    return
  }
  if (props.channel === '机票' && tripType.value === '往返' && form.value.return < form.value.depart) {
    formError.value = '返程日期不能早于出发日期。'
    return
  }
  if (isTransport.value && form.value.origin === form.value.destination) {
    formError.value = '出发地与目的地不能相同。'
    return
  }
  submitted.value = { ...form.value }
  searched.value = true
  filter.value = '全部'
  feedback.value = ''
}
function swapCities() {
  const origin = form.value.origin
  form.value.origin = form.value.destination
  form.value.destination = origin
}
function selectTourDestination(destination) {
  selectedTourDestination.value = destination
  form.value.destination = destination
  feedback.value = `已选择${destination}，提交上方搜索可查看对应行程建议。`
}
function searchTour() {
  form.value.destination = selectedTourDestination.value
  form.value.keyword = tourKeyword.value.trim()
  submitSearch()
}
function showGuideRegion(region) {
  selectedGuideRegion.value = region
  guidePanelOpen.value = true
}
function showGuideStories() {
  guidePanelOpen.value = false
  nextTick(() => document.querySelector('.guide-landing-feature')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
}
function selectGuideDestination(destination) {
  selectedGuideDestination.value = destination
  form.value.destination = destination
  guideSearchQuery.value = destination
  feedback.value = `已选择${destination}，提交上方搜索可查看对应攻略灵感。`
}
function searchGuide() {
  form.value.destination = selectedGuideDestination.value
  form.value.keyword = guideSearchQuery.value.trim() === selectedGuideDestination.value ? '' : guideSearchQuery.value.trim()
  submitSearch()
}
function applySeed(seed) {
  if (!seed) return
  const query = seed.query
  const channelWords = /^(酒店|住宿|机票|航班|火车票|高铁|景点|攻略|门票|杭州|西湖)$/
  if (['酒店', '门票·活动'].includes(props.channel)) form.value.keyword = channelWords.test(query) ? '' : query
  if (props.channel === '酒店' && !/酒店|住宿|亚朵|全季|逸衡|杭州|西湖/.test(query)) form.value.destination = query
  submitSearch()
}
watch(() => props.searchSeed, applySeed)
function openDetail(item) {
  returnFocus.value = document.activeElement
  selection.value = item
  feedback.value = ''
  document.body.style.overflow = 'hidden'
  nextTick(() => closeButton.value?.focus())
}
function closeDetail() {
  selection.value = null
  document.body.style.overflow = ''
  returnFocus.value?.focus()
}
function onModalKey(event) {
  if (!selection.value) return
  if (event.key === 'Escape') closeDetail()
  if (event.key === 'Tab') {
    const buttons = [...document.querySelectorAll('.product-dialog button')]
    if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus() }
    else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus() }
  }
}
function addPlan(item) {
  emit('add-plan', item)
  feedback.value = '已加入杭州行程，状态为未预订计划。'
}
function movePromo(direction) {
  promoIndex.value = (promoIndex.value + direction + hotelPromos.length) % hotelPromos.length
}
function startPromoTimer() {
  window.clearInterval(promoTimer)
  if (isHotel.value) promoTimer = window.setInterval(() => movePromo(1), 6500)
}
function syncHotelPromoPosition() {
  promoTop.value = 123
  promoHeight.value = Math.round((window.innerHeight - promoTop.value - 18) * 2 / 3)
}
onMounted(() => {
  applySeed(props.searchSeed)
  window.addEventListener('keydown', onModalKey)
  if (isHotel.value) {
    syncHotelPromoPosition()
    window.addEventListener('resize', syncHotelPromoPosition)
  }
  startPromoTimer()
})
onUnmounted(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onModalKey)
  window.removeEventListener('resize', syncHotelPromoPosition)
  window.clearInterval(promoTimer)
})
</script>

<template>
  <TravelMap v-if="isMap" :favorites="favorites" :plans="plans" @add-plan="emit('add-plan', $event)" />
  <section v-else class="product-channel" :class="{ 'transport-channel': isTransport, 'editorial-channel': isEditorial, 'hotel-product-page': isHotel, 'tour-product-page': isTourHome, 'guide-product-page': isGuideHome }">
    <div class="channel-topline"><strong>{{ channel === '酒店' ? '酒店预订' : channel }}</strong></div>
    <section v-if="isTourHome" class="tour-discovery" aria-label="旅游目的地探索">
      <form class="tour-search-bar" @submit.prevent="searchTour">
        <label class="tour-origin"><MapPin :size="18" /><span class="tour-origin-label">出发城市</span><input v-model="form.origin" aria-label="出发城市" /></label>
        <label class="tour-category"><span>全部产品</span><ChevronDown :size="16" /></label>
        <label class="tour-keyword"><Search :size="18" /><input v-model="tourKeyword" aria-label="目的地或主题关键词" placeholder="请输入目的地、主题或关键词" /></label>
        <button class="tour-search-submit" type="submit"><Search :size="19" />搜索</button>
      </form>
      <div class="tour-discovery-layout">
        <aside class="tour-region-list" aria-label="选择目的地区域">
          <button v-for="region in tourRegions" :key="region.name" class="tour-region" :class="{ active: selectedTourRegion === region.name }" :aria-expanded="selectedTourRegion === region.name" aria-controls="tour-region-panel" @mouseenter="selectedTourRegion = region.name" @focus="selectedTourRegion = region.name" @click="selectedTourRegion = region.name">
            <strong>{{ region.name }}</strong><span>{{ region.places.slice(0, 7).join('  ') }}</span><ChevronRight :size="16" />
          </button>
        </aside>
        <div class="tour-feature-area">
          <template v-if="selectedTourRegion === '热门推荐'">
            <button class="tour-main-banner" type="button" @click="emit('navigate', '攻略·景点')">
              <img src="https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1500&q=85" alt="水乡河道与山水风景" />
              <span class="tour-banner-shade"></span><span class="tour-banner-copy"><small>ESCAPE THE ORDINARY</small><strong>周边游</strong><b>发现旅途里的风景与日常</b><span>看线路灵感 <ArrowRight :size="15" /></span></span>
              <span class="tour-banner-note">风景图片为展示素材</span>
            </button>
            <div class="tour-mode-cards">
              <button v-for="card in tourPromoCards" :key="card.title" class="tour-mode-card" :class="`tone-${card.tone}`" type="button" @click="emit('navigate', card.channel)">
                <img :src="`https://images.unsplash.com/${card.image}?auto=format&fit=crop&w=600&h=720&q=80`" alt="" />
                <span class="tour-mode-shade"></span><span class="tour-mode-copy"><strong>{{ card.title }}</strong><small>{{ card.detail }}</small><b>去看看 <ArrowRight :size="15" /></b></span>
              </button>
            </div>
          </template>
          <div v-else id="tour-region-panel" class="tour-mega-panel" aria-live="polite">
            <div class="tour-mega-heading"><div><span>DESTINATIONS</span><h2>{{ activeTourRegion.name }}</h2></div><small>选择目的地，继续探索行程灵感</small></div>
            <div class="tour-destination-grid">
              <button v-for="place in activeTourPlaces" :key="place.name" class="tour-destination-card" :class="{ selected: selectedTourDestination === place.name }" type="button" @click="selectTourDestination(place.name)">
                <img :src="place.image" :alt="`${place.name}风景`" loading="lazy" /><span>{{ place.name }}</span>
              </button>
            </div>
            <div class="tour-quick-links"><div><strong>出境畅游</strong><span>日本　新加坡　土耳其　韩国　泰国　马来西亚</span></div><div><strong>周边目的地</strong><span>杭州　乌镇　绍兴　千岛湖　南京　上海</span></div><div><strong>主题精选</strong><span>自然探索　亲子度假　城市漫游　山海假期</span></div></div>
          </div>
        </div>
      </div>
      <div v-if="feedback" class="tour-feedback" role="status">{{ feedback }}</div>
    </section>
    <section v-else-if="isGuideHome" class="guide-discovery" aria-label="攻略与景点探索">
      <form class="guide-search-bar" @submit.prevent="searchGuide">
        <Search :size="21" />
        <input v-model="guideSearchQuery" aria-label="搜索城市、景点或游记" placeholder="搜索城市 / 景点 / 游记 / 问答 / 住宿" />
        <button type="submit">搜索</button>
      </form>
      <nav class="guide-topic-strip" aria-label="攻略内容分类">
        <button type="button" @click="showGuideRegion('国内（含港澳台）')"><MapPin :size="17" />目的地指南</button>
        <button type="button" @click="showGuideStories()"><Compass :size="17" />景点灵感</button>
        <button type="button" @click="emit('navigate', '旅游地图')"><MapPin :size="17" />行程线路 <ArrowRight :size="14" /></button>
      </nav>
      <div class="guide-discovery-layout">
        <aside class="guide-region-list" aria-label="选择攻略目的地区域">
          <button v-for="region in guideRegions" :key="region.name" class="guide-region" :class="{ active: guidePanelOpen && selectedGuideRegion === region.name }" :aria-expanded="guidePanelOpen && selectedGuideRegion === region.name" aria-controls="guide-region-panel" @mouseenter="showGuideRegion(region.name)" @focus="showGuideRegion(region.name)" @click="showGuideRegion(region.name)">
            <strong>{{ region.name }}</strong><span>{{ region.preview }}</span><ChevronRight :size="17" />
          </button>
        </aside>
        <div class="guide-feature-area">
          <div v-if="!guidePanelOpen" class="guide-landing-feature">
            <button class="guide-main-story" type="button" @click="guideSearchQuery = '杭州'; searchGuide()">
              <img src="https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1500&q=85" alt="雪峰与山谷风景" />
              <span class="guide-main-shade"></span><span class="guide-main-copy"><small>TRAVEL NOTES · 行走的灵感</small><strong>山海之间</strong><b>让每一段风景，都成为行程灵感</b><span>探索旅行攻略 <ArrowRight :size="16" /></span></span>
            </button>
            <div class="guide-story-cards">
              <button v-for="story in guideStories" :key="story.title" class="guide-story-card" type="button" @click="guideSearchQuery = story.title; searchGuide()">
                <img :src="`https://images.unsplash.com/${story.image}?auto=format&fit=crop&w=600&h=380&q=80`" :alt="`${story.title}风景`" />
                <span class="guide-story-shade"></span><span class="guide-story-copy"><small>{{ story.tag }}</small><strong>{{ story.title }}</strong><span>{{ story.subtitle }}</span></span>
              </button>
            </div>
          </div>
          <div v-else id="guide-region-panel" class="guide-mega-panel" aria-live="polite">
            <div class="guide-mega-heading"><div><span>TRAVEL GUIDE</span><h2>{{ activeGuideRegion.name }}</h2></div><small>选择一座城市或景点，查看对应的旅行灵感</small></div>
            <div class="guide-destination-groups">
              <section v-for="group in activeGuideRegion.groups" :key="group.name" class="guide-destination-group">
                <h3>{{ group.name }}</h3>
                <button v-for="place in group.places" :key="place" type="button" :class="{ selected: selectedGuideDestination === place }" @click="selectGuideDestination(place)">{{ place }}</button>
              </section>
            </div>
          </div>
        </div>
      </div>
      <p v-if="feedback" class="guide-feedback" role="status">{{ feedback }}</p>
    </section>
    <div v-else class="channel-hero" :class="{ 'has-landscape': !isTransport, 'hotel-channel-hero': isHotel, 'flight-channel-hero': isFlight, 'flight-roundtrip': isFlight && tripType === '往返' }">
      <div class="channel-search-panel">
        <div class="channel-search-heading"><div><h1>{{ config.title }}</h1><p>{{ config.subtitle }}</p></div><component :is="channel === '机票' ? Plane : channel === '火车票' ? TrainFront : channel === '酒店' ? Hotel : Compass" :size="42" :stroke-width="1.3" /></div>
        <form @submit.prevent="submitSearch">
          <div v-if="isFlight" class="flight-service-tabs"><button type="button" class="selected">国内 / 国际机票</button><button type="button" @click="feedback = '特价机票暂不可用。'">特价机票</button><button type="button" @click="feedback = '航班动态暂不可用。'">航班动态</button><button type="button" @click="feedback = '请在行程协同中查看可选方案。'">退票改签</button></div>
          <div v-if="isFlight" class="trip-type" role="radiogroup" aria-label="航程类型"><label v-for="type in ['单程', '往返']" :key="type"><input v-model="tripType" type="radio" :value="type" name="trip-type" />{{ type }}</label><span class="flight-separator"></span><label class="flight-travellers"><input type="checkbox" />带儿童</label><label class="flight-travellers"><input type="checkbox" />带婴儿</label><button type="button" class="flight-cabin" @click="feedback = '当前提供经济舱。'">经济舱 <ChevronRight :size="13" /></button></div>
          <div class="channel-fields" :class="{ 'transport-search-fields': isTransport && !isFlight }">
            <label v-for="field in fields" :key="field.key" class="channel-field" :class="`field-${field.key}`"><span>{{ field.label }}</span>
              <select v-if="fieldOptions(field)" v-model="form[field.key]" :aria-label="field.label"><option v-for="option in fieldOptions(field)" :key="option">{{ option }}</option></select>
              <input v-else v-model="form[field.key]" :type="field.type" :aria-label="field.label" :placeholder="field.key === 'keyword' ? '位置 / 名称 / 特色' : field.label" :required="field.key !== 'keyword'" />
            </label>
            <button v-if="isTransport" type="button" class="swap-cities" aria-label="交换出发地和目的地" @click="swapCities"><ArrowLeftRight :size="17" /></button>
            <button type="submit" class="primary-button channel-submit" :class="{ 'flight-search-button': isFlight }"><Search :size="21" />搜索{{ isFlight ? '机票' : '' }}</button>
          </div>
          <p v-if="formError || feedback" class="channel-form-error" role="status">{{ formError || feedback }}</p>
        </form>
        <div class="search-assurance"><ShieldCheck :size="15" /><span>选择产品后先加入未预订计划</span></div>
      </div>
      <div v-if="isHotel" class="hotel-promo" :style="{ '--hotel-promo-top': `${promoTop}px`, '--hotel-promo-height': `${promoHeight}px` }">
        <Transition name="hotel-promo-slide"><img :key="promoIndex" class="hotel-promo-image" :src="hotelPromos[promoIndex].image" alt="" /></Transition>
        <span class="promo-eyebrow">{{ hotelPromos[promoIndex].eyebrow }}</span>
        <h2>{{ hotelPromos[promoIndex].title }}</h2>
        <p>{{ hotelPromos[promoIndex].subtitle }}</p>
        <div class="hotel-promo-controls"><div class="promo-dots"><button v-for="(_, index) in hotelPromos" :key="index" :class="{ active: promoIndex === index }" :aria-label="`第 ${index + 1} 张酒店推荐图`" @click="promoIndex = index"></button></div><div><button aria-label="上一张酒店推荐图" @click="movePromo(-1)"><ChevronLeft :size="17" /></button><button aria-label="下一张酒店推荐图" @click="movePromo(1)"><ChevronRight :size="17" /></button></div></div>
      </div>
      <div v-else-if="isFlight" class="flight-promise" :style="{ backgroundImage: `linear-gradient(90deg, #075697d9 0%, #0878bd8c 52%, #07569718 100%), url('${flightPromoImage}')` }">
        <span>TRAVEL WITH CONFIDENCE</span><h2>机票服务保障 · 安心出行 · 价格放心</h2><p>比较出发时间与航程 · 规划行程</p>
      </div>
      <div v-else-if="!isTransport" class="channel-landscape"><img :src="lakePhoto" alt="杭州西湖景色示意" /><div><small>HANGZHOU · 杭州</small><b>{{ channel === '旅游地图' ? '沿着风景，发现杭州' : '把西湖的风景，写进行程' }}</b><span>杭州风景示意图</span></div></div>
    </div>

    <div v-if="isFlight" class="flight-lowfare"><div class="flight-section-heading"><div><span>HANGZHOU ESCAPE</span><h2>低价速报</h2></div><button @click="emit('navigate', '旅游')">更多目的地 <ArrowRight :size="15" /></button></div><div class="lowfare-grid"><button v-for="(fare, index) in [{ city: '杭州 ⇄ 北京', price: '¥680起', date: '6月周末 · 3天2晚', image: 'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?auto=format&fit=crop&w=720&q=80', tone: 'blue' }, { city: '杭州 ⇄ 成都', price: '¥520起', date: '夏日慢游 · 4天3晚', image: 'https://images.unsplash.com/photo-1528164344705-47542687000d?auto=format&fit=crop&w=720&q=80', tone: 'coral' }, { city: '杭州 ⇄ 青岛', price: '¥460起', date: '海边周末 · 3天2晚', image: 'https://images.unsplash.com/photo-1599571234909-29ed5d1321d6?auto=format&fit=crop&w=720&q=80', tone: 'teal' }]" :key="fare.city" :class="`fare-${fare.tone}`" @click="form.destination = fare.city.split(' ⇄ ')[1]; feedback = '已选择目的地，请设置出行日期后搜索。'"><span class="fare-photo" :style="{ backgroundImage: `url('${fare.image}')` }"></span><span class="fare-info"><b>{{ fare.city }}</b><small>{{ fare.date }}</small><strong>{{ fare.price }}</strong></span><span class="fare-index">0{{ index + 1 }}</span></button></div></div>

    <div class="channel-shortcuts"><button @click="emit('open-assistant')"><Sparkles :size="23" /><span><b>AI行程助手</b><small>跨订单协同 · 确认后模拟办理</small></span><ArrowRight :size="17" /></button><button @click="emit('navigate', '旅游地图')"><MapPin :size="23" /><span><b>行程线路</b><small>查看杭州景点与每日路线</small></span><ArrowRight :size="17" /></button></div>

    <section class="channel-results" aria-live="polite">
      <div class="results-heading"><div><h2>{{ resultTitle }}</h2><p v-if="searched">{{ Object.values(submitted).filter(Boolean).join(' · ') }}</p></div><span>{{ resultItems.length }} 项结果</span></div>
      <div class="result-toolbar"><div class="filter-buttons" aria-label="筛选结果"><button v-for="option in filters" :key="option" :class="{ selected: filter === option }" @click="filter = option">{{ option }}</button></div><label v-if="!['攻略·景点', '旅游地图', '旅游'].includes(channel)">排序 <select v-model="sort" aria-label="结果排序"><option>推荐排序</option><option>价格从低到高</option><option>价格从高到低</option></select></label></div>
      <div v-if="!resultItems.length" class="channel-empty"><Search :size="36" /><h3>没有找到符合条件的产品</h3><p>请调整城市、日期或关键词后重试。</p><button class="primary-button" @click="resetForm(); submitSearch()">重置搜索条件</button></div>
      <template v-else>
        <div v-if="isHotel" class="hotel-recommend-grid">
          <article v-for="item in resultItems" :key="item.id" class="hotel-result">
            <button class="hotel-result-photo" :style="{ backgroundImage: `url('${item.image}')` }" :aria-label="`查看${item.title}图片与详情`" @click="openDetail(item)"><span>杭州 · {{ item.area }}</span><span class="hotel-heart" @click.stop="emit('favorite', item)"><Heart :size="16" :fill="hasFavorite(item) ? 'currentColor' : 'none'" /></span></button>
            <div class="hotel-result-body">
              <div class="hotel-result-title"><div><span class="hotel-stars">{{ '★'.repeat(item.stars) }}</span><small> · {{ item.area }}</small></div><button class="hotel-name" @click="openDetail(item)">{{ item.title }}</button></div>
              <div class="hotel-score"><b>{{ item.score }}</b><strong>{{ item.grade }}</strong><span>{{ item.reviews }}</span></div>
              <p>{{ item.detail }}</p><div class="hotel-tags"><span v-if="/含早餐/.test(item.detail)">含早餐</span><span v-if="/免费取消/.test(item.detail)">免费取消</span></div>
              <div class="hotel-result-price"><div><del>{{ item.oldPrice }}</del><strong>{{ item.price }}<small> /晚</small></strong></div><button class="primary-button" @click="openDetail(item)">查看房型 <ArrowRight :size="14" /></button></div>
            </div>
          </article>
        </div>
        <div v-else-if="isFlight" class="flight-result-list">
          <article v-for="item in resultItems" :key="item.id" class="flight-result">
            <div class="flight-result-brand"><Plane :size="21" /><span>{{ item.code }}</span><small>航班信息</small></div>
            <div class="flight-route"><div><strong>{{ item.departTime }}</strong><span>{{ item.departPort }}</span></div><div class="flight-route-line"><span>{{ item.duration }}</span><i></i><small>{{ item.stop }}</small></div><div><strong>{{ item.arriveTime }}</strong><span>{{ item.arrivePort }}</span></div></div>
            <div class="flight-date">{{ item.dateLabel }}<span>{{ item.discount }}</span></div>
            <div class="flight-result-actions"><strong>{{ item.price }}<small> /人起</small></strong><span>经济舱</span><button class="primary-button" @click="openDetail(item)">查看航班 <ArrowRight :size="14" /></button><button class="favorite-button" :aria-label="(hasFavorite(item) ? '取消收藏' : '收藏') + item.title" :aria-pressed="hasFavorite(item)" @click="emit('favorite', item)"><Heart :size="15" :fill="hasFavorite(item) ? 'currentColor' : 'none'" />{{ hasFavorite(item) ? '已收藏' : '收藏' }}</button></div>
          </article>
        </div>
        <div v-else :class="isEditorial ? 'editorial-grid' : 'product-list'">
          <article v-for="item in resultItems" :key="item.id" class="product-result" :class="{ 'transport-result': isTransport }">
            <div v-if="!isTransport" class="product-art" :class="'art-' + item.index"><img v-if="isEditorial" :src="isGuideHome ? `https://images.unsplash.com/${guideStories[item.index % guideStories.length].image}?auto=format&fit=crop&w=720&q=80` : isTourHome ? tourPlaces[(item.index + 3) % tourPlaces.length].image : lakePhoto" :alt="isGuideHome ? `${item.title}风景示意图` : isTourHome ? `${item.title}风景示意图` : '杭州风景示意图'" /><MapPin v-else :size="50" :stroke-width="1" /><span>杭州示意</span></div>
            <div v-else class="transport-logo"><component :is="channel === '机票' ? Plane : TrainFront" :size="28" /><small>班次信息</small></div>
            <div class="product-summary"><span class="product-category">{{ channel }} · {{ searched ? '查询匹配' : '推荐' }}</span><button class="product-name" @click="openDetail(item)">{{ item.title }}</button><p>{{ item.detail }}</p><small>{{ item.note }}</small><div v-if="channel === '酒店'" class="product-tags"><span>{{ item.index === 0 ? '含早餐' : item.index === 1 ? '双床房' : '大床房' }}</span><span>未预订</span></div><small v-if="searched && channel === '机票' && tripType === '往返'" class="segment-note">单段价格，去程与返程需分别选择</small></div>
            <div class="product-purchase"><strong>{{ item.price }}<small v-if="channel === '酒店'"> /晚</small></strong><span>{{ item.price.includes('¥') ? '参考价格' : '参考时长 / 距离' }}</span><button class="primary-button" @click="openDetail(item)">{{ channel === '酒店' ? '查看房型' : isTransport ? '选择班次' : '查看详情' }} <ArrowRight :size="14" /></button><button class="favorite-button" :aria-label="(hasFavorite(item) ? '取消收藏' : '收藏') + item.title" :aria-pressed="hasFavorite(item)" @click="emit('favorite', item)"><Heart :size="15" :fill="hasFavorite(item) ? 'currentColor' : 'none'" />{{ hasFavorite(item) ? '已收藏' : '收藏' }}</button></div>
          </article>
        </div>
      </template>
    </section>
    <footer><button @click="emit('view-trip')">返回行程 <ArrowRight :size="14" /></button></footer>
  </section>
  <Teleport to="body">
    <div v-if="selection" class="product-overlay" @click.self="closeDetail">
      <section class="product-dialog" role="dialog" aria-modal="true" aria-labelledby="product-detail-title">
        <div class="dialog-top"><span>{{ channel }}详情</span><button ref="closeButton" aria-label="关闭产品详情" @click="closeDetail"><X :size="21" /></button></div>
        <div class="dialog-body"><h2 id="product-detail-title">{{ selection.title }}</h2><p>{{ selection.detail }}</p><p>{{ selection.note }}</p><dl><div><dt>计划日期</dt><dd>{{ selection.date }}</dd></div><div><dt>{{ channel === '酒店' ? '房型' : isTransport ? '席别 / 服务' : '安排' }}</dt><dd>{{ channel === '酒店' ? (selection.index === 1 ? '标准双床房' : '标准大床房') : isTransport ? (channel === '机票' ? '经济舱 · 单段' : '二等座 / 普通座 · 单段') : '按所选产品安排' }}</dd></div><div><dt>价格 / 用时</dt><dd class="detail-price">{{ selection.price }}{{ channel === '酒店' ? ' /晚' : '' }}</dd></div><div v-if="channel === '酒店'"><dt>入住与退房</dt><dd>{{ submitted?.checkin || form.checkin }} — {{ submitted?.checkout || form.checkout }}</dd></div><div><dt>退改规则</dt><dd>具体适用条件与费用以产品说明为准。</dd></div></dl><div class="plan-disclaimer"><ShieldCheck :size="20" /><p>添加后将显示在行程中，状态为未预订计划。此操作不会出票、订房或付款。</p></div><p v-if="feedback" class="plan-added" role="status"><Check :size="17" />{{ feedback }}</p></div>
        <div class="dialog-actions"><button class="outline-button" @click="emit('favorite', selection)"><Heart :size="16" :fill="hasFavorite(selection) ? 'currentColor' : 'none'" />{{ hasFavorite(selection) ? '取消收藏' : '收藏产品' }}</button><button v-if="hasPlan(selection)" class="primary-button" @click="closeDetail(); emit('view-trip')">查看行程 <ArrowRight :size="15" /></button><button v-else class="primary-button" @click="addPlan(selection)">加入未预订计划 <ArrowRight :size="15" /></button></div>
      </section>
    </div>
  </Teleport>
</template>
