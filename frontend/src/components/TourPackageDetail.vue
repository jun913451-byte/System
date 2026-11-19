<script setup>
import { computed, onMounted, ref } from 'vue'
import { componentDateLabel, productLink } from '../tourism-packages.js'

const props = defineProps({ item: { type: Object, required: true } })
const emit = defineEmits(['order-created'])
const products = ref([])
const travellers = ref([])
const projects = ref([])
const travellerIds = ref([])
const projectId = ref('')
const loading = ref(true)
const busy = ref(false)
const error = ref('')
const completed = ref(null)
const routeHash = window.location.hash
const purchasableProducts = computed(() => products.value.filter(item => ['机票', '火车票', '酒店'].includes(item.channel) && item.product))
const rooms = computed(() => Math.ceil(travellerIds.value.length / 2))
function componentOriginalPrice(component) {
  if (!component.product) return 0
  if (component.product.type === 'hotel') {
    const nights = Math.round((Date.parse(`${component.checkOut}T00:00:00Z`) - Date.parse(`${component.checkIn}T00:00:00Z`)) / 86400000)
    return component.product.price * nights * rooms.value
  }
  return component.product.price * travellerIds.value.length
}
const originalTotal = computed(() => purchasableProducts.value.reduce((sum, component) => sum + componentOriginalPrice(component), 0))
const packageTotal = computed(() => Math.round(originalTotal.value * 0.8))
const packageDiscount = computed(() => originalTotal.value - packageTotal.value)

function openProduct(event, component) {
  event.preventDefault()
  const href = productLink(component, routeHash)
  history.pushState({ productRoute: true, returnHash: routeHash }, '', href)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

onMounted(async () => {
  const [components, people, trips] = await Promise.all([
    Promise.all(props.item.components.map(async component => {
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(component.id)}`)
      if (!response.ok) throw new Error('unavailable')
      const { product } = await response.json()
      return { ...component, product }
    } catch {
      return { ...component, product: null }
    }
    })),
    fetch('/api/travellers').then(response => response.ok ? response.json() : { travellers: [] }).catch(() => ({ travellers: [] })),
    fetch('/api/projects').then(response => response.ok ? response.json() : { projects: [] }).catch(() => ({ projects: [] })),
  ])
  products.value = components
  travellers.value = people.travellers || []
  projects.value = (trips.projects || []).filter(project => ['planning', 'active'].includes(project.status))
  loading.value = false
})

async function checkoutPackage() {
  error.value = ''
  if (!travellerIds.value.length) {
    error.value = '请选择至少一位出行人。'
    return
  }
  if (!purchasableProducts.value.length || purchasableProducts.value.length !== props.item.components.filter(item => ['机票', '火车票', '酒店'].includes(item.channel)).length) {
    error.value = '套餐中的交通或住宿商品暂不可用。'
    return
  }
  busy.value = true
  try {
    const response = await fetch(`/api/packages/${encodeURIComponent(props.item.id)}/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ travellerIds: travellerIds.value, projectId: projectId.value || null }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || '套餐提交失败，请重试')
    completed.value = data
    emit('order-created', data)
  } catch (failure) {
    error.value = failure.message || '套餐提交失败，请重试'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="tour-package-detail">
    <span class="detail-eyebrow">演示套餐 · {{ item.days }} 天</span>
    <h2 id="product-detail-title">{{ item.title }}</h2>
    <p>{{ item.detail }}</p>
    <p class="tour-package-notice">一次提交套餐内交通与住宿订单，享套餐总价 8 折。景点作为游览安排，不含门票预订。</p>
    <h3>套餐包含</h3>
    <p v-if="loading" role="status">正在加载商品信息</p>
    <ul v-else class="tour-package-items">
      <li v-for="component in products" :key="component.id">
        <div><small>{{ component.label }}</small><strong>{{ component.product?.title || '商品暂不可用' }}</strong><span v-if="component.product">{{ component.product.detail }}</span><span v-if="componentDateLabel(component)" class="tour-package-date">{{ componentDateLabel(component) }}</span></div>
        <a v-if="component.product" :href="productLink(component, routeHash)" @click="openProduct($event, component)">查看详情</a>
      </li>
    </ul>
    <section v-if="!loading && !completed" class="package-checkout">
      <h3>出行人和订单</h3>
      <label class="package-project"><span>关联行程</span><select v-model="projectId"><option value="">暂不关联行程</option><option v-for="project in projects" :key="project.id" :value="project.id">{{ project.destination }} · {{ project.days }} 天</option></select></label>
      <div class="package-travellers"><label v-for="person in travellers" :key="person.id"><input v-model="travellerIds" type="checkbox" :value="person.id" :disabled="!travellerIds.includes(person.id) && travellerIds.length >= 9" /><span>{{ person.name }} <small>证件尾号 {{ person.identityNumber.slice(-4) }}</small></span></label></div>
      <div class="package-price"><span class="package-original-price">套餐原价 <del>¥{{ originalTotal.toLocaleString('zh-CN') }}</del></span><strong class="package-current-price"><small>¥</small>{{ packageTotal.toLocaleString('zh-CN') }}</strong><b>8 折 · 立减 ¥{{ packageDiscount.toLocaleString('zh-CN') }}</b></div>
      <p v-if="error" class="package-error" role="alert">{{ error }}</p>
      <button class="package-buy" :disabled="busy || loading || !travellerIds.length || !purchasableProducts.length" @click="checkoutPackage">{{ busy ? '正在提交…' : '确认购买套餐' }}</button>
    </section>
    <section v-else-if="completed" class="package-success" role="status">
      <strong>套餐已提交</strong>
      <p>共生成 {{ completed.orders.length }} 笔订单，已优惠 ¥{{ completed.discountAmount.toLocaleString('zh-CN') }}。</p>
      <p v-if="completed.conflict">订单已保存，部分订单与行程存在冲突，请在对话中查看提醒。</p>
      <a :href="routeHash" @click="event => { event.preventDefault(); history.pushState(null, '', '#我的订单'); window.dispatchEvent(new PopStateEvent('popstate')) }">查看我的订单</a>
    </section>
  </div>
</template>

<style scoped>
.tour-package-detail h2{margin:8px 0;font-size:24px;color:#173d60}
.tour-package-detail h3{margin:24px 0 10px;font-size:16px}
.tour-package-detail p{color:#60788b;line-height:1.6}
.tour-package-notice{padding:10px 12px;background:#f1f8fc;border-left:3px solid #68a5c8;font-size:13px}
.tour-package-items{list-style:none;margin:0;padding:0;border-top:1px solid #e2ebf1}
.tour-package-items li{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 0;border-bottom:1px solid #e2ebf1}
.tour-package-items li div{display:grid;gap:5px;min-width:0}
.tour-package-items small,.tour-package-items span{color:#657d8f;font-size:12px}
.tour-package-items .tour-package-date{color:#315f7e}
.tour-package-items strong{font-size:14px;overflow-wrap:anywhere}
.tour-package-items a{flex:none;color:#0872bd;font-size:13px}
.package-checkout{margin-top:24px;padding-top:18px;border-top:1px solid #e2ebf1}
.package-checkout h3{margin:0 0 14px}
.package-project{display:grid;gap:6px;color:#587184;font-size:13px}
.package-project select{height:40px;padding:0 10px;border:1px solid #d6e2eb;border-radius:4px;background:#fff;color:#29495f}
.package-travellers{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.package-travellers label{display:flex;align-items:center;gap:7px;min-height:42px;padding:7px 10px;border:1px solid #dce6ed;border-radius:4px;color:#36566c;font-size:13px}
.package-travellers input{accent-color:#0872bd}
.package-travellers small{display:block;color:#7890a0;font-size:10px}
.package-price{display:grid;justify-items:start;gap:2px;margin-top:16px}
.package-original-price{display:flex;align-items:center;gap:8px;color:#728391;font-size:12px}
.package-price del{color:#8a9aa5;font-size:13px;font-variant-numeric:tabular-nums}
.package-price .package-current-price{display:flex;align-items:baseline;gap:2px;color:#e66c21;font-size:42px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}
.package-current-price small{font-size:22px}
.package-price b{margin-top:5px;padding:3px 7px;border-radius:3px;background:#fff0e5;color:#d65c14;font-size:12px}
.package-buy{width:100%;min-height:44px;margin-top:14px;border-radius:4px;background:#0872c5;color:white;font-size:15px;font-weight:600}
.package-buy:hover{background:#005ba8}
.package-buy:disabled{opacity:.55;cursor:not-allowed}
.package-error{color:#b64234;font-size:13px}
.package-success{margin-top:22px;padding:15px;background:#eff9f3;border-left:3px solid #38a66c;color:#315a43}
.package-success p{margin:6px 0}
.package-success a{color:#0872bd}
@media(max-width:480px){.tour-package-items li{align-items:flex-start}.tour-package-detail h2{font-size:20px}}
</style>
