<script setup>
import InteractiveHoverButton from './ui/InteractiveHoverButton.vue'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ArrowLeft, ArrowLeftRight, ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Compass, Heart, Hotel, MapPin, Minus, Plane, Plus, Search, ShieldCheck, Sparkles, TrainFront, X } from 'lucide-vue-next'
import TravelMap from './TravelMap.vue'
import hotelLakesideImage from '../assets/hotel-lakeside.webp'
import hotelRetreatImage from '../assets/hotel-retreat.webp'
import hotelBedroomImage from '../assets/hotel-bedroom.webp'
import hotelSuiteImage from '../assets/hotel-suite.webp'
import hotelGardenRoomImage from '../assets/hotel-garden-room.webp'
import westLakeImage from '../assets/west-lake.webp'
import beijingTourImage from '../assets/tour-beijing.jpg'
import chengduTourImage from '../assets/tour-chengdu.jpg'
import shanghaiTourImage from '../assets/tour-shanghai.jpg'
import guangzhouTourImage from '../assets/tour-guangzhou.jpg'
import suzhouTourImage from '../assets/tour-suzhou.jpg'
import { productImage } from '../product-media.js'
import { calculatePackagePrice, findPackageComponent, searchValuesFromRoute, tourismPackages } from '../tourism-packages.js'
import { retainTravellerSelection, toggleTravellerSelection } from '../traveller-selection.js'
import { normalizeTransportCity, returnSearchValues } from '../roundtrip.js'
import TourPackageDetail from './TourPackageDetail.vue'

const props = defineProps({
  channel: String, config: Object, favorites: Array, plans: Array, searchSeed: Object,
  resultView: Boolean, searchState: Object, productRouteId: String, productRouteMode: String, productReturnHash: String,
})
const emit = defineEmits(['add-plan', 'favorite', 'home', 'navigate', 'open-assistant', 'view-trip', 'order-created', 'search', 'edit-search', 'return-assistant', 'product-open', 'purchase-open', 'roundtrip-purchase', 'purchase-back', 'product-close'])
const form = ref({})
const submitted = ref(props.resultView ? { ...props.searchState?.values } : null)
const searched = ref(Boolean(props.resultView && props.searchState))
const demoCatalog = ref([])
const packageProducts = ref({})
const packagePriceState = ref('idle')
const catalogLoading = ref(false)
const catalogError = ref('')
let catalogRequest = 0
const selection = ref(null)
const productLoadError = ref('')
let detailRequest = 0
const checkoutOpen = ref(false)
const checkoutBusy = ref(false)
const checkoutError = ref('')
const checkoutResult = ref(null)
const tripProjects = ref([])
const savedTravellers = ref([])
const selectedTravellerIds = ref([])
const addingTraveller = ref(false)
const travellerName = ref('')
const travellerIdentityNumber = ref('')
const selectedProjectId = ref('')
const selectedOfferId = ref('')
const detailPhoto = ref('')
const purchaseDate = ref('')
const purchaseCheckIn = ref('')
const purchaseCheckOut = ref('')
const passengerCount = ref(1)
const roomCount = ref(1)
const adultCount = ref(1)
const guestCount = ref(1)
const childCount = ref(0)
watch([selectedOfferId, purchaseDate, purchaseCheckIn, purchaseCheckOut, passengerCount, roomCount, guestCount], () => {
  feedback.value = ''
})
const requiredTravellerCount = computed(() => props.channel === '酒店' ? guestCount.value : passengerCount.value)
watch(requiredTravellerCount, count => {
  selectedTravellerIds.value = selectedTravellerIds.value.slice(0, count)
})
const guestPickerOpen = ref(false)
const guestPickerRef = ref(null)
const passengerPickerOpen = ref(false)
const passengerPickerRef = ref(null)
const checkoutCountPickerOpen = ref(false)
const checkoutCountPickerRef = ref(null)
const checkoutCountTriggerRef = ref(null)
const checkoutCountPopoverRef = ref(null)
const tripType = ref(props.searchState?.tripType || '单程')
const sort = ref('推荐排序')
const filter = ref('全部')
const formError = ref('')
const feedback = ref('')
const outboundFlight = ref(null)
const roundtripReturnFlight = ref(null)
const roundtripError = ref('')
const roundtripActive = computed(() => ['机票', '火车票'].includes(props.channel) && props.resultView && tripType.value === '往返')
const isRoundtripOutboundCheckout = computed(() => Boolean(roundtripReturnFlight.value && selection.value?.id === outboundFlight.value?.id))
const closeButton = ref(null)
const selectedTourRegion = ref('热门推荐')
const selectedTourDestination = ref('')
const tourKeyword = ref('')
const selectedGuideRegion = ref('国内（含港澳台）')
const guidePanelOpen = ref(false)
const selectedGuideDestination = ref('')
const guideSearchQuery = ref('')
const promoIndex = ref(0)
const promoTop = ref(123)
const promoHeight = ref(0)
let promoTimer
const lakePhoto = westLakeImage
const tourImages = {
  北京: { image: beijingTourImage, alt: '北京天坛', author: 'Balon Greyjoy', license: 'CC0', source: 'https://commons.wikimedia.org/wiki/File:20200110_Temple_of_Heaven-1.jpg', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  成都: { image: chengduTourImage, alt: '成都大熊猫繁育研究基地', author: 'CEphoto, Uwe Aranas', license: 'CC BY-SA 3.0', source: 'https://commons.wikimedia.org/wiki/File:Chengdu_Sichuan_China_Panda-breeding-and-research-center-02.jpg', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/' },
  上海: { image: shanghaiTourImage, alt: '上海浦东滨江天际线', author: 'Ermell', license: 'CC0', source: 'https://commons.wikimedia.org/wiki/File:Shanghai_skyline_waterfront_pudong_5166168_69_70.jpg', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  广州: { image: guangzhouTourImage, alt: '广州城市天际线', author: '中少', license: 'CC BY-SA 4.0', source: 'https://commons.wikimedia.org/wiki/File:Guangzhou_Skyline_20210522-01.jpg', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  苏州: { image: suzhouTourImage, alt: '苏州拙政园', author: 'King of Hearts', license: 'CC BY-SA 4.0', source: 'https://commons.wikimedia.org/wiki/File:Humble_Administrator%27s_Garden_Suzhou_November_2017_005.jpg', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' },
}
const hotelPromos = [
  {
    eyebrow: 'ISLAND RETREAT',
    title: '住进海风里，把假期留给清晨',
    subtitle: '海岛度假 · 临海住宿灵感',
    image: hotelLakesideImage,
  },
  {
    eyebrow: 'GARDEN HIDEAWAY',
    title: '在庭院住一晚，听风慢下来',
    subtitle: '庭院小住 · 亲近自然',
    image: hotelGardenRoomImage,
  },
  {
    eyebrow: 'WEEKEND CITY STAY',
    title: '把城市周末，安排得刚刚好',
    subtitle: '城市漫游 · 出行与休憩',
    image: hotelSuiteImage,
  },
]
const flightPromoImage = 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1400&q=85'
const tourRegions = [
  { name: '热门推荐', places: ['三亚', '重庆', '厦门', '西双版纳', '大理', '日本', '成都', '北京', '新加坡', '土耳其', '沈阳', '韩国', '桂林', '西安', '昆明', '九寨沟', '冰岛', '香港', '济州岛', '马尔代夫', '泰国', '上海', '巴厘岛'] },
  { name: '云南 / 贵州', places: ['云南', '西双版纳', '大理', '昆明', '贵阳', '丽江', '腾冲', '香格里拉', '贵州', '荔波', '黄果树', '梵净山'] },
  { name: '海南 / 福建', places: ['三亚', '厦门', '泉州', '海口', '福州', '万宁', '陵水', '鼓浪屿', '平潭', '漳州'] },
  { name: '东北', places: ['沈阳', '哈尔滨', '长白山', '丹东', '漠河', '雪乡', '延吉', '大连', '本溪', '长春'] },
  { name: '中国港澳台', places: ['香港', '澳门', '台湾', '日月潭', '台北', '九份', '台中', '高雄'] },
  { name: '国内其他', places: ['重庆', '成都', '北京', '桂林', '西安', '九寨沟', '上海', '张家界', '青岛', '南京'] },
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
  { name: '国内（含港澳台）', preview: '北京　上海　西安　大理', groups: [
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
  { title: '洱海与大理古城', subtitle: '沿湖骑行，在白族街巷间慢行', image: 'photo-1501785888041-af3ef285b470', tag: '云南 · 山水漫游', destination: '大理' },
  { title: '西安城墙与古城漫步', subtitle: '登城远望，沿街巷读一座古都', image: 'photo-1470252649378-9c29740c9fa8', tag: '陕西 · 城市漫步', destination: '西安' },
  { title: '鼓浪屿街巷与海岸', subtitle: '穿过老建筑，沿海边散步停留', image: 'photo-1519046904884-53103b34b206', tag: '福建 · 海岛漫游', destination: '厦门' },
]
const guideRouteRows = [
  { number: '01', title: '大理古城与洱海骑行', data: '半日 · 湖畔漫游', detail: '古城出发，沿洱海选择轻松路段', image: guideStories[0].image, index: 0, destination: '大理' },
  { number: '02', title: '西安城墙与碑林漫步', data: '约 3 小时 · 城市步行', detail: '城墙内外串联古迹与街巷', image: guideStories[1].image, index: 1, destination: '西安' },
  { number: '03', title: '鼓浪屿街巷与海岸线', data: '约 2 小时 · 海岛漫步', detail: '老建筑街巷与沿岸步道', image: guideStories[2].image, index: 2, destination: '厦门' },
]
const isTransport = computed(() => ['机票', '火车票', '汽车·船票'].includes(props.channel))
const isEditorial = computed(() => ['旅游', '攻略·景点', '门票·活动'].includes(props.channel))
const isHotel = computed(() => props.channel === '酒店')
const isTicket = computed(() => props.channel === '门票·活动')
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
    { key: 'checkin', label: '入住日期', type: 'date', value: '' },
    { key: 'checkout', label: '退房日期', type: 'date', value: '' },
  ]
  if (field.key === 'return' && tripType.value === '单程') return []
  if (['dates', 'depart', 'return', 'date'].includes(field.key)) return [{ ...field, type: 'date', value: '' }]
  if (field.key === 'time') return [{ ...field, type: 'time', value: '' }]
  return [{ ...field, type: 'text', value: '' }]
}))
const filters = computed(() => props.channel === '酒店' ? ['全部', '含早餐', '免费取消'] : props.channel === '机票' ? ['全部', '直飞', '经停'] : props.channel === '火车票' ? ['全部', '上午出发', '下午出发'] : props.channel === '攻略·景点' ? ['全部', '山水漫游', '城市漫步', '海岛漫游'] : props.channel === '门票·活动' ? ['全部', '景区门票', '游船', '演出'] : ['全部'])
const products = computed(() => {
  if (isTourHome.value) return tourismPackages.map((item, index) => {
    const packagePricing = calculatePackagePrice(item, packageProducts.value)
    return {
      ...item,
      index,
      channel: '旅游',
      price: packagePricing ? `¥ ${packagePricing.discountedTotal.toLocaleString('zh-CN')}` : '价格暂不可用',
      amount: packagePricing?.discountedTotal || 0,
      packagePricing,
      photo: tourImages[item.destination],
    }
  })
  if (isGuideHome.value && props.productRouteId) return demoCatalog.value.filter(product => product.type === 'sight').map(product => ({
    ...product, index: 0, channel: props.channel, note: product.provider, price: product.price ? `¥ ${product.price}` : '免费', amount: Number(product.price) || 0,
  }))
  const type = { 酒店: 'hotel', 机票: 'flight', 火车票: 'train' }[props.channel]
  if (type) {
    const records = demoCatalog.value.filter(product => product.type === type)
    return records.map((product, index) => {
      const cityIndex = records.slice(0, index).filter(item => item.destination === product.destination).length
      return {
        ...product,
        image: type === 'hotel' ? productImage(product) : product.image,
        channel: props.channel,
        index: cityIndex,
        price: `¥ ${product.price}`,
        note: product.provider,
        amount: Number(product.price) || 0,
        date: submitted.value?.checkin || submitted.value?.depart || submitted.value?.date || '2027-06-14',
        area: product.detail.split('·')[0].trim(),
        stars: [4, 4, 3, 5][cityIndex % 4],
        score: ['4.8', '4.9', '4.7', '4.9'][cityIndex % 4],
        grade: cityIndex === 2 ? '很好' : '超棒',
        reviews: `${1850 + cityIndex * 570}条评价`,
        oldPrice: `¥ ${Math.round(product.price * 1.15)}`,
      }
    })
  }
  return props.config.samples.map((sample, index) => ({
    id: `${props.channel}-${index}`, channel: props.channel, title: sample[0], detail: sample[1], price: sample[2], note: sample[3], index,
    ...(sample[4] || {}),
    amount: Number(sample[2].replace(/[^\d.]/g, '')) || 0,
    date: submitted.value?.checkin || submitted.value?.depart || submitted.value?.date || submitted.value?.dates || '2027-06-14',
  }))
})
const resultItems = computed(() => {
  let items = products.value
  const values = submitted.value
  if (values) {
    if (props.channel === '酒店') {
      const destination = values.destination.trim()
      if (destination) items = items.filter(item => item.destination.includes(destination) || item.title.includes(destination))
    }
    if (['机票', '火车票'].includes(props.channel)) {
      const origin = normalizeTransportCity(values.origin)
      const destination = normalizeTransportCity(values.destination)
      items = items.filter(item => normalizeTransportCity(item.origin) === origin && normalizeTransportCity(item.arrivalCity) === destination)
      if (values.depart) items = items.filter(item => item.travelDate === values.depart)
    }
    if (props.channel === '汽车·船票') {
      if (!/杭州|武林/.test(values.origin)) return []
      items = items.filter(item => item.title.includes(values.destination.trim()))
    }
    if (props.channel === '用车' && (!/杭州|湖滨/.test(values.pickup) || !/杭州|东站|萧山|西湖/.test(values.dropoff))) return []
    if ((isTourHome.value || isGuideHome.value) && values.destination) {
      items = items.filter(item => item.destination === values.destination.trim() || item.title.includes(values.destination.trim()))
    }
    if (isTourHome.value && values.origin?.trim()) items = items.filter(item => item.origin === values.origin.trim())
    const keyword = (values.keyword || '').trim()
    if (keyword) items = items.filter(item => `${item.title} ${item.detail} ${item.note}`.includes(keyword))
  }
  if (filter.value !== '全部') {
    const indexFilters = { '上午出发': [0, 1], '下午出发': [2], '山水漫游': [0], '城市漫步': [1], '海岛漫游': [2], '景区门票': [1], 游船: [0], 演出: [2] }
    if (props.channel === '机票') items = filter.value === '直飞' ? items.filter(item => item.stop === '直飞') : filter.value === '经停' ? items.filter(item => item.stop !== '直飞') : items
    else if (props.channel === '酒店') items = filter.value === '免费取消' ? items.filter(item => /免费取消/.test(item.detail)) : filter.value === '含早餐' ? items.filter(item => /含早餐/.test(item.detail)) : items
    else items = indexFilters[filter.value] ? items.filter(item => indexFilters[filter.value].includes(item.index)) : items.filter(item => `${item.title}${item.detail}`.includes(filter.value))
  }
  return [...items].sort((a, b) => sort.value === '价格从低到高' ? a.amount - b.amount : sort.value === '价格从高到低' ? b.amount - a.amount : props.channel === '酒店' ? 0 : a.index - b.index)
})
const displayChannel = computed(() => ({ '攻略·景点': '景点', '旅游地图': '地图' })[props.channel] || props.channel)
const resultTitle = computed(() => searched.value ? `${displayChannel.value}搜索结果` : props.channel === '攻略·景点' ? '旅行灵感' : props.channel === '旅游地图' ? '地点与路线' : `${displayChannel.value}推荐`)
const hasFavorite = item => props.favorites.some(saved => saved.id === item.id)
const bookable = computed(() => ['酒店', '机票', '火车票'].includes(props.channel))
const hasPlan = item => !bookable.value && props.plans.some(saved => saved.id === item.id)
const savedPlan = computed(() => Boolean(selection.value && !bookable.value && props.plans.some(saved => saved.id === selection.value.id)))
watch(savedPlan, saved => {
  if (saved) feedback.value = '已加入计划'
  else if (feedback.value === '已加入计划') feedback.value = ''
}, { immediate: true })
const purchaseTotal = computed(() => {
  const unitPrice = Number(selection.value?.amount || 0) + Number(selectedOffer.value?.priceDelta || 0)
  if (isHotel.value) {
    const nights = Math.max(0, (Date.parse(`${purchaseCheckOut.value}T00:00:00Z`) - Date.parse(`${purchaseCheckIn.value}T00:00:00Z`)) / 86400000)
    return unitPrice * nights * roomCount.value
  }
  return unitPrice * passengerCount.value
})
const availableOffers = computed(() => selection.value?.offers || [])
const selectedOffer = computed(() => availableOffers.value.find(offer => offer.id === selectedOfferId.value) || availableOffers.value[0] || null)
const hotelDetailPhotos = computed(() => selection.value
  ? [selection.value.image, hotelBedroomImage, hotelSuiteImage, hotelGardenRoomImage].filter((image, index, images) => image && images.indexOf(image) === index).slice(0, 4)
  : [])
const offerPrice = offer => Number(selection.value?.amount || 0) + Number(offer.priceDelta || 0)
const upcomingProjects = computed(() => tripProjects.value.filter(project =>
  ['planning', 'active'].includes(project.status)
  && (!project.tripStartDate || project.tripStartDate >= new Date().toISOString().slice(0, 10)),
))
const fieldOptions = field => {
  return null
}
const guestSummary = computed(() => `${roomCount.value}间 · ${adultCount.value + childCount.value}位`)
const passengerSummary = computed(() => `${passengerCount.value}位成人`)
const guestCounters = computed(() => [
  { key: 'rooms', label: '房间', note: '', value: roomCount.value, min: 1, max: 8 },
  { key: 'adults', label: '成人', note: '18岁及以上', value: adultCount.value, min: 1, max: 16 },
  { key: 'children', label: '儿童', note: '0-17岁', value: childCount.value, min: 0, max: 8 },
])
function resetForm() {
  roomCount.value = 1
  adultCount.value = 1
  guestCount.value = 1
  childCount.value = 0
  guestPickerOpen.value = false
  passengerCount.value = 1
  passengerPickerOpen.value = false
  form.value = Object.fromEntries(fields.value.map(field => [
    field.key,
    field.key === 'guests' ? guestSummary.value : field.key === 'passengers' ? passengerSummary.value : field.value,
  ]))
}
function adjustOccupancy(type, change) {
  const counts = {
    rooms: [roomCount, 1, 8],
    adults: [adultCount, 1, 16],
    children: [childCount, 0, 8],
  }
  const [count, minimum, maximum] = counts[type]
  count.value = Math.max(minimum, Math.min(maximum, count.value + change))
  form.value.guests = guestSummary.value
}
function setGuestPickerRef(element) {
  guestPickerRef.value = element
}
function adjustPassengers(change) {
  passengerCount.value = Math.max(1, Math.min(9, passengerCount.value + change))
  form.value.passengers = passengerSummary.value
}
function setPassengerPickerRef(element) {
  passengerPickerRef.value = element
}
function closeGuestPickerOnOutside(event) {
  if (!guestPickerRef.value?.contains(event.target)) guestPickerOpen.value = false
  if (!passengerPickerRef.value?.contains(event.target)) passengerPickerOpen.value = false
  if (!checkoutCountPickerRef.value?.contains(event.target)) checkoutCountPickerOpen.value = false
}
function adjustCheckoutCount(type, change) {
  const [count, maximum] = type === 'rooms' ? [roomCount, 5] : type === 'guests' ? [guestCount, 9] : [passengerCount, 9]
  count.value = Math.max(1, change > 0 ? Math.min(maximum, count.value + change) : count.value + change)
}
function closeCheckoutCountPicker() {
  checkoutCountPickerOpen.value = false
  nextTick(() => checkoutCountTriggerRef.value?.focus())
}
function toggleCheckoutCountPicker() {
  checkoutCountPickerOpen.value = !checkoutCountPickerOpen.value
  if (checkoutCountPickerOpen.value) nextTick(() => checkoutCountPopoverRef.value?.scrollIntoView({ block: 'nearest', inline: 'nearest' }))
}
async function loadDemoCatalog(searchState = null) {
  const type = { 酒店: 'hotel', 机票: 'flight', 火车票: 'train' }[props.channel]
  if (!type) return
  const requestId = ++catalogRequest
  catalogLoading.value = true
  catalogError.value = ''
  try {
    const params = new URLSearchParams({ type })
    if (searchState && ['flight', 'train'].includes(type)) {
      params.set('origin', searchState.values.origin)
      params.set('destination', searchState.values.destination)
      params.set('travelDate', searchState.values.depart)
    } else if (searchState && type === 'hotel' && searchState.values.destination) {
      params.set('destination', searchState.values.destination)
      params.set('checkIn', searchState.values.checkin)
      params.set('checkOut', searchState.values.checkout)
    } else {
      params.set('limit', '12')
      if (type === 'flight') params.set('recommend', 'low-fare')
    }
    const response = await fetch(`/api/products?${params}`)
    if (!response.ok) throw new Error('无法读取演示商品')
    const data = await response.json()
    if (requestId === catalogRequest) demoCatalog.value = data.products
  } catch (failure) {
    if (requestId === catalogRequest) catalogError.value = failure.message || '商品数据加载失败'
  } finally {
    if (requestId === catalogRequest) catalogLoading.value = false
  }
}
async function loadTourPackagePrices() {
  packagePriceState.value = 'loading'
  const ids = [...new Set(tourismPackages.flatMap(item =>
    item.components.filter(component => ['机票', '火车票', '酒店'].includes(component.channel)).map(component => component.id),
  ))]
  const entries = await Promise.all(ids.map(async id => {
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(id)}`)
      if (!response.ok) return [id, null]
      const { product } = await response.json()
      return [id, product]
    } catch {
      return [id, null]
    }
  }))
  packageProducts.value = Object.fromEntries(entries)
  packagePriceState.value = 'loaded'
}
resetForm()
function submitSearch() {
  formError.value = ''
  const requiredFields = ['酒店', '机票', '火车票'].includes(props.channel)
    ? fields.value.filter(field => field.key !== 'keyword').map(field => field.key)
    : []
  if (requiredFields.some(key => !String(form.value[key] || '').trim())) {
    formError.value = '请补全搜索条件。'
    return
  }
  if (props.channel === '酒店' && form.value.checkout <= form.value.checkin) {
    formError.value = '退房日期需要晚于入住日期。'
    return
  }
  if (['机票', '火车票'].includes(props.channel) && tripType.value === '往返' && form.value.return < form.value.depart) {
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
  emit('search', { channel: props.channel, values: submitted.value, tripType: tripType.value })
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
  const destination = selectedTourDestination.value || tourKeyword.value.trim()
  if (!destination) {
    formError.value = '请先选择目的地。'
    return
  }
  form.value.destination = destination
  form.value.keyword = selectedTourDestination.value ? tourKeyword.value.trim() : ''
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
  const query = guideSearchQuery.value.trim()
  const destination = selectedGuideDestination.value || query
  form.value.destination = destination
  form.value.keyword = query === destination ? '' : query
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
watch(() => props.searchState, state => {
  if (!state) return
  outboundFlight.value = null
  roundtripError.value = ''
  form.value = { ...form.value, ...state.values }
  tripType.value = state.tripType || '单程'
  if (!props.resultView) return
  submitted.value = { ...state.values }
  searched.value = true
  loadDemoCatalog(state)
})
watch(() => props.resultView, resultView => {
  if (resultView) return
  if (props.searchState) {
    form.value = { ...form.value, ...props.searchState.values }
    tripType.value = props.searchState.tripType || '单程'
  }
  if (isTransport.value) {
    submitted.value = null
    searched.value = false
  }
  if (!isTransport.value && !isHotel.value) return
  submitted.value = null
  searched.value = false
  loadDemoCatalog()
})
function openDetail(item) {
  outboundFlight.value = null
  roundtripReturnFlight.value = null
  roundtripError.value = ''
  if (['酒店', '机票', '火车票', '旅游'].includes(props.channel)) {
    emit('product-open', item.id)
    return
  }
  prepareSelection(item)
  checkoutOpen.value = false
}
function restartOutbound() {
  outboundFlight.value = null
  roundtripReturnFlight.value = null
  roundtripError.value = ''
  submitted.value = { ...props.searchState.values }
  loadDemoCatalog({ values: submitted.value })
}
async function selectRoundtripFlight(item) {
  roundtripError.value = ''
  const original = props.searchState?.values
  if (!original?.origin || !original.destination || !original.depart || !original.return) {
    roundtripError.value = '往返搜索条件不完整，请重新搜索。'
    return
  }
  if (!outboundFlight.value) {
    outboundFlight.value = item
    submitted.value = returnSearchValues(original)
    filter.value = '全部'
    await loadDemoCatalog({ values: submitted.value })
    return
  }
  const outbound = outboundFlight.value
  roundtripReturnFlight.value = item
  prepareSelection(outbound)
  emit('roundtrip-purchase', outbound.id)
}
function continueRoundtripReturn() {
  if (!roundtripReturnFlight.value) return
  prepareSelection(roundtripReturnFlight.value, selectedTravellerIds.value)
  emit('roundtrip-purchase', roundtripReturnFlight.value.id)
}
function prepareSelection(item, preferredTravellerIds = []) {
  selection.value = item
  checkoutCountPickerOpen.value = false
  selectedProjectId.value = ''
  selectedOfferId.value = item.offers?.[0]?.id || ''
  detailPhoto.value = item.image || ''
  feedback.value = ''
  checkoutError.value = ''
  checkoutResult.value = null
  selectedTravellerIds.value = preferredTravellerIds
  addingTraveller.value = false
  const packageComponent = findPackageComponent(item.id, props.productReturnHash)?.component
  const routeValues = searchValuesFromRoute(props.productReturnHash, props.channel)
  const checkIn = packageComponent?.checkIn || routeValues.checkin || submitted.value?.checkin || form.value.checkin || item.checkInStart || item.date || ''
  const requestedCheckOut = packageComponent?.checkOut || routeValues.checkout || submitted.value?.checkout || form.value.checkout || item.checkOut || ''
  purchaseDate.value = packageComponent?.travelDate || item.travelDate || routeValues.depart || item.date || submitted.value?.depart || form.value.depart || ''
  purchaseCheckIn.value = checkIn
  const minimumCheckOut = checkIn
    ? new Date(new Date(`${checkIn}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10)
    : ''
  purchaseCheckOut.value = requestedCheckOut > checkIn ? requestedCheckOut : minimumCheckOut
  passengerCount.value = Number.parseInt(form.value.passengers || '1', 10)
  roomCount.value = Number.parseInt(form.value.guests || '1', 10) || 1
  guestCount.value = Number.parseInt(form.value.guests?.match(/·\s*(\d+)\s*位/)?.[1] || '1', 10)
  loadTripProjects()
  loadSavedTravellers(preferredTravellerIds)
  nextTick(() => closeButton.value?.focus())
}
async function loadProductRoute(id) {
  const requestId = ++detailRequest
  productLoadError.value = ''
  if (!id) {
    selection.value = null
    return
  }
  if (isTourHome.value) {
    const item = products.value.find(product => product.id === id)
    if (item) prepareSelection(item)
    else { selection.value = null; productLoadError.value = '没有找到该演示套餐' }
    return
  }
  const existing = products.value.find(item => item.id === id)
  if (existing) {
    const preferredTravellerIds = roundtripReturnFlight.value?.id === existing.id
      ? selectedTravellerIds.value
      : []
    prepareSelection(existing, preferredTravellerIds)
    return
  }
  try {
    const response = await fetch(`/api/products/${encodeURIComponent(id)}`)
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || '无法读取商品信息')
    if (requestId !== detailRequest) return
    demoCatalog.value = [data.product]
    await nextTick()
    const item = products.value.find(product => product.id === id)
    if (!item) throw new Error('商品数据格式无效')
    prepareSelection(item)
  } catch (failure) {
    if (requestId !== detailRequest) return
    productLoadError.value = failure.message || '商品信息加载失败'
  }
}
watch(() => props.productRouteId, loadProductRoute, { immediate: true })
watch(() => props.productRouteMode, mode => {
  checkoutOpen.value = mode === 'purchase'
  checkoutCountPickerOpen.value = false
}, { immediate: true })
async function loadTripProjects() {
  try {
    const response = await fetch('/api/projects')
    if (!response.ok) return
    const data = await response.json()
    tripProjects.value = data.projects || []
  } catch {}
}
async function loadSavedTravellers(preferredTravellerIds = []) {
  try {
    const response = await fetch('/api/travellers')
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || '无法读取出行人资料')
    savedTravellers.value = data.travellers || []
    selectedTravellerIds.value = retainTravellerSelection(
      savedTravellers.value, preferredTravellerIds, requiredTravellerCount.value,
    )
  } catch (failure) {
    checkoutError.value = failure.message || '无法读取出行人资料'
  }
}
function toggleTraveller(id) {
  selectedTravellerIds.value = toggleTravellerSelection(selectedTravellerIds.value, id, requiredTravellerCount.value)
}
async function addTraveller() {
  checkoutError.value = ''
  try {
    const response = await fetch('/api/travellers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: travellerName.value, identityNumber: travellerIdentityNumber.value }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || '保存出行人失败')
    savedTravellers.value.push(data.traveller)
    if (selectedTravellerIds.value.length < requiredTravellerCount.value) {
      selectedTravellerIds.value = [...selectedTravellerIds.value, data.traveller.id]
    }
    travellerName.value = ''
    travellerIdentityNumber.value = ''
    addingTraveller.value = false
  } catch (failure) {
    checkoutError.value = failure.message || '保存出行人失败'
  }
}
function closeDetail() {
  if (!props.productRouteId) {
    selection.value = null
    return
  }
  emit('product-close')
}
function beginCheckout() {
  if (props.productRouteId) emit('purchase-open')
  else checkoutOpen.value = true
}
function onModalKey(event) {
  if (event.key === 'Escape') {
    if (checkoutCountPickerOpen.value) closeCheckoutCountPicker()
    else if (guestPickerOpen.value) guestPickerOpen.value = false
    else if (passengerPickerOpen.value) passengerPickerOpen.value = false
    else if (selection.value && checkoutOpen.value) emit('purchase-back')
    else if (selection.value) closeDetail()
    return
  }
  if (!selection.value) return
  if (event.key !== 'Tab') return

  const dialog = document.querySelector('.product-dialog')
  const focusable = [...dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter(element => element.getClientRects().length > 0)
  const first = focusable[0]
  const last = focusable.at(-1)
  if (!first) {
    event.preventDefault()
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
async function addPlan(item) {
  if (!bookable.value) emit('add-plan', item)
}
function bookingPayload() {
  return {
    productId: selection.value.id,
    projectId: selectedProjectId.value || null,
    travellerIds: selectedTravellerIds.value,
    offerId: selectedOfferId.value || undefined,
    ...(isHotel.value
      ? { checkIn: purchaseCheckIn.value, checkOut: purchaseCheckOut.value, rooms: roomCount.value, guests: guestCount.value }
      : { travelDate: purchaseDate.value, passengers: passengerCount.value }),
  }
}
async function placeOrder() {
  checkoutBusy.value = true
  checkoutError.value = ''
  try {
    if (selectedTravellerIds.value.length !== requiredTravellerCount.value) {
      throw new Error(`请选择 ${requiredTravellerCount.value} 位出行人。`)
    }
    const body = bookingPayload()
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || '下单失败，请重试')
    checkoutResult.value = data
    emit('order-created', data)
    await nextTick()
    document.querySelector('.checkout-success')?.scrollIntoView({ block: 'center' })
  } catch (error) {
    checkoutError.value = error.message || '下单失败，请重试'
  } finally {
    checkoutBusy.value = false
  }
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
  promoHeight.value = Math.max(0, window.innerHeight - promoTop.value - 18)
}
onMounted(() => {
  if (props.searchState) {
    form.value = { ...form.value, ...props.searchState.values }
    tripType.value = props.searchState.tripType || '单程'
  }
  applySeed(props.searchSeed)
  if (!props.productRouteId) loadDemoCatalog(props.resultView ? props.searchState : null)
  if (isTourHome.value) loadTourPackagePrices()
  window.addEventListener('keydown', onModalKey)
  document.addEventListener('pointerdown', closeGuestPickerOnOutside)
  if (isHotel.value) {
    for (const promo of hotelPromos) {
      const image = new Image()
      image.src = promo.image
    }
    syncHotelPromoPosition()
    window.addEventListener('resize', syncHotelPromoPosition)
  }
  startPromoTimer()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onModalKey)
  document.removeEventListener('pointerdown', closeGuestPickerOnOutside)
  window.removeEventListener('resize', syncHotelPromoPosition)
  window.clearInterval(promoTimer)
})
</script>

<template>
  <TravelMap v-if="isMap" :favorites="favorites" :plans="plans" @add-plan="emit('add-plan', $event)" />
  <section v-else class="product-channel" :class="{ 'transport-channel': isTransport, 'editorial-channel': isEditorial, 'hotel-product-page': isHotel, 'ticket-product-page': isTicket, 'tour-product-page': isTourHome, 'guide-product-page': isGuideHome, 'search-results-page': resultView, 'product-route-active': Boolean(productRouteId) }">
    <div class="channel-topline">
      <button v-if="resultView && searchState?.returnHash" class="results-back" type="button" @click="emit('return-assistant')"><ChevronLeft :size="17" />返回行程</button>
      <button v-if="resultView" class="results-back" type="button" @click="emit('edit-search')"><ChevronLeft :size="17" />修改搜索</button>
      <strong>{{ resultView ? `${displayChannel}搜索结果` : channel === '酒店' ? '酒店预订' : displayChannel }}</strong>
      <span v-if="resultView && submitted" class="results-route-summary">{{ [submitted.origin, submitted.destination].filter(Boolean).join(' → ') }} · {{ submitted.depart }}</span>
    </div>
    <section v-if="!resultView && isTourHome" class="tour-discovery" aria-label="旅游目的地探索">
      <form class="tour-search-bar" @submit.prevent="searchTour">
        <label class="tour-origin"><MapPin :size="18" /><span class="tour-origin-label">出发城市</span><input v-model="form.origin" aria-label="出发城市" placeholder="请选择城市" /></label>
        <label class="tour-category"><span>全部产品</span><ChevronDown :size="16" /></label>
        <label class="tour-keyword"><Search :size="18" /><input v-model="tourKeyword" aria-label="目的地或主题关键词" placeholder="请输入目的地、主题或关键词" /></label>
        <InteractiveHoverButton class="tour-search-submit" type="submit" variant="solid" tone="orange"><Search :size="19" />搜索</InteractiveHoverButton>
      </form>
      <div class="tour-discovery-layout">
        <aside v-reveal="{ variant: 'left' }" class="tour-region-list" aria-label="选择目的地区域">
          <button v-for="region in tourRegions" :key="region.name" class="tour-region" :class="{ active: selectedTourRegion === region.name }" :aria-expanded="selectedTourRegion === region.name" aria-controls="tour-region-panel" @mouseenter="selectedTourRegion = region.name" @focus="selectedTourRegion = region.name" @click="selectedTourRegion = region.name">
            <strong>{{ region.name }}</strong><span>{{ region.places.slice(0, 7).join('  ') }}</span><ChevronRight :size="16" />
          </button>
        </aside>
        <div class="tour-feature-area">
          <template v-if="selectedTourRegion === '热门推荐'">
            <button v-reveal="{ variant: 'right', delay: 80 }" class="tour-main-banner" type="button" @click="emit('navigate', '攻略·景点')">
              <img src="https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1500&q=85" alt="水乡河道与山水风景" />
              <span class="tour-banner-shade"></span><span class="tour-banner-copy"><small>ESCAPE THE ORDINARY</small><strong>周边游</strong><b>发现旅途里的风景与日常</b><span>看线路灵感 <ArrowRight :size="15" /></span></span>
              <span class="tour-banner-note">风景图片为展示素材</span>
            </button>
            <div class="tour-mode-cards">
              <button v-for="(card, index) in tourPromoCards" :key="card.title" v-reveal="{ delay: index * 75 }" class="tour-mode-card" :class="`tone-${card.tone}`" type="button" @click="emit('navigate', card.channel)">
                <img :src="`https://images.unsplash.com/${card.image}?auto=format&fit=crop&w=600&h=720&q=80`" alt="" />
                <span class="tour-mode-shade"></span><span class="tour-mode-copy"><strong>{{ card.title }}</strong><small>{{ card.detail }}</small><b>去看看 <ArrowRight :size="15" /></b></span>
              </button>
            </div>
          </template>
          <div v-else id="tour-region-panel" class="tour-mega-panel" aria-live="polite">
            <div class="tour-mega-heading"><div><span>DESTINATIONS</span><h2>{{ activeTourRegion.name }}</h2></div><small>选择目的地，继续探索行程灵感</small></div>
            <div class="tour-destination-grid">
              <button v-for="(place, index) in activeTourPlaces" :key="`${selectedTourRegion}-${place.name}`" v-reveal="{ delay: (index % 6) * 54, variant: 'fade' }" class="tour-destination-card" :class="{ selected: selectedTourDestination === place.name }" type="button" @click="selectTourDestination(place.name)">
                <img :src="place.image" :alt="`${place.name}风景`" loading="lazy" /><span>{{ place.name }}</span>
              </button>
            </div>
            <div class="tour-quick-links"><div><strong>出境畅游</strong><span>日本　新加坡　土耳其　韩国　泰国　马来西亚</span></div><div><strong>国内目的地</strong><span>大理　厦门　西安　成都　南京　上海</span></div><div><strong>主题精选</strong><span>自然探索　亲子度假　城市漫游　山海假期</span></div></div>
          </div>
        </div>
      </div>
      <div v-if="feedback" class="tour-feedback" role="status">{{ feedback }}</div>
    </section>
    <section v-else-if="!resultView && isGuideHome" class="guide-discovery" aria-label="攻略与景点探索">
      <form class="guide-search-bar" @submit.prevent="searchGuide">
        <Search :size="21" />
        <input v-model="guideSearchQuery" aria-label="搜索城市、景点或游记" placeholder="搜索城市 / 景点 / 游记 / 问答 / 住宿" @input="selectedGuideDestination = ''" />
        <InteractiveHoverButton type="submit" tone="orange" variant="solid">搜索</InteractiveHoverButton>
      </form>
      <nav class="guide-topic-strip" aria-label="攻略内容分类">
        <button type="button" @click="showGuideRegion('国内（含港澳台）')"><MapPin :size="17" />目的地指南</button>
        <button type="button" @click="showGuideStories()"><Compass :size="17" />景点灵感</button>
        <button type="button" @click="emit('navigate', '旅游地图')"><MapPin :size="17" />行程线路 <ArrowRight :size="14" /></button>
      </nav>
      <div class="guide-discovery-layout">
        <aside v-reveal="{ variant: 'left' }" class="guide-region-list" aria-label="选择攻略目的地区域">
          <button v-for="region in guideRegions" :key="region.name" class="guide-region" :class="{ active: guidePanelOpen && selectedGuideRegion === region.name }" :aria-expanded="guidePanelOpen && selectedGuideRegion === region.name" aria-controls="guide-region-panel" @mouseenter="showGuideRegion(region.name)" @focus="showGuideRegion(region.name)" @click="showGuideRegion(region.name)">
            <strong>{{ region.name }}</strong><span>{{ region.preview }}</span><ChevronRight :size="17" />
          </button>
        </aside>
        <div class="guide-feature-area">
          <div v-if="!guidePanelOpen" class="guide-landing-feature">
            <button v-reveal="{ variant: 'right', delay: 80 }" class="guide-main-story" type="button" @click="selectedGuideDestination = '大理'; guideSearchQuery = ''; searchGuide()">
              <img src="https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1500&q=85" alt="雪峰与山谷风景" />
              <span class="guide-main-shade"></span><span class="guide-main-copy"><small>TRAVEL NOTES · 行走的灵感</small><strong>山海之间</strong><b>让每一段风景，都成为行程灵感</b><span>探索旅行攻略 <ArrowRight :size="16" /></span></span>
            </button>
            <div class="guide-story-cards">
              <button v-for="(story, index) in guideStories" :key="story.title" v-reveal="{ delay: index * 75 }" class="guide-story-card" type="button" @click="selectedGuideDestination = story.destination; guideSearchQuery = story.title; searchGuide()">
                <img :src="`https://images.unsplash.com/${story.image}?auto=format&fit=crop&w=600&h=380&q=80`" :alt="`${story.title}风景`" />
                <span class="guide-story-shade"></span><span class="guide-story-copy"><small>{{ story.tag }}</small><strong>{{ story.title }}</strong><span>{{ story.subtitle }}</span></span>
              </button>
            </div>
          </div>
          <section v-if="!guidePanelOpen" class="guide-route-list" aria-label="行程建议">
            <div class="guide-route-heading"><h2>行程建议</h2><span>按主题整理 · 时间为参考</span></div>
            <button v-for="(row, index) in guideRouteRows" :key="row.number" v-reveal="{ delay: index * 70, variant: 'fade' }" class="guide-route-row" type="button" @click="selectedGuideDestination = row.destination; guideSearchQuery = ''; searchGuide()">
              <span class="guide-route-number">{{ row.number }}</span>
              <img :src="`https://images.unsplash.com/${row.image}?auto=format&fit=crop&w=200&h=144&q=75`" :alt="`${row.title}缩略图`" loading="lazy" />
              <span class="guide-route-copy"><strong>{{ row.title }}</strong><small>{{ row.detail }}</small></span>
              <span class="guide-route-data">{{ row.data }}</span>
              <ArrowRight :size="16" />
            </button>
          </section>
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
    <div v-else-if="!resultView" class="channel-hero" :class="{ 'has-landscape': !isTransport, 'hotel-channel-hero': isHotel, 'train-channel-hero': channel === '火车票', 'flight-channel-hero': isFlight, 'flight-roundtrip': isFlight && tripType === '往返' }">
      <div v-reveal="{ variant: 'left' }" class="channel-search-panel">
        <div class="channel-search-heading"><div><h1>{{ config.title }}</h1><p>{{ config.subtitle }}</p></div><component :is="channel === '机票' ? Plane : channel === '火车票' ? TrainFront : channel === '酒店' ? Hotel : Compass" :size="42" :stroke-width="1.3" /></div>
        <form @submit.prevent="submitSearch">
          <div v-if="isFlight" class="flight-service-tabs"><button type="button" class="selected">国内 / 国际机票</button><button type="button" @click="feedback = '特价机票暂不可用。'">特价机票</button><button type="button" @click="feedback = '航班动态暂不可用。'">航班动态</button><button type="button" @click="feedback = '请在行程协同中查看可选方案。'">退票改签</button></div>
          <div v-if="isFlight" class="trip-type" role="radiogroup" aria-label="航程类型"><label v-for="type in ['单程', '往返']" :key="type"><input v-model="tripType" type="radio" :value="type" name="trip-type" />{{ type }}</label><span class="flight-separator"></span><label class="flight-travellers"><input type="checkbox" />带儿童</label><label class="flight-travellers"><input type="checkbox" />带婴儿</label><button type="button" class="flight-cabin" @click="feedback = '当前提供经济舱。'">经济舱 <ChevronRight :size="13" /></button></div>
          <div v-if="channel === '火车票'" class="train-trip-type" role="radiogroup" aria-label="行程类型"><label v-for="type in ['单程', '往返']" :key="type"><input v-model="tripType" type="radio" :value="type" name="train-trip-type" />{{ type }}</label></div>
          <div class="channel-fields" :class="{ 'transport-search-fields': isTransport && !isFlight }">
            <div v-for="field in fields" :key="field.key" class="channel-field" :class="[`field-${field.key}`, {
              'guest-picker-field': isHotel && field.key === 'guests',
              'is-guest-picker-open': isHotel && field.key === 'guests' && guestPickerOpen,
              'passenger-picker-field': channel === '火车票' && field.key === 'passengers',
              'is-passenger-picker-open': channel === '火车票' && field.key === 'passengers' && passengerPickerOpen,
            }]">
              <template v-if="isHotel && field.key === 'guests'">
                <span>{{ field.label }}</span>
                <div :ref="setGuestPickerRef" class="guest-picker-anchor">
                  <button type="button" class="guest-picker-trigger" :aria-expanded="guestPickerOpen" aria-haspopup="dialog" @click.stop="guestPickerOpen = !guestPickerOpen">
                    {{ guestSummary }}<ChevronDown :size="18" :class="{ 'is-open': guestPickerOpen }" />
                  </button>
                  <Transition name="guest-picker">
                    <div v-if="guestPickerOpen" class="guest-picker-popover" role="dialog" aria-label="选择房间及住客" @click.stop>
                      <div v-for="counter in guestCounters" :key="counter.key" class="guest-counter-row">
                        <span class="guest-counter-label">{{ counter.label }} <small v-if="counter.note">{{ counter.note }}</small></span>
                        <div class="guest-counter-controls">
                          <button type="button" :aria-label="`减少${counter.label}`" :disabled="counter.value <= counter.min" @click="adjustOccupancy(counter.key, -1)"><Minus :size="14" /></button>
                          <span aria-live="polite">{{ counter.value }}</span>
                          <button type="button" :aria-label="`增加${counter.label}`" :disabled="counter.value >= counter.max" @click="adjustOccupancy(counter.key, 1)"><Plus :size="14" /></button>
                        </div>
                      </div>
                      <button type="button" class="guest-picker-done" @click="guestPickerOpen = false">完成</button>
                    </div>
                  </Transition>
                </div>
              </template>
              <template v-else-if="channel === '火车票' && field.key === 'passengers'">
                <span>{{ field.label }}</span>
                <div :ref="setPassengerPickerRef" class="guest-picker-anchor">
                  <button type="button" class="guest-picker-trigger" :aria-expanded="passengerPickerOpen" aria-haspopup="dialog" @click.stop="passengerPickerOpen = !passengerPickerOpen">
                    {{ passengerSummary }}<ChevronDown :size="18" :class="{ 'is-open': passengerPickerOpen }" />
                  </button>
                  <Transition name="passenger-picker">
                    <div v-if="passengerPickerOpen" class="passenger-picker-popover" role="dialog" aria-label="选择乘车人数" @click.stop>
                      <div class="guest-counter-row">
                        <span class="guest-counter-label">成人 <small>每位旅客一张车票</small></span>
                        <div class="guest-counter-controls">
                          <button type="button" aria-label="减少乘车人数" :disabled="passengerCount <= 1" @click="adjustPassengers(-1)"><Minus :size="14" /></button>
                          <span aria-live="polite">{{ passengerCount }}</span>
                          <button type="button" aria-label="增加乘车人数" :disabled="passengerCount >= 9" @click="adjustPassengers(1)"><Plus :size="14" /></button>
                        </div>
                      </div>
                      <button type="button" class="guest-picker-done" @click="passengerPickerOpen = false">完成</button>
                    </div>
                  </Transition>
                </div>
              </template>
              <template v-else>
                <span>{{ field.label }}</span>
                <select v-if="fieldOptions(field)" v-model="form[field.key]" :aria-label="field.label" required><option disabled value="">请选择{{ field.label }}</option><option v-for="option in fieldOptions(field)" :key="option">{{ option }}</option></select>
                <input v-else v-model="form[field.key]" :type="field.type" :aria-label="field.label" :placeholder="field.key === 'keyword' ? '位置 / 名称 / 特色' : field.label" :required="['酒店', '机票', '火车票'].includes(channel) && field.key !== 'keyword'" />
              </template>
            </div>
            <button v-if="isTransport" type="button" class="swap-cities" aria-label="交换出发地和目的地" @click="swapCities"><ArrowLeftRight :size="17" /></button>
            <InteractiveHoverButton type="submit" class="primary-button channel-submit" :class="{ 'flight-search-button': isFlight }" variant="solid" tone="orange"><Search :size="21" />搜索{{ isFlight ? '机票' : '' }}</InteractiveHoverButton>
          </div>
          <p v-if="formError || feedback" class="channel-form-error" role="status">{{ formError || feedback }}</p>
        </form>
        <div class="search-assurance"><ShieldCheck :size="15" /><span>选择商品后查看详情并直接办理</span></div>
      </div>
      <div v-if="isHotel" v-reveal="{ variant: 'right', delay: 80 }" class="hotel-promo" :style="{ '--hotel-promo-top': `${promoTop}px`, '--hotel-promo-height': `${promoHeight}px` }">
        <Transition name="hotel-promo-slide"><img :key="promoIndex" class="hotel-promo-image" :src="hotelPromos[promoIndex].image" alt="" /></Transition>
        <span class="promo-eyebrow">{{ hotelPromos[promoIndex].eyebrow }}</span>
        <h2>{{ hotelPromos[promoIndex].title }}</h2>
        <p>{{ hotelPromos[promoIndex].subtitle }}</p>
        <div class="hotel-promo-controls"><div class="promo-dots"><button v-for="(_, index) in hotelPromos" :key="index" :class="{ active: promoIndex === index }" :aria-label="`第 ${index + 1} 张酒店推荐图`" @click="promoIndex = index"></button></div><div><button aria-label="上一张酒店推荐图" @click="movePromo(-1)"><ChevronLeft :size="17" /></button><button aria-label="下一张酒店推荐图" @click="movePromo(1)"><ChevronRight :size="17" /></button></div></div>
      </div>
      <aside v-else-if="isTicket" v-reveal="{ variant: 'right', delay: 80 }" class="ticket-promo">
        <img src="https://ak-d.tripcdn.com/images/1mi6m12000rheqcpy183A.jpg?proc=source%2Ftrip" alt="宋城夜间演出与灯火" />
        <div class="ticket-promo-copy">
          <span>HANGZHOU · EXPERIENCES</span>
          <h2>沿湖慢游，也别错过好戏</h2>
          <p>从湖上风景到夜间演出，挑选一段适合自己的杭州体验。</p>
          <button type="button" @click="emit('navigate', '旅游地图')">查看行程线路 <ArrowRight :size="15" /></button>
        </div>
      </aside>
      <div v-else-if="isFlight" v-reveal="{ variant: 'right', delay: 80 }" class="flight-promise" :style="{ backgroundImage: `linear-gradient(90deg, #064277d9 0%, #075d9d8c 52%, #06427718 100%), url('${flightPromoImage}')` }">
        <span>TRAVEL WITH CONFIDENCE</span><h2>机票服务保障 · 安心出行 · 价格放心</h2><p>比较出发时间与航程 · 规划行程</p>
      </div>
      <div v-else-if="!isTransport" v-reveal="{ variant: 'right', delay: 80 }" class="channel-landscape"><img :src="lakePhoto" alt="杭州西湖与雷峰塔" /><div><small>HANGZHOU · 杭州</small><b>{{ channel === '旅游地图' ? '沿着风景，发现杭州' : '把西湖的风景，写进行程' }}</b></div></div>
    </div>

    <div v-if="!resultView" class="channel-shortcuts">
      <InteractiveHoverButton v-reveal="{ variant: 'left' }" class="channel-shortcut" type="button" aria-label="AI行程助手，跨订单协同，办理前由你确认" @click="emit('open-assistant')">
        <span class="channel-shortcut-copy"><b>AI行程助手</b><small>跨订单协同 · 办理前由你确认</small></span>
        <template #prefix><Sparkles :size="23" /></template>
        <template #reveal><b>进入 AI 行程助手</b></template>
      </InteractiveHoverButton>
      <InteractiveHoverButton v-reveal="{ delay: 80, variant: 'right' }" class="channel-shortcut" type="button" aria-label="行程线路，查看景点与每日路线" @click="emit('navigate', '旅游地图')">
        <span class="channel-shortcut-copy"><b>行程线路</b><small>查看景点与每日路线</small></span>
        <template #prefix><MapPin :size="23" /></template>
        <template #reveal><b>查看行程线路</b></template>
      </InteractiveHoverButton>
    </div>

    <section class="channel-results" aria-live="polite">
      <div v-if="roundtripActive" class="roundtrip-steps">
        <strong :class="{ current: !outboundFlight }">1. 选择去程</strong>
        <ChevronRight :size="16" />
        <strong :class="{ current: outboundFlight }">2. 选择返程</strong>
        <button v-if="outboundFlight" type="button" @click="restartOutbound">重新选择去程</button>
        <span v-if="outboundFlight">已选：{{ outboundFlight.title }} · {{ outboundFlight.travelDate }}</span>
      </div>
      <p v-if="roundtripError" class="checkout-error" role="alert">{{ roundtripError }}</p>
      <div class="results-heading"><div><h2>{{ resultTitle }}</h2><p v-if="searched && submitted">{{ Object.values(submitted).filter(Boolean).join(' · ') }}</p></div><span>{{ resultItems.length }} 项结果</span></div>
      <div class="result-toolbar"><div class="filter-buttons" aria-label="筛选结果"><button v-for="option in filters" :key="option" :class="{ selected: filter === option }" @click="filter = option">{{ option }}</button></div><label v-if="!['攻略·景点', '旅游地图', '旅游'].includes(channel)">排序 <select v-model="sort" aria-label="结果排序"><option>推荐排序</option><option>价格从低到高</option><option>价格从高到低</option></select></label></div>
      <div v-if="catalogLoading" class="channel-empty"><Search :size="36" /><h3>正在加载演示商品</h3><p>请稍候。</p></div>
      <div v-else-if="catalogError" class="channel-empty"><Search :size="36" /><h3>商品数据暂时不可用</h3><p>{{ catalogError }}</p><InteractiveHoverButton class="primary-button" @click="loadDemoCatalog(resultView ? { values: submitted } : null)" variant="solid">重新加载</InteractiveHoverButton></div>
      <div v-else-if="!resultItems.length" class="channel-empty"><Search :size="36" /><h3>没有找到符合条件的产品</h3><p>请调整城市、日期或关键词后重试。</p><InteractiveHoverButton class="primary-button" @click="resultView ? emit('edit-search') : (resetForm(), submitSearch())" variant="solid">修改搜索条件</InteractiveHoverButton></div>
      <template v-else>
        <div v-if="isHotel" class="hotel-recommend-grid">
          <article v-for="(item, index) in resultItems" :key="item.id" v-reveal="{ delay: index * 72 }" class="hotel-result">
            <button class="hotel-result-photo" :style="{ backgroundImage: `url('${item.image}')` }" :aria-label="`查看${item.title}图片与详情`" @click="openDetail(item)"><span>{{ item.destination }} · {{ item.area }}</span><span class="hotel-heart" @click.stop="emit('favorite', item)"><Heart :size="16" :fill="hasFavorite(item) ? 'currentColor' : 'none'" /></span></button>
            <div class="hotel-result-body">
              <div class="hotel-result-title"><div><span class="hotel-stars">{{ '★'.repeat(item.stars) }}</span><small> · {{ item.area }}</small></div><button class="hotel-name" @click="openDetail(item)">{{ item.title }}</button></div>
              <div class="hotel-score"><b>{{ item.score }}</b><strong>{{ item.grade }}</strong><span>{{ item.reviews }}</span></div>
              <p>{{ item.detail }}</p><div class="hotel-tags"><span v-if="/含早餐/.test(item.detail)">含早餐</span><span v-if="/免费取消/.test(item.detail)">免费取消</span></div>
              <div class="hotel-result-price"><div><del>{{ item.oldPrice }}</del><strong>{{ item.price }}<small> /晚</small></strong></div><InteractiveHoverButton class="primary-button" @click="openDetail(item)" variant="solid">查看房型</InteractiveHoverButton></div>
            </div>
          </article>
        </div>
        <div v-else-if="isFlight" class="flight-result-list">
          <article v-for="(item, index) in resultItems" :key="item.id" v-reveal="{ delay: index * 72, variant: 'side' }" class="flight-result" :class="{ 'assistant-candidate': item.id === searchState?.candidateId }">
            <div class="flight-result-brand"><Plane :size="21" /><span>{{ item.code }}</span><small>{{ item.id === searchState?.candidateId ? '助手推荐' : '航班信息' }}</small></div>
            <div class="flight-route"><div><strong>{{ item.departTime }}</strong><span>{{ item.departPort }}</span></div><div class="flight-route-line"><span>{{ item.duration }}</span><i></i><small>{{ item.stop }}</small></div><div><strong>{{ item.arriveTime }}</strong><span>{{ item.arrivePort }}</span></div></div>
            <div class="flight-date">{{ item.dateLabel }}<span>{{ item.discount }}</span></div>
            <div class="flight-result-actions"><strong>{{ item.price }}<small> /人起</small></strong><span>经济舱</span><InteractiveHoverButton v-if="roundtripActive" class="primary-button" @click="selectRoundtripFlight(item)" variant="solid">{{ outboundFlight ? '选择返程' : '选择去程' }}</InteractiveHoverButton><InteractiveHoverButton v-else class="primary-button" @click="openDetail(item)" variant="solid">查看航班</InteractiveHoverButton><button class="favorite-button" :aria-label="(hasFavorite(item) ? '取消收藏' : '收藏') + item.title" :aria-pressed="hasFavorite(item)" @click="emit('favorite', item)"><Heart :size="15" :fill="hasFavorite(item) ? 'currentColor' : 'none'" />{{ hasFavorite(item) ? '已收藏' : '收藏' }}</button></div>
          </article>
        </div>
        <div v-else :class="isEditorial ? 'editorial-grid' : 'product-list'">
          <article v-for="(item, index) in resultItems" :key="item.id" v-reveal="{ delay: index * 72 }" class="product-result" :class="{ 'transport-result': isTransport, 'assistant-candidate': item.id === searchState?.candidateId }">
            <div v-if="!isTransport" class="product-art" :class="'art-' + item.index"><img v-if="isEditorial" :src="isGuideHome ? `https://images.unsplash.com/${guideStories[item.index % guideStories.length].image}?auto=format&fit=crop&w=720&q=80` : isTourHome ? item.photo?.image || lakePhoto : isTicket ? item.image : lakePhoto" :alt="isTourHome ? item.photo?.alt || '杭州西湖风景' : isGuideHome ? `${item.title}风景` : isTicket ? item.imageLabel : '杭州风景'" /><MapPin v-else :size="50" :stroke-width="1" /></div>
            <div v-else class="transport-logo"><component :is="channel === '机票' ? Plane : TrainFront" :size="28" /><small>班次信息</small></div>
            <div class="product-summary"><span class="product-category">{{ displayChannel }} · {{ item.id === searchState?.candidateId ? '助手推荐' : searched ? '查询匹配' : '推荐' }}</span><button class="product-name" @click="openDetail(item)">{{ item.title }}</button><p>{{ item.detail }}</p><small v-if="!isTourHome && item.note">{{ item.note }}</small><div v-if="channel === '酒店'" class="product-tags"><span>{{ item.index === 0 ? '含早餐' : item.index === 1 ? '双床房' : '大床房' }}</span><span>未预订</span></div><small v-if="searched && channel === '机票' && tripType === '往返'" class="segment-note">单段价格，去程与返程需分别选择</small></div>
            <div class="product-purchase">
              <div v-if="isTourHome && item.packagePricing" class="tour-package-card-price">
                <strong>{{ item.price }}<small> /人</small></strong>
                <span><del>原价 ¥{{ item.packagePricing.originalTotal.toLocaleString('zh-CN') }}</del><b>8 折</b></span>
              </div>
              <strong v-else>{{ item.price }}<small v-if="channel === '酒店'"> /晚</small></strong>
              <span>{{ isTourHome ? item.packagePricing ? '单人参考价 · 套餐优惠已计入' : packagePriceState === 'loading' ? '正在读取套餐价格' : '套餐价格暂不可用' : item.price.includes('¥') ? '参考价格' : '参考时长 / 距离' }}</span>
              <InteractiveHoverButton v-if="roundtripActive" class="primary-button" @click="selectRoundtripFlight(item)" variant="solid">{{ outboundFlight ? '选择返程' : '选择去程' }}</InteractiveHoverButton>
              <InteractiveHoverButton v-else class="primary-button" @click="openDetail(item)" variant="solid">{{ channel === '酒店' ? '查看房型' : isTransport ? '选择班次' : '查看详情' }}</InteractiveHoverButton>
              <button v-if="!isTourHome" class="favorite-button" :aria-label="(hasFavorite(item) ? '取消收藏' : '收藏') + item.title" :aria-pressed="hasFavorite(item)" @click="emit('favorite', item)"><Heart :size="15" :fill="hasFavorite(item) ? 'currentColor' : 'none'" />{{ hasFavorite(item) ? '已收藏' : '收藏' }}</button>
            </div>
          </article>
        </div>
      </template>
    </section>
    <footer><button @click="resultView ? emit('edit-search') : emit('view-trip')">{{ resultView ? '修改搜索条件' : '返回行程' }} <ArrowRight :size="14" /></button><details v-if="isTourHome" class="tour-image-credits"><summary>图片授权</summary><ul><li v-for="(photo, city) in tourImages" :key="city">{{ city }}：<a :href="photo.source" target="_blank" rel="noopener noreferrer">{{ photo.author }}</a> · <a :href="photo.licenseUrl" target="_blank" rel="noopener noreferrer">{{ photo.license }}</a></li></ul></details></footer>
  </section>
  <section v-if="productRouteId && !selection" class="product-route-loading" role="status">
    <div v-if="productLoadError" class="product-route-load-error"><p>{{ productLoadError }}</p><button type="button" @click="closeDetail"><ChevronLeft :size="17" />返回商品列表</button></div>
    <div v-else class="product-route-load-state"><span></span><p>正在加载商品信息</p></div>
  </section>
  <Teleport to="body">
    <Transition name="product-modal">
    <div v-if="selection" class="product-overlay" :class="{ 'product-route-overlay': Boolean(productRouteId), 'purchase-route': productRouteMode === 'purchase' }" @click.self="!productRouteId && closeDetail()">
      <section class="product-dialog" :class="{ 'booking-detail-dialog': isHotel || isFlight, 'purchase-route-dialog': productRouteMode === 'purchase' }" role="dialog" aria-modal="true" aria-labelledby="product-detail-title">
        <div class="dialog-top">
          <button ref="closeButton" class="dialog-back" type="button" aria-label="返回上一页" @click="closeDetail"><ArrowLeft :size="17" /><span>返回上一页</span></button>
          <strong>{{ productRouteMode === 'purchase' ? '填写预订信息' : isHotel ? '酒店详情' : isFlight ? '航班详情' : `${displayChannel}详情` }}</strong>
          <button class="dialog-close" type="button" aria-label="返回商品列表" @click="closeDetail"><X :size="21" /></button>
        </div>
        <div class="dialog-body">
          <TourPackageDetail v-if="isTourHome" :key="selection.id" :item="selection" @order-created="emit('order-created', $event)" />
          <template v-else-if="isGuideHome && productRouteId">
            <h2 id="product-detail-title">{{ selection.title }}</h2>
            <p>{{ selection.destination }} · {{ selection.detail }}</p>
            <p>{{ selection.note }} · {{ selection.price }}</p>
            <p>演示景点资料，仅供参考，暂不提供预订。</p>
          </template>
          <template v-else-if="productRouteMode !== 'purchase' && isHotel">
            <div v-reveal="{ variant: 'left' }" class="hotel-detail-heading"><div><span class="detail-eyebrow">HOTEL DETAILS</span><h2 id="product-detail-title">{{ selection.title }}</h2><p>{{ selection.destination }} · {{ selection.area }} · {{ selection.note }}</p></div><button class="detail-save" type="button" :aria-pressed="hasFavorite(selection)" @click="emit('favorite', selection)"><Heart :size="17" :fill="hasFavorite(selection) ? 'currentColor' : 'none'" />{{ hasFavorite(selection) ? '已收藏' : '收藏' }}</button></div>
            <div v-reveal="{ delay: 80, variant: 'right' }" class="hotel-detail-gallery">
              <img class="hotel-detail-cover" :src="detailPhoto || selection.image" :alt="`${selection.title}酒店照片`" />
              <div class="hotel-detail-thumbs"><button v-for="(photo, index) in hotelDetailPhotos" :key="photo" type="button" :class="{ selected: detailPhoto === photo }" :aria-label="`查看酒店照片 ${index + 1}`" @click="detailPhoto = photo"><img :src="photo" alt="" /></button></div>
            </div>
            <div v-reveal="{ delay: 140, variant: 'fade' }" class="hotel-detail-meta"><div class="hotel-detail-score"><strong>{{ selection.score }}</strong><span><b>{{ selection.grade }}</b><small>{{ selection.reviews }} · 住客真实感受</small></span></div><div class="hotel-detail-meta-item"><MapPin :size="17" /><span>{{ selection.area }}<small>周边交通与位置参考</small></span></div><div class="hotel-detail-meta-item"><ShieldCheck :size="17" /><span>安心入住<small>房型政策以所选方案为准</small></span></div></div>
            <div v-reveal="{ delay: 200 }" class="booking-detail-grid">
              <section class="detail-section">
                <div class="detail-section-heading"><div><span class="detail-eyebrow">SELECT A ROOM</span><h3>选择房型</h3></div><span>{{ purchaseCheckIn.slice(5).replace('-', '/') }} 入住 · {{ purchaseCheckOut.slice(5).replace('-', '/') }} 退房</span></div>
                <div class="detail-offer-list">
                  <button v-for="offer in availableOffers" :key="offer.id" type="button" class="detail-offer" :class="{ selected: selectedOfferId === offer.id }" :aria-pressed="selectedOfferId === offer.id" @click="selectedOfferId = offer.id">
                    <span class="offer-radio" aria-hidden="true"></span><span class="offer-main"><strong>{{ offer.name }}</strong><small>{{ offer.detail }}</small></span><span class="offer-policy">{{ offer.policy }}</span><span class="offer-price">¥{{ offerPrice(offer).toLocaleString('zh-CN') }}<small> /晚</small></span>
                  </button>
                </div>
                <div class="hotel-amenity-row"><span>舒适床品</span><span>独立卫浴</span><span>免费 Wi-Fi</span><span>{{ /含早餐/.test(selection.detail) ? '早餐可选' : '早餐按房型' }}</span></div>
              </section>
              <aside class="detail-booking-summary"><span class="detail-eyebrow">YOUR STAY</span><strong>{{ purchaseCheckIn || '选择入住日期' }}<small>入住</small></strong><i></i><strong>{{ purchaseCheckOut || '选择退房日期' }}<small>退房</small></strong><p>{{ selectedOffer?.name || '选择房型' }} · {{ roomCount }} 间 · {{ guestCount }} 位</p><div><span>每晚参考价</span><b>¥{{ (selection.amount + (selectedOffer?.priceDelta || 0)).toLocaleString('zh-CN') }}</b></div><small>房型与服务以当前选择为准</small></aside>
            </div>
          </template>
          <template v-else-if="productRouteMode !== 'purchase' && isFlight">
            <div v-reveal="{ variant: 'left' }" class="flight-detail-heading"><span class="detail-eyebrow">FLIGHT DETAILS</span><h2 id="product-detail-title">{{ selection.origin }} → {{ selection.arrivalCity }}</h2><p>{{ selection.dateLabel }} · {{ selection.title }}</p></div>
            <section v-reveal="{ delay: 80, variant: 'right' }" class="flight-itinerary-card">
              <div class="flight-airline"><span class="flight-airline-mark"><Plane :size="20" /></span><span><strong>{{ selection.note }}</strong><small>{{ selection.code }} · {{ selection.stop }} · 经济舱</small></span><b>{{ purchaseDate || selection.dateLabel }}</b></div>
              <div class="flight-itinerary-line"><div><strong>{{ selection.departTime }}</strong><span>{{ selection.departPort }}</span><small>{{ selection.origin }} 出发</small></div><div class="flight-itinerary-track"><span>{{ selection.duration }}</span><i></i><small>{{ selection.stop }}</small></div><div><strong>{{ selection.arriveTime }}</strong><span>{{ selection.arrivePort }}</span><small>{{ selection.arrivalCity }} 到达</small></div></div>
            </section>
            <section v-reveal="{ delay: 140 }" class="detail-section flight-fares"><div class="detail-section-heading"><div><span class="detail-eyebrow">FARE OPTIONS</span><h3>选择票价方案</h3></div><span>按出行需求选择</span></div>
              <div class="flight-offer-grid"><button v-for="offer in availableOffers" :key="offer.id" type="button" class="flight-offer" :class="{ selected: selectedOfferId === offer.id }" :aria-pressed="selectedOfferId === offer.id" @click="selectedOfferId = offer.id"><span class="flight-offer-top"><strong>{{ offer.name }}</strong><i class="offer-radio" aria-hidden="true"></i></span><small>{{ offer.detail }}</small><span class="flight-offer-bottom"><b>¥{{ offerPrice(offer).toLocaleString('zh-CN') }}</b><em>{{ offer.policy }}</em></span></button></div>
              <p class="flight-demo-note"><ShieldCheck :size="15" />票价与行李、退改权益以当前选择的方案说明为准。</p>
            </section>
          </template>
          <template v-else-if="productRouteMode !== 'purchase' && channel === '火车票'">
            <div v-reveal="{ variant: 'left' }" class="train-detail-heading"><div><span class="detail-eyebrow">TRAIN DETAILS</span><h2 id="product-detail-title">{{ selection.title }}</h2><p>{{ selection.dateLabel || selection.travelDate }} · {{ selection.note }}</p></div><span class="train-detail-badge"><TrainFront :size="16" />铁路出行</span></div>
            <section v-reveal="{ delay: 80, variant: 'right' }" class="train-itinerary-card">
              <div class="train-itinerary-top"><span>出发日期</span><strong>{{ selection.travelDate }}</strong><span class="train-code">{{ selection.title.split('·')[0].trim() }}</span></div>
              <div class="train-itinerary-line"><div><strong>{{ selection.departTime }}</strong><span>{{ selection.origin }}站</span><small>出发</small></div><div class="train-line-track"><span>{{ selection.detail.replace(`${selection.departTime} 出发 · `, '') }}</span><i></i><small>直达</small></div><div><strong>{{ selection.arriveTime }}</strong><span>{{ selection.arrivalCity }}站</span><small>到达</small></div></div>
            </section>
            <div v-reveal="{ delay: 140 }" class="train-detail-facts"><div><span>席别</span><strong>二等座</strong><small>可选座位以订单填写为准</small></div><div><span>参考价格</span><strong class="detail-price">{{ selection.price }} /人</strong><small>按当前班次计算</small></div><div><span>退改规则</span><strong>按铁路规则办理</strong><small>具体条件以订单页面为准</small></div></div>
          </template>
          <template v-else-if="productRouteMode !== 'purchase'">
            <h2 id="product-detail-title">{{ selection.title }}</h2><p>{{ selection.detail }}</p><p>{{ selection.note }}</p>
            <dl><div><dt>参考单价</dt><dd class="detail-price">{{ selection.price }} /人</dd></div><div><dt>出行日期</dt><dd>{{ purchaseDate }}</dd></div><div><dt>席别 / 服务</dt><dd>二等座</dd></div><div><dt>退改规则</dt><dd>具体适用条件与费用以产品说明为准。</dd></div></dl>
          </template>
          <section v-if="productRouteMode === 'purchase'" v-reveal="{ variant: 'left' }" class="purchase-route-content">
            <div class="purchase-route-intro"><span class="detail-eyebrow">BOOKING</span><h2 id="product-detail-title">填写预订信息</h2><p>确认出行日期、人数和关联行程后提交。</p></div>
            <aside class="purchase-product-summary"><div class="purchase-product-icon"><Hotel v-if="isHotel" :size="22" /><Plane v-else-if="isFlight" :size="22" /><TrainFront v-else :size="22" /></div><div><span>{{ channel }}</span><strong>{{ selection.title }}</strong><small>{{ selection.detail || selection.note }}</small><b>{{ isHotel ? `¥${offerPrice(selectedOffer).toLocaleString('zh-CN')} /晚` : `${selection.price} /人` }}</b></div></aside>
          </section>
          <p v-if="feedback && productRouteMode !== 'purchase'" class="plan-added" role="status"><Check :size="17" />{{ feedback }}</p>
          <section v-if="checkoutOpen && !checkoutResult" v-reveal="{ delay: 80, variant: 'right' }" class="checkout-panel" aria-label="确认订单">
            <h3>确认订单信息</h3>
            <p v-if="roundtripReturnFlight" class="checkout-disclaimer">往返票分别提交订单。本次办理{{ isRoundtripOutboundCheckout ? '去程' : '返程' }}，去返程选用同一组出行人。</p>
            <label class="checkout-field"><span>关联行程</span><select v-model="selectedProjectId"><option value="">暂不关联行程</option><option v-for="project in upcomingProjects" :key="project.id" :value="project.id">{{ project.destination }} · {{ project.days }}天</option></select></label>
            <template v-if="isHotel">
              <div class="checkout-fields"><label class="checkout-field"><span>入住日期</span><input v-model="purchaseCheckIn" type="date" :min="selection.checkInStart" :max="selection.checkInEnd" required /></label><label class="checkout-field"><span>退房日期</span><input v-model="purchaseCheckOut" type="date" :min="purchaseCheckIn" :max="selection.checkOutLimit" required /></label></div>
            </template>
            <template v-else>
              <label class="checkout-field"><span>{{ channel === '机票' ? '乘机日期' : '乘车日期' }}</span><input v-model="purchaseDate" type="date" :min="selection.travelDate" :max="selection.travelDate" required /></label>
            </template>
            <div ref="checkoutCountPickerRef" class="checkout-field checkout-count-field">
              <span :id="`checkout-count-label-${channel}`">{{ isHotel ? '房间及住客' : '出行人数' }}</span>
              <button ref="checkoutCountTriggerRef" type="button" class="checkout-count-trigger" :aria-labelledby="`checkout-count-label-${channel} checkout-count-value-${channel}`" :aria-expanded="checkoutCountPickerOpen" aria-controls="checkout-count-popover" @click="toggleCheckoutCountPicker">
                <span :id="`checkout-count-value-${channel}`">{{ isHotel ? `${roomCount} 间 · ${guestCount} 位入住人` : `${passengerCount} 位成人` }}</span>
                <ChevronDown :size="18" :class="{ 'is-open': checkoutCountPickerOpen }" />
              </button>
              <div v-if="checkoutCountPickerOpen" id="checkout-count-popover" ref="checkoutCountPopoverRef" class="checkout-count-popover" role="group" :aria-label="isHotel ? '选择房间及住客' : '选择出行人数'">
                <div v-if="isHotel" class="guest-counter-row">
                  <span class="guest-counter-label">房间</span>
                  <div class="guest-counter-controls"><button type="button" aria-label="减少房间数" :disabled="roomCount <= 1" @click="adjustCheckoutCount('rooms', -1)"><Minus :size="14" /></button><span aria-live="polite">{{ roomCount }}</span><button type="button" aria-label="增加房间数" :disabled="roomCount >= 5" @click="adjustCheckoutCount('rooms', 1)"><Plus :size="14" /></button></div>
                </div>
                <div class="guest-counter-row">
                  <span class="guest-counter-label">{{ isHotel ? '入住人' : '成人' }}</span>
                  <div class="guest-counter-controls"><button type="button" :aria-label="isHotel ? '减少入住人数' : '减少出行人数'" :disabled="(isHotel ? guestCount : passengerCount) <= 1" @click="adjustCheckoutCount(isHotel ? 'guests' : 'passengers', -1)"><Minus :size="14" /></button><span aria-live="polite">{{ isHotel ? guestCount : passengerCount }}</span><button type="button" :aria-label="isHotel ? '增加入住人数' : '增加出行人数'" :disabled="(isHotel ? guestCount : passengerCount) >= 9" @click="adjustCheckoutCount(isHotel ? 'guests' : 'passengers', 1)"><Plus :size="14" /></button></div>
                </div>
                <button type="button" class="guest-picker-done" @click="closeCheckoutCountPicker">确定</button>
              </div>
              <span v-if="isHotel && (roomCount > 5 || guestCount > 9)" class="checkout-count-warning" role="status">单次预订最多 5 间房、9 位入住人，请调整数量。</span>
            </div>
            <section class="checkout-travellers" aria-label="选择出行人">
              <div class="checkout-travellers-heading"><strong>{{ isHotel ? '入住人' : '出行人' }}</strong><span>已选 {{ selectedTravellerIds.length }} / {{ requiredTravellerCount }} 人</span></div>
              <div class="checkout-traveller-list">
                <label v-for="person in savedTravellers" :key="person.id" class="checkout-traveller" :class="{ active: selectedTravellerIds.includes(person.id) }">
                  <input type="checkbox" :checked="selectedTravellerIds.includes(person.id)" :disabled="requiredTravellerCount > 1 && !selectedTravellerIds.includes(person.id) && selectedTravellerIds.length >= requiredTravellerCount" @change="toggleTraveller(person.id)" />
                  <span><strong>{{ person.name }}</strong><small>证件 {{ person.identityNumber.length <= 4 ? '****' : `${'*'.repeat(Math.max(4, person.identityNumber.length - 4))}${person.identityNumber.slice(-4)}` }}</small></span>
                </label>
                <button type="button" class="checkout-add-traveller" @click="addingTraveller = !addingTraveller"><Plus :size="15" />添加同行人</button>
              </div>
              <form v-if="addingTraveller" class="checkout-add-traveller-form" @submit.prevent="addTraveller">
                <label>姓名<input v-model.trim="travellerName" required maxlength="100" autocomplete="name" /></label>
                <label>证件号码<input v-model.trim="travellerIdentityNumber" required maxlength="100" autocomplete="off" /></label>
                <button type="submit" class="checkout-add-traveller-save">保存出行人</button>
              </form>
            </section>
            <div v-if="selectedOffer" class="checkout-selected-offer"><span>{{ isHotel ? '已选房型' : '已选票价' }}</span><strong>{{ selectedOffer.name }} · ¥{{ offerPrice(selectedOffer).toLocaleString('zh-CN') }}{{ isHotel ? ' /晚' : ' /人' }}</strong></div>
            <div class="checkout-total"><span>订单总额</span><strong>¥ {{ purchaseTotal.toLocaleString('zh-CN') }}</strong></div>
            <p class="checkout-disclaimer"><ShieldCheck :size="16" />提交后会生成订单记录，不会真实出票、订房或扣款。</p>
            <p v-if="checkoutError" class="checkout-error" role="alert">{{ checkoutError }}</p>
          </section>
          <section v-else-if="checkoutResult" v-reveal="{ variant: 'fade' }" class="checkout-success" role="status">
            <Check :size="21" /><div><strong>订单提交成功</strong><p>订单号 {{ checkoutResult.order.orderCode }}</p><p v-if="checkoutResult.conflict">订单已保存，但与所关联行程存在冲突；订单不会修改，请在对话中处理行程。</p><p v-else>订单已保存{{ checkoutResult.project ? `，并同步到${checkoutResult.project.destination}行程` : '' }}。</p></div>
          </section>
        </div>
        <div v-if="!isTourHome && !(isGuideHome && productRouteId)" class="dialog-actions">
          <button v-if="!checkoutOpen && !checkoutResult" class="outline-button" @click="emit('favorite', selection)"><Heart :size="16" :fill="hasFavorite(selection) ? 'currentColor' : 'none'" />{{ hasFavorite(selection) ? '取消收藏' : '收藏产品' }}</button>
          <InteractiveHoverButton v-if="!bookable && !checkoutOpen && !checkoutResult && !hasPlan(selection)" class="outline-button" variant="outline" @click="addPlan(selection)">加入行程</InteractiveHoverButton>
          <InteractiveHoverButton v-if="!bookable && !checkoutOpen && !checkoutResult && hasPlan(selection)" class="outline-button" @click="emit('open-assistant')" variant="outline">已加入行程</InteractiveHoverButton>
          <InteractiveHoverButton v-if="bookable && !checkoutOpen && !checkoutResult" class="primary-button" @click="beginCheckout" variant="solid">立即预订</InteractiveHoverButton>
          <button v-if="checkoutOpen && !checkoutResult" class="outline-button" :disabled="checkoutBusy" @click="productRouteId ? emit('purchase-back') : checkoutOpen = false">返回详情</button>
          <InteractiveHoverButton v-if="checkoutOpen && !checkoutResult" class="primary-button" :disabled="checkoutBusy || purchaseTotal <= 0" @click="placeOrder" variant="solid">{{ checkoutBusy ? '正在提交…' : '提交订单' }}</InteractiveHoverButton>
          <InteractiveHoverButton v-if="checkoutResult && isRoundtripOutboundCheckout" class="primary-button" @click="continueRoundtripReturn" variant="solid">继续办理返程</InteractiveHoverButton>
          <InteractiveHoverButton v-else-if="checkoutResult" class="primary-button" @click="emit('navigate', '我的订单')" variant="solid">查看我的订单</InteractiveHoverButton>
        </div>
      </section>
    </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.train-trip-type { display:flex; gap:20px; margin:0 0 12px; font-size:14px; color:#244e6c }
.train-trip-type label { display:flex; align-items:center; gap:6px; min-height:32px; cursor:pointer }
.train-trip-type input { accent-color:#0066cc }
.roundtrip-steps { display:flex; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:18px; padding:14px 16px; background:#fff; border:1px solid #e1eaf2; border-radius:6px; color:#718391; font-size:14px }
.roundtrip-steps .current { color:#0875c9 }
.roundtrip-steps button { border:0; background:transparent; color:#0875c9; cursor:pointer; font:inherit }
.roundtrip-steps span { flex-basis:100%; color:#526b7d; overflow-wrap:anywhere }
.assistant-candidate {
  background: #eff8ff;
  box-shadow: inset 3px 0 #1675bc;
}
.tour-package-card-price{display:grid;justify-items:end;gap:3px}
.tour-package-card-price>strong{color:#f4772f;font-size:21px;line-height:1.2;font-variant-numeric:tabular-nums}
.tour-package-card-price>strong small{color:#7c8990;font-size:10px;font-weight:400}
.tour-package-card-price>span{display:flex;align-items:center;gap:7px;color:#87949b;font-size:10px}
.tour-package-card-price del{font-variant-numeric:tabular-nums}
.tour-package-card-price b{padding:2px 5px;border-radius:3px;background:#fff0e5;color:#d65c14;font-size:10px}
@media(max-width:760px){
  .tour-package-card-price{justify-items:start}
  .tour-package-card-price>strong{font-size:16px}
  .tour-package-card-price>span{font-size:9px}
}
</style>
