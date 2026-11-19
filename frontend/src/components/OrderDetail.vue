<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Hotel, MapPin, Plane, TrainFront } from 'lucide-vue-next'
import hotelImage from '../assets/hotel-city.webp'
import { orderStatus } from '../order-status.js'

const props = defineProps({ order: Object })
const emit = defineEmits(['back', 'updated', 'book-again'])
const projects = ref([])
const projectId = ref('')
const projectEditor = ref(false)
const action = ref('')
const busy = ref(false)
const error = ref('')
const message = ref('')
const travelDate = ref('')
const checkIn = ref('')
const checkOut = ref('')
const isHotel = computed(() => props.order?.type === 'hotel')
const status = computed(() => orderStatus(props.order))
const editable = computed(() => status.value === '待出行')
const changeable = computed(() => editable.value && (!isHotel.value || props.order?.offerPolicy === '限时免费取消'))
const category = computed(() => ({ hotel: '酒店', flight: '机票', train: '火车票' })[props.order?.type] || '订单')
const money = amount => Number(amount || 0).toLocaleString('zh-CN')
const maskIdentity = value => value ? `${'*'.repeat(Math.max(4, value.length - 4))}${value.slice(-4)}` : '—'
function syncFields() {
  projectId.value = props.order?.projectId || ''
  travelDate.value = props.order?.travelDate || ''
  checkIn.value = props.order?.checkIn || ''
  checkOut.value = props.order?.checkOut || ''
}
watch(() => props.order, syncFields, { immediate: true })
onMounted(async () => {
  try {
    const response = await fetch('/api/projects')
    if (response.ok) projects.value = (await response.json()).projects || []
  } catch { /* The order remains readable if projects are unavailable. */ }
})
async function request(path, method, body) {
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const response = await fetch(`/api/orders/${encodeURIComponent(props.order.id)}/${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || '操作未完成，请重试')
    emit('updated', data.order)
    return true
  } catch (failure) {
    error.value = failure.message || '操作未完成，请重试'
    return false
  } finally { busy.value = false }
}
async function saveProject() {
  if (await request('project', 'PATCH', { projectId: projectId.value || null })) {
    projectEditor.value = false
    message.value = '关联行程已更新。'
  }
}
async function submitChange() {
  const payload = isHotel.value ? { checkIn: checkIn.value, checkOut: checkOut.value } : { travelDate: travelDate.value }
  if (await request('change', 'POST', payload)) {
    action.value = ''
    message.value = '订单日期已更新。'
  }
}
async function submitCancel() {
  if (await request('cancel', 'POST', {})) {
    action.value = ''
    message.value = '订单已取消。'
  }
}
</script>

<template>
  <section class="order-detail-page">
    <button class="order-back" type="button" @click="emit('back')"><ArrowLeft :size="17" /> 返回我的订单</button>
    <div v-if="!order" class="order-card order-not-found"><h1>未找到订单</h1><p>订单不存在或暂时无法读取。</p><button class="order-link-button" @click="emit('back')">返回我的订单</button></div>
    <template v-else>
      <div class="order-detail-grid">
        <div class="order-detail-main">
          <section v-reveal="{ variant: 'left' }" class="order-card order-status-card">
            <div class="order-status-heading"><div><span class="order-overline">{{ category }}订单</span><h1>{{ status }}</h1><p>订单号 {{ order.orderCode }}</p></div><CheckCircle2 :size="30" aria-hidden="true" /></div>
            <p class="order-policy">{{ order.offerPolicy || '退改规则以订单商品说明为准' }}</p>
            <div class="order-actions">
              <button v-if="changeable" class="order-outline" @click="action = 'change'; error = ''">{{ isHotel ? '修改入住日期' : '改签日期' }}</button>
              <button v-if="changeable" class="order-outline order-danger" @click="action = 'cancel'; error = ''">{{ isHotel ? '取消订单' : '申请退票' }}</button>
              <button v-if="status === '已完成'" class="order-primary" @click="emit('book-again', order)">再次预订</button>
            </div>
          </section>
          <p v-if="message" class="order-feedback" role="status">{{ message }}</p>
          <p v-if="error" class="order-error" role="alert">{{ error }}</p>
          <section v-if="action === 'change' && editable" class="order-card order-edit">
            <div><h2>{{ isHotel ? '修改入住日期' : '改签日期' }}</h2><p>请确认新的日期，具体可选范围以当前商品为准。{{ isHotel ? '订单总额会按入住晚数重新计算。' : '' }}</p></div>
            <div class="order-edit-fields" v-if="isHotel"><label>入住日期<input v-model="checkIn" type="date" /></label><label>退房日期<input v-model="checkOut" type="date" /></label></div>
            <div class="order-edit-fields" v-else><label>出行日期<input v-model="travelDate" type="date" /></label></div>
            <div class="order-actions"><button class="order-outline" @click="action = ''; error = ''">返回</button><button class="order-primary" :disabled="busy" @click="submitChange">{{ busy ? '正在保存…' : '确认修改' }}</button></div>
          </section>
          <section v-if="action === 'cancel' && editable" class="order-card order-edit"><h2>确认{{ isHotel ? '取消订单' : '退票' }}？</h2><p>{{ order.offerPolicy || '请先确认订单适用的退改规则。' }} 此操作仅修改演示订单，不会产生真实退款。</p><div class="order-actions"><button class="order-outline" @click="action = ''; error = ''">暂不办理</button><button class="order-primary" :disabled="busy" @click="submitCancel">{{ busy ? '正在办理…' : '确认办理' }}</button></div></section>
          <section v-reveal="{ delay: 80, variant: 'left' }" class="order-card order-product-card"><img v-if="isHotel" :src="hotelImage" alt="" /><span v-else class="order-product-icon"><Plane v-if="order.type === 'flight'" :size="28" /><TrainFront v-else :size="28" /></span><div><span class="order-overline">{{ category }}信息</span><h2>{{ order.title }}</h2><p><MapPin :size="15" />{{ isHotel ? (order.destination || '目的地待确认') : `${order.origin} → ${order.arrivalCity}` }}</p><p v-if="order.provider">{{ order.provider }} <span v-if="order.code">· {{ order.code }}</span></p></div></section>
          <section v-reveal="{ delay: 140, variant: 'left' }" class="order-card order-date-card"><template v-if="isHotel"><div><span>入住</span><strong>{{ order.checkIn }}</strong></div><div class="order-date-middle">{{ order.nights }} 晚 <ArrowRight :size="17" /></div><div><span>离店</span><strong>{{ order.checkOut }}</strong></div></template><template v-else><div><span>出发 · {{ order.travelDate }}</span><strong>{{ order.departTime }}</strong><small>{{ order.origin }}</small></div><div class="order-date-middle"><ArrowRight :size="20" /></div><div><span>到达</span><strong>{{ order.arriveTime }}</strong><small>{{ order.arrivalCity }}</small></div></template></section>
          <section v-reveal="{ delay: 200, variant: 'left' }" class="order-card order-info-card"><h2>{{ isHotel ? '房型信息' : '出行信息' }}</h2><dl><div v-if="order.offerName"><dt>{{ isHotel ? '房型' : '票价方案' }}</dt><dd>{{ order.offerName }}</dd></div><div v-if="order.offerDetail"><dt>方案详情</dt><dd>{{ order.offerDetail }}</dd></div><div><dt>{{ isHotel ? '房间与住客' : '出行人数' }}</dt><dd>{{ isHotel ? `${order.rooms} 间 · ${order.guests} 人` : `${order.passengers} 人` }}</dd></div><div><dt>退改规则</dt><dd>{{ order.offerPolicy || '以产品规则为准' }}</dd></div></dl></section>
          <section v-if="order.travellers?.length" v-reveal="{ delay: 220, variant: 'left' }" class="order-card order-info-card"><h2>{{ isHotel ? '入住人' : '出行人' }}</h2><dl><div v-for="person in order.travellers" :key="person.id"><dt>{{ person.name }}</dt><dd>证件 {{ maskIdentity(person.identityNumber) }}</dd></div></dl></section>
        </div>
        <aside class="order-detail-side">
          <section v-reveal="{ delay: 80, variant: 'right' }" class="order-card order-price-card"><h2>费用明细</h2><div><span>{{ isHotel ? `${order.nights} 晚 · ${order.rooms} 间` : `${order.passengers} 位出行人` }}</span><span>¥{{ money(order.packageOriginalTotal || order.totalPrice) }}</span></div><div v-if="order.packageDiscountAmount" class="order-package-discount"><span>套餐优惠 · 8 折</span><span>-¥{{ money(order.packageDiscountAmount) }}</span></div><div class="order-total"><strong>订单总额</strong><b>¥{{ money(order.totalPrice) }}</b></div><p v-if="order.packageTitle">来自套餐：{{ order.packageTitle }}</p><p v-else>课程演示订单，不涉及真实支付或退款。</p></section>
          <section v-reveal="{ delay: 140, variant: 'right' }" class="order-card order-trip-card"><div class="order-card-title"><h2>关联行程</h2><CalendarDays :size="20" /></div><p>{{ order.projectDestination ? `${order.projectDestination}行程` : '暂未关联行程' }}</p><button v-if="editable && !projectEditor" class="order-link-button" @click="projectEditor = true; error = ''">{{ order.projectId ? '修改关联行程' : '关联行程' }}</button><div v-else-if="projectEditor && editable" class="order-project-editor"><label for="order-project">选择行程</label><select id="order-project" v-model="projectId"><option value="">暂不关联行程</option><option v-for="project in projects" :key="project.id" :value="project.id">{{ project.destination }} · {{ project.days }}天</option></select><p v-if="error" class="order-error" role="alert">{{ error }}</p><div class="order-actions"><button class="order-outline" @click="projectEditor = false; syncFields()">取消</button><button class="order-primary" :disabled="busy" @click="saveProject">保存</button></div></div></section>
          <section v-reveal="{ delay: 200, variant: 'right' }" class="order-card order-help-card"><h2>订单信息</h2><p>下单时间：{{ order.createdAt || '—' }}</p><p>订单状态：{{ status }}</p></section>
        </aside>
      </div>
    </template>
  </section>
</template>

<style scoped>
.order-detail-page{max-width:1380px;margin:0 auto;padding:4px 0 40px;color:#1f2d3d;font-size:15px}.order-back,.order-link-button{display:inline-flex;align-items:center;gap:7px;color:#0674d9;font-size:14px;font-weight:600}.order-back{min-height:42px;margin:0 0 12px}.order-detail-grid{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(270px,.85fr);gap:16px;align-items:start}.order-detail-main,.order-detail-side{display:grid;gap:14px;min-width:0}.order-card{min-width:0;padding:24px;border:1px solid #e6edf2;border-radius:8px;background:#fff}.order-card h1,.order-card h2,.order-card p{margin:0}.order-card h1{font-size:30px;line-height:1.3;color:#172838}.order-card h2{font-size:19px;line-height:1.4}.order-card p{color:#6c7e89;line-height:1.7}.order-overline{display:block;margin-bottom:5px;color:#718997;font-size:13px}.order-status-heading{display:flex;justify-content:space-between;align-items:start;gap:12px}.order-status-heading>svg{color:#19a76d}.order-status-heading p{margin-top:8px;font-variant-numeric:tabular-nums}.order-policy{margin-top:16px!important;font-size:14px}.order-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:10px;margin-top:20px}.order-outline,.order-primary{min-height:40px;padding:8px 16px;border-radius:5px;font-size:14px;font-weight:600}.order-outline{border:1px solid #9bcdf2;background:#fff;color:#0874d1}.order-primary{border:1px solid #0676d7;background:#0676d7;color:white}.order-danger{color:#c34b3b;border-color:#e9c5bf}.order-outline:hover,.order-link-button:hover{background:#eff8ff}.order-primary:hover{background:#005eae}.order-primary:disabled{opacity:.6;cursor:wait}.order-product-card{display:flex;align-items:center;gap:20px}.order-product-card img,.order-product-icon{width:112px;height:100px;flex:none;object-fit:cover;border-radius:6px}.order-product-icon{display:grid;place-items:center;background:#eaf5ff;color:#0676d7}.order-product-card h2{margin-bottom:9px}.order-product-card p{display:flex;align-items:center;gap:5px;font-size:14px}.order-date-card{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:14px}.order-date-card>div:not(.order-date-middle){display:grid;gap:6px}.order-date-card span,.order-date-card small{color:#788a95;font-size:14px}.order-date-card strong{font-size:23px;font-variant-numeric:tabular-nums}.order-date-middle{display:flex;align-items:center;gap:8px;color:#8c9da6}.order-info-card dl{margin:14px 0 0}.order-info-card dl>div{display:grid;grid-template-columns:130px 1fr;gap:12px;padding:13px 0;border-top:1px solid #eef1f3}.order-info-card dt{color:#84939b}.order-info-card dd{margin:0}.order-price-card>div{display:flex;justify-content:space-between;gap:12px;margin-top:22px}.order-price-card .order-total{padding-top:20px;border-top:1px solid #e8edf1}.order-total b{font-size:26px;color:#ff7c1b;font-variant-numeric:tabular-nums}.order-price-card p{margin-top:14px;font-size:12px}.order-card-title{display:flex;justify-content:space-between;align-items:center;color:#0874d1}.order-trip-card p{margin:14px 0}.order-project-editor{display:grid;gap:8px}.order-project-editor label{font-size:13px;color:#71828d}.order-project-editor select,.order-edit input{width:100%;min-height:42px;padding:8px;border:1px solid #d5e1e9;border-radius:5px;background:white;color:#243848;font:inherit}.order-edit h2{margin-bottom:8px}.order-edit p{font-size:14px}.order-edit-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:15px}.order-edit-fields label{display:grid;gap:7px;font-size:14px;color:#657a88}.order-feedback,.order-error{padding:12px 16px;border-radius:6px;background:#edf9f3;color:#258354}.order-error{background:#fff4f1;color:#ad4034}.order-help-card p{margin-top:12px;font-size:14px}.order-not-found{min-height:200px}.order-not-found p{margin:12px 0}.order-card button:focus-visible,.order-back:focus-visible{outline:3px solid #85bfff;outline-offset:3px}@media(max-width:760px){.order-detail-page{font-size:14px}.order-detail-grid{grid-template-columns:1fr}.order-card{padding:18px}.order-card h1{font-size:26px}.order-card h2{font-size:17px}.order-product-card{gap:12px}.order-product-card img,.order-product-icon{width:80px;height:80px}.order-date-card{gap:7px}.order-date-card strong{font-size:18px}.order-info-card dl>div{grid-template-columns:100px 1fr}.order-edit-fields{grid-template-columns:1fr}.order-actions{justify-content:flex-start}}
</style>
