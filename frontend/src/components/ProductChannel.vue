<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ArrowLeftRight, ArrowRight, Check, Compass, Heart, Hotel, MapPin, Plane, Search, ShieldCheck, Sparkles, TrainFront, X } from 'lucide-vue-next'

const props = defineProps({
  channel: String, config: Object, favorites: Array, plans: Array, searchSeed: Object,
})
const emit = defineEmits(['add-plan', 'favorite', 'home', 'view-trip'])
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
const selectedMap = ref(0)
const lakePhoto = 'https://ak-d.tripcdn.com/images/1mi6q12000ruisefs81D3.jpg?proc=source%2Ftrip'
const isTransport = computed(() => ['机票', '火车票', '汽车·船票'].includes(props.channel))
const isEditorial = computed(() => ['旅游', '攻略·景点', '门票·活动'].includes(props.channel))
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
  amount: Number(sample[2].replace(/[^\d.]/g, '')) || 0,
  date: submitted.value?.checkin || submitted.value?.depart || submitted.value?.date || submitted.value?.dates || '2027-06-14',
})))
const resultItems = computed(() => {
  let items = products.value
  const values = submitted.value
  if (values) {
    // 本地商品目录只包含杭州案例，不能将同一批结果冒充其他城市。
    if (props.channel === '酒店' && !/杭州/.test(values.destination)) return []
    if (['旅游', '门票·活动', '攻略·景点', '旅游地图'].includes(props.channel) && !/杭州|西湖|灵隐|宋城|河坊/.test(values.destination)) return []
    if (['机票', '火车票'].includes(props.channel)) {
      const outward = /沈阳/.test(values.origin) && /杭州/.test(values.destination)
      const inward = /杭州/.test(values.origin) && /沈阳/.test(values.destination)
      if (!outward && !inward) return []
      items = items.filter(item => inward ? item.index === 2 : item.index !== 2)
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
    items = indexFilters[filter.value] ? items.filter(item => indexFilters[filter.value].includes(item.index)) : items.filter(item => `${item.title}${item.detail}`.includes(filter.value))
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
onMounted(() => { applySeed(props.searchSeed); window.addEventListener('keydown', onModalKey) })
onUnmounted(() => { document.body.style.overflow = ''; window.removeEventListener('keydown', onModalKey) })
</script>

<template>
  <section class="product-channel" :class="{ 'transport-channel': isTransport, 'editorial-channel': isEditorial }">
    <div class="page-breadcrumb"><button @click="emit('home')">首页</button><span> / {{ channel }}</span><span class="catalog-note">杭州案例 · 本地模拟频道</span></div>
    <div class="channel-topline"><strong>{{ channel === '酒店' ? '酒店预订' : channel }}</strong><span>{{ isTransport ? '查询班次 · 比较时间 · 规划出行' : channel === '攻略·景点' ? '目的地指南 · 旅行灵感 · 线路安排' : channel === '旅游' ? '目的地探索 · 当地游 · 自由行' : '杭州之旅，从这里开始' }}</span><button @click="emit('view-trip')">我的杭州行程 <ArrowRight :size="14" /></button></div>
    <div class="channel-hero" :class="{ 'has-landscape': !isTransport }">
      <div class="channel-search-panel">
        <div class="channel-search-heading"><div><h1>{{ config.title }}</h1><p>{{ config.subtitle }}</p></div><component :is="channel === '机票' ? Plane : channel === '火车票' ? TrainFront : channel === '酒店' ? Hotel : Compass" :size="42" :stroke-width="1.3" /></div>
        <form @submit.prevent="submitSearch">
          <div v-if="channel === '机票'" class="trip-type" aria-label="航程类型"><label v-for="type in ['单程', '往返']" :key="type"><input v-model="tripType" type="radio" :value="type" name="trip-type" />{{ type }}</label><small>往返需分别选择去程和返程产品</small></div>
          <div class="channel-fields">
            <label v-for="field in fields" :key="field.key" class="channel-field"><span>{{ field.label }}</span>
              <select v-if="fieldOptions(field)" v-model="form[field.key]" :aria-label="field.label"><option v-for="option in fieldOptions(field)" :key="option">{{ option }}</option></select>
              <input v-else v-model="form[field.key]" :type="field.type" :aria-label="field.label" :placeholder="field.key === 'keyword' ? '位置 / 名称 / 特色' : field.label" :required="field.key !== 'keyword'" />
            </label>
            <button v-if="isTransport" type="button" class="swap-cities" aria-label="交换出发地和目的地" @click="swapCities"><ArrowLeftRight :size="17" /></button>
            <button type="submit" class="primary-button channel-submit"><Search :size="21" />搜索</button>
          </div>
          <p v-if="formError" class="channel-form-error" role="alert">{{ formError }}</p>
        </form>
        <div class="search-assurance"><ShieldCheck :size="15" /><span>价格、库存与产品规则为模拟 · 选择产品后先加入未预订计划</span></div>
      </div>
      <div v-if="!isTransport" class="channel-landscape"><img :src="lakePhoto" alt="杭州西湖景色示意" /><div><small>HANGZHOU · 杭州</small><b>{{ channel === '酒店' ? '湖畔好时光，安心住杭州' : channel === '旅游地图' ? '沿着风景，发现杭州' : '把西湖的风景，写进行程' }}</b><span>杭州风景示意图</span></div></div>
      <div v-else class="transport-promise"><component :is="channel === '机票' ? Plane : TrainFront" :size="70" :stroke-width="1" /><h2>{{ channel === '机票' ? '自在出发，轻松规划' : '下一站，杭州' }}</h2><p>出行班次清晰比较<br />行程安排统一管理</p><span>课程模拟 · 无真实出票</span></div>
    </div>

    <div class="channel-shortcuts"><button @click="emit('view-trip')"><MapPin :size="23" /><span><b>我的杭州行程</b><small>{{ plans.length }} 项新增未预订计划</small></span><ArrowRight :size="17" /></button><div><Sparkles :size="23" /><span><b>先规划，再预订</b><small>加入计划不会创建订单或扣款</small></span></div></div>

    <section class="channel-results" aria-live="polite">
      <div class="results-heading"><div><h2>{{ resultTitle }}</h2><p v-if="searched">{{ Object.values(submitted).filter(Boolean).join(' · ') }}</p><p v-else>按当前杭州案例推荐，输入条件可查询本地商品目录</p></div><span>{{ resultItems.length }} 项模拟结果</span></div>
      <div class="result-toolbar"><div class="filter-buttons" aria-label="筛选结果"><button v-for="option in filters" :key="option" :class="{ selected: filter === option }" @click="filter = option">{{ option }}</button></div><label v-if="!['攻略·景点', '旅游地图', '旅游'].includes(channel)">排序 <select v-model="sort" aria-label="结果排序"><option>推荐排序</option><option>价格从低到高</option><option>价格从高到低</option></select></label></div>
      <div v-if="!resultItems.length" class="channel-empty"><Search :size="36" /><h3>没有符合条件的模拟产品</h3><p>此原型仅提供杭州住宿、沈阳往返杭州交通及部分杭州周边产品。请修改城市、关键词或筛选条件。</p><button class="primary-button" @click="resetForm(); submitSearch()">恢复杭州示例条件</button></div>
      <template v-else>
        <div v-if="channel === '旅游地图'" class="travel-map">
          <div class="map-canvas"><span class="map-label">杭州路线示意 · 非地理比例 / 非实时导航</span>
            <svg viewBox="0 0 700 380" role="img" aria-label="杭州景点与车站路线示意图"><rect width="700" height="380" fill="#f1f5ed" /><path d="M0 90 Q140 30 290 130T700 100M0 280Q250 340 700 220M130 0L170 380M490 0L540 380" fill="none" stroke="#fff" stroke-width="18" /><ellipse cx="300" cy="225" rx="100" ry="95" fill="#cae8ee" /><text x="280" y="230" fill="#6395a3" font-size="21">西湖</text><path :d="['M110 100Q200 100 300 170', 'M330 300L490 275', 'M580 80L420 160'][selectedMap]" fill="none" stroke="#0089f7" stroke-width="5" stroke-dasharray="10 6" /><g fill="#64776d" font-size="16"><text x="70" y="76">灵隐寺</text><text x="310" y="336">雷峰塔</text><text x="470" y="310">河坊街</text><text x="540" y="60">杭州东站</text><text x="408" y="140">湖滨商圈</text></g></svg>
            <button v-for="(point, i) in [{ x: 16, y: 26, label: '灵隐寺' }, { x: 47, y: 79, label: '雷峰塔' }, { x: 83, y: 21, label: '杭州东站' }]" :key="point.label" :style="{ left: point.x + '%', top: point.y + '%' }" class="map-pin" :class="{ chosen: selectedMap === i }" :aria-label="'查看' + point.label + '路线'" @click="selectedMap = i"><MapPin :size="23" /></button>
          </div><div class="map-route-list"><button v-for="item in resultItems" :key="item.id" :class="{ chosen: selectedMap === item.index }" @click="selectedMap = item.index"><b>{{ item.title }}</b><span>{{ item.detail }}</span><small>{{ item.price }} · 路线估算</small></button><button class="primary-button" @click="openDetail(products[selectedMap])">查看路线与计划 <ArrowRight :size="14" /></button></div>
        </div>
        <div v-else :class="isEditorial ? 'editorial-grid' : 'product-list'">
          <article v-for="item in resultItems" :key="item.id" class="product-result" :class="{ 'transport-result': isTransport }">
            <div v-if="!isTransport" class="product-art" :class="'art-' + item.index"><img v-if="isEditorial" :src="lakePhoto" alt="杭州风景示意图" /><Hotel v-else-if="channel === '酒店'" :size="54" :stroke-width="1" /><MapPin v-else :size="50" :stroke-width="1" /><span>{{ channel === '酒店' ? '住宿示意 · 非实拍' : '杭州示意' }}</span></div>
            <div v-else class="transport-logo"><component :is="channel === '机票' ? Plane : TrainFront" :size="28" /><small>模拟班次</small></div>
            <div class="product-summary"><span class="product-category">{{ channel }} · {{ searched ? '查询匹配' : '杭州案例' }}</span><button class="product-name" @click="openDetail(item)">{{ item.title }}</button><p>{{ item.detail }}</p><small>{{ item.note }}</small><div v-if="channel === '酒店'" class="product-tags"><span>{{ item.index === 0 ? '含早餐' : item.index === 1 ? '双床房' : '大床房' }}</span><span>模拟房型</span><span>未预订</span></div><small v-if="searched && channel === '机票' && tripType === '往返'" class="segment-note">单段价格，去程与返程需分别选择</small></div>
            <div class="product-purchase"><strong>{{ item.price }}<small v-if="channel === '酒店'"> /晚</small></strong><span>{{ item.price.includes('¥') ? '模拟参考价' : '参考时长 / 距离' }}</span><button class="primary-button" @click="openDetail(item)">{{ channel === '酒店' ? '查看房型' : isTransport ? '选择班次' : '查看详情' }} <ArrowRight :size="14" /></button><button class="favorite-button" :aria-label="(hasFavorite(item) ? '取消收藏' : '收藏') + item.title" :aria-pressed="hasFavorite(item)" @click="emit('favorite', item)"><Heart :size="15" :fill="hasFavorite(item) ? 'currentColor' : 'none'" />{{ hasFavorite(item) ? '已收藏' : '收藏' }}</button></div>
          </article>
        </div>
      </template>
    </section>
    <footer><span>仅供课程演示 · 不连接携程商品、库存或订单系统</span><button @click="emit('view-trip')">返回杭州行程 <ArrowRight :size="14" /></button></footer>
  </section>
  <Teleport to="body">
    <div v-if="selection" class="product-overlay" @click.self="closeDetail">
      <section class="product-dialog" role="dialog" aria-modal="true" aria-labelledby="product-detail-title">
        <div class="dialog-top"><span>{{ channel }}详情 · 模拟产品</span><button ref="closeButton" aria-label="关闭产品详情" @click="closeDetail"><X :size="21" /></button></div>
        <div class="dialog-body"><span class="sim-pill">本地商品目录</span><h2 id="product-detail-title">{{ selection.title }}</h2><p>{{ selection.detail }}</p><p>{{ selection.note }}</p><dl><div><dt>计划日期</dt><dd>{{ selection.date }}</dd></div><div><dt>{{ channel === '酒店' ? '房型' : isTransport ? '席别 / 服务' : '安排' }}</dt><dd>{{ channel === '酒店' ? (selection.index === 1 ? '标准双床房 · 模拟房型' : '标准大床房 · 模拟房型') : isTransport ? (channel === '机票' ? '经济舱 · 单段' : '二等座 / 普通座 · 单段') : '按所选产品安排' }}</dd></div><div><dt>价格 / 用时</dt><dd class="detail-price">{{ selection.price }}{{ channel === '酒店' ? ' /晚，模拟参考价' : '（模拟）' }}</dd></div><div v-if="channel === '酒店'"><dt>入住与退房</dt><dd>{{ submitted?.checkin || form.checkin }} — {{ submitted?.checkout || form.checkout }}</dd></div><div><dt>退改规则</dt><dd>仅为演示信息，具体适用条件与费用需供应方确认。</dd></div></dl><div class="plan-disclaimer"><ShieldCheck :size="20" /><p>添加后将显示在「杭州行程」中，状态为未预订计划。此操作不会出票、订房或付款。</p></div><p v-if="feedback" class="plan-added" role="status"><Check :size="17" />{{ feedback }}</p></div>
        <div class="dialog-actions"><button class="outline-button" @click="emit('favorite', selection)"><Heart :size="16" :fill="hasFavorite(selection) ? 'currentColor' : 'none'" />{{ hasFavorite(selection) ? '取消收藏' : '收藏产品' }}</button><button v-if="hasPlan(selection)" class="primary-button" @click="closeDetail(); emit('view-trip')">查看杭州行程 <ArrowRight :size="15" /></button><button v-else class="primary-button" @click="addPlan(selection)">加入未预订计划 <ArrowRight :size="15" /></button></div>
      </section>
    </div>
  </Teleport>
</template>
