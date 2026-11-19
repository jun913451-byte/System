<script setup>
import InteractiveHoverButton from './ui/InteractiveHoverButton.vue'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ArrowLeftRight, ArrowRight, CalendarDays, Check, ChevronDown,
  CircleAlert, LoaderCircle, MapPin, Maximize2, Minimize2, Minus, PanelLeftClose, PanelLeftOpen, Plus, Send, Sparkles, Trash2, X,
} from 'lucide-vue-next'
import MessageLoading from './ui/MessageLoading.vue'
import { productImage } from '../product-media.js'
import { packageLink } from '../tourism-packages.js'
import { projectSavedPlans } from '../itinerary-plans.js'

const props = defineProps({ initialProjectId: { type: String, default: '' } })
const emit = defineEmits(['open-product', 'open-order'])

const projects = ref([])
const conflictMode = ref(false)
const conflictAlerts = ref([])
const conflictOrders = ref([])
const conflictLoading = ref(false)
const conflictLoadError = ref('')
const selectedConflictId = ref('')
const memories = ref([])
const activeProject = ref(null)
const loading = ref(false)
const projectLoading = ref(false)
const planning = ref(false)
const busy = ref(false)
const deletingProjectId = ref('')
const error = ref('')
const deleteError = ref('')
const memoryNotice = ref('')
const deletingMemoryId = ref('')
const expandedMemoryId = ref('')
const requestText = ref('')
const localChatRuns = ref([])
const chatHistory = ref(null)
const dayTimeline = ref(null)
const selectedDay = ref(1)
const selectedResource = ref(null)
const resourceReturnFocus = ref(null)
const resourceCloseButton = ref(null)
const destination = ref('')
const departureCity = ref('')
const days = ref(3)
const tripStartDate = ref('')
const railCollapsed = ref(false)
const itineraryExpanded = ref(false)
const conflictExpanded = ref(false)
const chatExpanded = ref(false)
const chatCollapsed = ref(false)
const weather = ref(null)
let weatherRequestId = 0
const today = new Date()
const minTripDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
const requirements = ref('')
const preferenceSelections = ref({ companion: '', styles: [], pace: '', lodging: '', schedule: [] })

const preferenceGroups = [
  { key: 'companion', label: '同行伙伴', options: ['独自出行', '伴侣', '家人', '朋友'], multiple: false },
  { key: 'styles', label: '旅行风格', options: ['自然风光', '历史文化', '美食体验', '购物休闲'], multiple: true },
  { key: 'pace', label: '出行节奏', options: ['轻松慢游', '适中安排', '紧凑充实'], multiple: false },
  { key: 'lodging', label: '住宿偏好', options: ['交通便利', '靠近地铁', '特色住宿', '经济实惠'], multiple: false },
]
const scheduleOptions = ['早出发', '晚归']
const preferenceSummary = computed(() => {
  const selected = [
    preferenceSelections.value.companion,
    ...preferenceSelections.value.styles,
    preferenceSelections.value.pace,
    preferenceSelections.value.lodging,
    ...preferenceSelections.value.schedule,
  ].filter(Boolean)
  return selected.length ? selected.join(' · ') : '选择适合你的旅行偏好'
})
const planProjection = computed(() => activeProject.value
  ? projectSavedPlans(activeProject.value)
  : { itinerary: null, unscheduled: [] })
const currentItinerary = computed(() => planProjection.value.itinerary)
const currentDay = computed(() => currentItinerary.value?.days?.find(day => day.day === selectedDay.value) || currentItinerary.value?.days?.[0] || null)
const currentWeather = computed(() => weather.value?.days?.find(day => day.date === currentDay.value?.date))
const allItems = computed(() => currentItinerary.value?.days?.flatMap(day => day.items) || [])
const crossProjectConflicts = computed(() => {
  const ordersById = new Map(conflictOrders.value.map(order => [order.id, order]))
  return conflictAlerts.value.flatMap(alert => {
    if (alert.status === 'resolved' || !alert.orderId || !alert.otherOrderId) return []
    const order = ordersById.get(alert.orderId)
    const otherOrder = ordersById.get(alert.otherOrderId)
    if (!order?.projectId || !otherOrder?.projectId || order.projectId === otherOrder.projectId) return []
    return [{ ...alert, order, otherOrder }]
  })
})
const selectedConflict = computed(() => crossProjectConflicts.value.find(
  alert => alert.id === selectedConflictId.value,
) || crossProjectConflicts.value[0] || null)
const pendingCrossProjectConflicts = computed(() => crossProjectConflicts.value.filter(
  alert => alert.status === 'pending',
).length)
const unreadCrossProjectConflicts = computed(() => crossProjectConflicts.value.filter(
  alert => alert.status === 'pending' && !alert.readAt,
).length)
const chatRuns = computed(() => {
  const local = localChatRuns.value.filter(run => run.projectId === activeProject.value?.id)
  const events = activeProject.value?.events || []
  const saved = (activeProject.value?.runs || []).filter(run => {
    const related = events.filter(event => event.runId === run.id)
    return !(isProactiveRun(run) && related.length && related.every(event => event.status === 'resolved'))
      && !local.some(pending => !pending.previousRunIds.includes(run.id) && pending.requestSummary === run.requestSummary)
  })
  const alerts = events.filter(event => event.status !== 'resolved' && (event.orderId || event.code === 'weather')).map(event => ({
    id: event.id,
    triggerType: 'booking_conflict',
    status: 'completed',
    createdAt: event.createdAt,
    resolved: event.status === 'resolved',
    responseSummary: `${event.details}${event.status === 'resolved' ? '（已解决）' : ''}`,
  }))
  return [...saved, ...alerts, ...local].sort((a, b) =>
    Number(Boolean(a.resolved)) - Number(Boolean(b.resolved))
    || (a.createdAt || '').localeCompare(b.createdAt || ''))
})

function startChatRun(projectId, requestSummary) {
  const run = {
    id: crypto.randomUUID(),
    projectId,
    requestSummary,
    status: 'running',
    createdAt: new Date().toISOString(),
    previousRunIds: (activeProject.value?.runs || []).map(item => item.id),
  }
  localChatRuns.value.push(run)
  return run.id
}

function projectAssistantRoute(projectId) {
  return `#${encodeURIComponent('AI行程助手')}?${new URLSearchParams({ project: projectId })}`
}

function finishChatRun(id, project, failure) {
  const run = localChatRuns.value.find(item => item.id === id)
  if (!run) return
  if (project && activeProject.value?.id === run.projectId) activeProject.value = project
  if (failure && !project) {
    run.status = 'failed'
    run.responseSummary = `暂时没能完成调整：${failure.message}。请稍后重新发送。`
  } else {
    localChatRuns.value = localChatRuns.value.filter(item => item.id !== id)
  }
}

watch([chatRuns, projectLoading], async () => {
  await nextTick()
  if (chatHistory.value) chatHistory.value.scrollTop = chatHistory.value.scrollHeight
}, { flush: 'post' })

watch(() => [activeProject.value?.id, currentDay.value?.day], async () => {
  await nextTick()
  if (dayTimeline.value) dayTimeline.value.scrollTop = 0
})

async function api(path, method = 'GET', payload) {
  const response = await fetch(path, {
    method,
    headers: payload ? { 'content-type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  })
  const contentType = response.headers.get('content-type') || ''
  let data
  if (contentType.includes('application/json')) {
    data = await response.json()
  } else {
    const body = (await response.text()).trim()
    throw new Error(
      `服务接口返回了非 JSON 响应（HTTP ${response.status}）。请确认 API 服务已启动，并重启开发服务器。${body && body !== 'Not found' ? ` 响应：${body.slice(0, 120)}` : ''}`,
    )
  }
  if (!response.ok) {
    const failure = new Error(data.error || '请求失败，请稍后重试')
    failure.project = data.project
    throw failure
  }
  return data
}

watch(() => [activeProject.value?.id, activeProject.value?.tripStartDate], async ([id, date]) => {
  const requestId = ++weatherRequestId
  weather.value = null
  if (!id || !date) return
  try {
    const result = await api(`/api/projects/${encodeURIComponent(id)}/weather`)
    if (requestId === weatherRequestId) weather.value = result
  } catch {
    if (requestId === weatherRequestId) weather.value = { available: false }
  }
})

async function loadProjects() {
  loading.value = true
  try {
    projects.value = (await api('/api/projects')).projects
  } catch (failure) {
    error.value = failure.message
  } finally {
    loading.value = false
  }
}

async function loadMemories() {
  try {
    memories.value = (await api('/api/memories')).memories
  } catch {}
}

async function deleteMemory(memory) {
  if (deletingMemoryId.value) return
  deletingMemoryId.value = memory.id
  memoryNotice.value = ''
  try {
    const result = await api(`/api/memories/${encodeURIComponent(memory.id)}`, 'DELETE')
    memories.value = result.memories
    expandedMemoryId.value = ''
  } catch (failure) {
    memoryNotice.value = failure.message
  } finally {
    deletingMemoryId.value = ''
  }
}

async function markEventsRead(id) {
  activeProject.value = await api(`/api/projects/${id}/events/read`, 'POST', {})
  window.dispatchEvent(new CustomEvent('trip-alert-read', { detail: { projectId: id } }))
  await loadProjects()
}

async function refreshAlerts(event) {
  await Promise.all([loadProjects(), loadConflictCenter()])
  if (activeProject.value?.id && activeProject.value.id === event.detail?.projectId) {
    try {
      const current = await api(`/api/projects/${encodeURIComponent(activeProject.value.id)}`)
      if (activeProject.value?.id === current.id) activeProject.value = current
    } catch {}
  }
}

async function loadConflictCenter() {
  conflictLoading.value = true
  conflictLoadError.value = ''
  try {
    const [alerts, orders] = await Promise.all([
      api('/api/alerts'),
      api('/api/orders'),
    ])
    conflictAlerts.value = alerts.alerts || []
    conflictOrders.value = orders.orders || []
    if (!crossProjectConflicts.value.some(alert => alert.id === selectedConflictId.value)) {
      selectedConflictId.value = crossProjectConflicts.value[0]?.id || ''
    }
  } catch (failure) {
    conflictLoadError.value = failure.message
  } finally {
    conflictLoading.value = false
  }
}

function openConflictCenter() {
  chatExpanded.value = false
  conflictMode.value = true
  activeProject.value = null
  projectLoading.value = false
  itineraryExpanded.value = false
  conflictExpanded.value = false
  error.value = ''
  markConflictCenterRead()
}

async function markConflictCenterRead() {
  await loadConflictCenter()
  const unread = crossProjectConflicts.value.filter(alert => alert.status === 'pending' && !alert.readAt)
  if (!unread.length) return
  await Promise.all(unread.map(alert => api(`/api/alerts/${encodeURIComponent(alert.id)}/read`, 'POST', {}).catch(() => null)))
  await loadConflictCenter()
  const projectIds = new Set(unread.flatMap(alert => [
    alert.order?.projectId,
    alert.otherOrder?.projectId,
  ]).filter(Boolean))
  window.dispatchEvent(new CustomEvent('trip-alert-read', {
    detail: { alertIds: unread.map(alert => alert.id) },
  }))
  for (const projectId of projectIds) {
    window.dispatchEvent(new CustomEvent('trip-alert-refresh', { detail: { projectId } }))
  }
}

async function openProject(id) {
  chatExpanded.value = false
  conflictMode.value = false
  conflictExpanded.value = false
  error.value = ''
  projectLoading.value = true
  try {
    await markEventsRead(id)
    selectedDay.value = 1
  } catch (failure) {
    error.value = failure.message
  } finally {
    projectLoading.value = false
  }
}

function selectProject(project) {
  openProject(project.id)
}

async function deleteProject(project) {
  if (busy.value || planning.value || deletingProjectId.value) return
  const confirmed = window.confirm(
    `确定删除“${project.destination}之旅”吗？该行程的安排、提醒和对话记录会一并删除，且无法恢复。`,
  )
  if (!confirmed) return

  deletingProjectId.value = project.id
  deleteError.value = ''
  try {
    await api(`/api/projects/${project.id}`, 'DELETE')
    projects.value = projects.value.filter(item => item.id !== project.id)
    if (activeProject.value?.id === project.id) {
      activeProject.value = null
    }
  } catch (failure) {
    deleteError.value = failure.message
  } finally {
    deletingProjectId.value = ''
  }
}

function openResource(resource, event) {
  if (resource.type === 'hotel' || (['flight', 'train'].includes(resource.type) && resource.origin && resource.arrivalCity && resource.travelDate)) {
    emit('open-product', { resource, projectId: activeProject.value.id })
    return
  }
  resourceReturnFocus.value = event.currentTarget
  selectedResource.value = resource
  nextTick(() => resourceCloseButton.value?.focus())
}

function closeResource() {
  selectedResource.value = null
  nextTick(() => resourceReturnFocus.value?.focus())
}

function handleResourceDialogKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeResource()
    return
  }
  if (event.key !== 'Tab') return

  const focusable = [...event.currentTarget.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
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

function newProject() {
  chatExpanded.value = false
  conflictMode.value = false
  conflictExpanded.value = false
  activeProject.value = null
  itineraryExpanded.value = false
  error.value = ''
  destination.value = ''
  departureCity.value = ''
  days.value = 3
  tripStartDate.value = ''
  requirements.value = ''
  preferenceSelections.value = { companion: '', styles: [], pace: '', lodging: '', schedule: [] }
}

function choosePreference(group, option) {
  if (group.multiple) {
    const selection = preferenceSelections.value[group.key]
    preferenceSelections.value[group.key] = selection.includes(option)
      ? selection.filter(value => value !== option)
      : [...selection, option]
  } else {
    preferenceSelections.value[group.key] = preferenceSelections.value[group.key] === option ? '' : option
  }
}

function toggleSchedule(option) {
  const selection = preferenceSelections.value.schedule
  preferenceSelections.value.schedule = selection.includes(option)
    ? selection.filter(value => value !== option)
    : [...selection, option]
}

function closePreferences(event) {
  const picker = event.currentTarget.closest('details')
  if (picker) picker.open = false
}

function normalizedPreferences() {
  const prefs = preferenceSelections.value
  return [
    prefs.companion && `同行伙伴：${prefs.companion}`,
    prefs.styles.length && `旅行风格：${prefs.styles.join('、')}`,
    prefs.pace && `出行节奏：${prefs.pace}`,
    prefs.lodging && `住宿偏好：${prefs.lodging}`,
    prefs.schedule.length && `时间偏好：${prefs.schedule.join('、')}`,
  ].filter(Boolean)
}

async function generateForProject(projectId) {
  if (planning.value) return
  planning.value = true
  error.value = ''
  const runId = startChatRun(projectId, '根据已填写的目的地、天数和偏好生成首次行程草案')
  try {
    const project = await api(`/api/projects/${projectId}/plan`, 'POST', {})
    finishChatRun(runId, project)
    await loadProjects()
    if (activeProject.value?.id === projectId) selectedDay.value = 1
  } catch (failure) {
    finishChatRun(runId, failure.project, failure)
    if (activeProject.value?.id === projectId) error.value = failure.message
    await loadProjects()
  } finally {
    planning.value = false
  }
}

async function createProject() {
  if (!destination.value.trim() || busy.value) return
  if (!Number.isInteger(days.value) || days.value < 1 || days.value > 14) {
    error.value = '出行天数需为 1 到 14 天'
    return
  }
  busy.value = true
  error.value = ''
  try {
    const project = await api('/api/projects', 'POST', {
      destination: destination.value.trim(),
      departureCity: departureCity.value.trim(),
      days: Number(days.value),
      tripStartDate: tripStartDate.value,
      preferences: normalizedPreferences(),
      requirements: requirements.value.trim(),
    })
    activeProject.value = project
    projects.value = [project, ...projects.value]
    await generateForProject(project.id)
  } catch (failure) {
    error.value = failure.message
  } finally {
    busy.value = false
  }
}

function adjustDays(delta) {
  const value = Number(days.value)
  days.value = Math.min(14, Math.max(1, (Number.isFinite(value) ? value : 1) + delta))
}

function swapCities() {
  const origin = departureCity.value
  departureCity.value = destination.value
  destination.value = origin
}

function handleComposerKeydown(event) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  sendRequest()
}

async function sendRequest() {
  const request = requestText.value.trim()
  if (!request || !activeProject.value || busy.value || planning.value) return
  const projectId = activeProject.value.id
  busy.value = true
  error.value = ''
  requestText.value = ''
  const runId = startChatRun(projectId, request)
  try {
    const project = await api(`/api/projects/${projectId}/assist`, 'POST', { request })
    finishChatRun(runId, project)
    await loadProjects()
  } catch (failure) {
    finishChatRun(runId, failure.project, failure)
    if (activeProject.value?.id === projectId) error.value = failure.message
    await loadProjects()
  } finally {
    busy.value = false
  }
}

async function resolveMemoryPrompt(promptId, action) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const result = await api(
      `/api/projects/${activeProject.value.id}/memory-prompts/${promptId}/${action}`,
      'POST',
      {},
    )
    activeProject.value = result.project
    memories.value = result.memories
    memoryNotice.value = action === 'confirm' ? '已记录为长期偏好。' : '已保留为本次项目偏好。'
  } catch (failure) {
    error.value = failure.message
  } finally {
    busy.value = false
  }
}

function statusLabel(status) {
  return ({ planning: '规划中', active: '进行中', running: '运行中', completed: '已完成', failed: '未完成' })[status] || status
}

function itemTypeLabel(type) {
  return ({ transport: '交通', stay: '住宿', attraction: '景点', meal: '餐饮', other: '安排' })[type] || '安排'
}

function resourceTypeLabel(type) {
  return ({ flight: '机票', train: '火车票', hotel: '酒店', sight: '景点' })[type] || '参考'
}

function isProactiveRun(run) {
  return ['booking_conflict', 'intent_conflict', 'booking_boundary'].includes(run.triggerType)
}

function handleKeydown(event) {
  if (event.key === 'Escape' && chatExpanded.value && !selectedResource.value) {
    chatExpanded.value = false
    return
  }
  if (event.key === 'Escape' && itineraryExpanded.value && !selectedResource.value) {
    itineraryExpanded.value = false
    chatCollapsed.value = false
  }
  if (event.key === 'Escape' && conflictExpanded.value) conflictExpanded.value = false
}

function toggleItineraryExpanded() {
  if (itineraryExpanded.value) chatCollapsed.value = false
  itineraryExpanded.value = !itineraryExpanded.value
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('trip-alert-refresh', refreshAlerts)
  await Promise.all([loadProjects(), loadMemories(), loadConflictCenter()])
  if (props.initialProjectId) await openProject(props.initialProjectId)
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('trip-alert-refresh', refreshAlerts)
})
</script>

<template>
  <div class="project-assistant" :class="{ 'has-active-project': activeProject || projectLoading, 'rail-collapsed': railCollapsed, 'itinerary-fullscreen': itineraryExpanded, 'conflict-fullscreen': conflictExpanded }">
    <aside class="project-rail">
      <div class="rail-heading"><span v-if="!railCollapsed">我的行程</span><button type="button" class="rail-toggle" :aria-label="railCollapsed ? '展开行程栏' : '收起行程栏'" :title="railCollapsed ? '展开行程栏' : '收起行程栏'" :aria-expanded="!railCollapsed" @click="railCollapsed = !railCollapsed"><PanelLeftOpen v-if="railCollapsed" :size="19" /><PanelLeftClose v-else :size="19" /></button></div>
      <template v-if="!railCollapsed">
      <InteractiveHoverButton class="new-project-button" @click="newProject" variant="outline"><Plus :size="16" /> 新建行程</InteractiveHoverButton>
      <div class="project-list">
        <button type="button" class="conflict-link" :class="{ selected: conflictMode }" :aria-current="conflictMode ? 'page' : undefined" @click="openConflictCenter">
          <span class="conflict-link-icon"><CircleAlert :size="16" /></span>
          <span class="project-link-text"><strong>冲突处理</strong><small>跨行程提醒与订单协调</small></span>
          <span v-if="unreadCrossProjectConflicts" class="conflict-count" :aria-label="`${unreadCrossProjectConflicts} 条未读冲突`">{{ unreadCrossProjectConflicts }}</span>
        </button>
        <div v-if="loading && !projects.length" class="project-list-skeleton" role="status" aria-label="正在载入行程">
          <span v-for="index in 3" :key="index" class="project-skeleton-row"><i></i><span><b></b><small></small></span></span>
        </div>
        <section v-for="(project, index) in projects" :key="project.id" v-reveal="{ delay: index * 65, variant: 'fade' }" class="project-entry">
          <div class="project-link-row">
            <button class="project-link" :class="{ selected: activeProject?.id === project.id }" @click="selectProject(project)">
              <span class="project-link-icon"><MapPin :size="15" /></span>
              <span class="project-link-text"><strong>{{ project.destination }}之旅</strong><small>{{ project.days }} 天 · {{ statusLabel(project.status) }}</small></span>
              <span v-if="project.pendingEvents" class="event-count" aria-label="有新的行程提醒"></span>
            </button>
            <button
              class="project-delete"
              :aria-label="`删除${project.destination}行程`"
              :title="`删除${project.destination}行程`"
              :disabled="busy || planning || Boolean(deletingProjectId)"
              @click="deleteProject(project)"
            ><LoaderCircle v-if="deletingProjectId === project.id" :size="15" class="spinning" /><Trash2 v-else :size="15" /></button>
          </div>
        </section>
        <p v-if="!projects.length && !loading" class="no-projects">还没有行程</p>
      </div>
      <p v-if="deleteError" class="delete-error" role="alert">{{ deleteError }}</p>
      <section class="memory-list">
        <h2><Sparkles :size="15" /> 我的偏好 <span>{{ memories.length }}</span></h2>
        <div v-if="memories.length" class="memory-chips">
          <div v-for="memory in memories" :key="memory.id" class="memory-chip" :class="{ 'is-expanded': expandedMemoryId === memory.id }">
            <button type="button" class="memory-chip-label" :aria-expanded="expandedMemoryId === memory.id" @click="expandedMemoryId = expandedMemoryId === memory.id ? '' : memory.id">{{ memory.value }}</button>
            <button v-if="expandedMemoryId === memory.id" type="button" class="memory-chip-remove" :aria-label="`删除偏好：${memory.value}`" :disabled="Boolean(deletingMemoryId)" @click="deleteMemory(memory)"><LoaderCircle v-if="deletingMemoryId === memory.id" :size="13" class="spinning" /><X v-else :size="13" /></button>
          </div>
        </div>
        <small v-else>还没有已保存的偏好</small>
        <p v-if="memoryNotice" class="memory-list-notice" role="status">{{ memoryNotice }}</p>
      </section>
      </template>
    </aside>

    <main class="assistant-main" :class="{ 'workspace-view': activeProject || projectLoading || conflictMode }">
      <template v-if="conflictMode">
      <Teleport to="body" :disabled="!conflictExpanded && !chatExpanded">
      <section class="conflict-view" :class="{ 'conflict-view-expanded': conflictExpanded, 'rail-is-collapsed': railCollapsed, 'conflict-chat-expanded': chatExpanded }">
        <header class="conflict-view-heading">
          <div><span class="assistant-kicker">跨行程协同</span><h1>冲突处理</h1><p>集中查看影响多个行程的订单冲突。</p></div>
          <div class="conflict-view-actions">
            <span class="conflict-summary">{{ pendingCrossProjectConflicts }} 条待处理</span>
            <button type="button" class="conflict-view-action" :aria-label="railCollapsed ? '展开行程侧栏' : '收起行程侧栏'" :title="railCollapsed ? '展开行程侧栏' : '收起行程侧栏'" :aria-expanded="!railCollapsed" @click="railCollapsed = !railCollapsed"><PanelLeftOpen v-if="railCollapsed" :size="17" /><PanelLeftClose v-else :size="17" /><span>{{ railCollapsed ? '展开侧栏' : '收起侧栏' }}</span></button>
            <button type="button" class="conflict-view-action" :aria-label="conflictExpanded ? '退出全屏' : '全屏查看冲突处理'" :title="conflictExpanded ? '退出全屏' : '全屏查看冲突处理'" @click="conflictExpanded = !conflictExpanded"><Minimize2 v-if="conflictExpanded" :size="17" /><Maximize2 v-else :size="17" /><span>{{ conflictExpanded ? '退出全屏' : '全屏查看' }}</span></button>
          </div>
        </header>
        <div class="conflict-workspace">
          <section class="conflict-thread">
            <div class="panel-heading"><div><h2>对话</h2><small>跨行程提醒</small></div><button type="button" class="chat-collapse-toggle" :aria-label="chatExpanded ? '退出对话全屏' : '全屏查看对话'" :title="chatExpanded ? '退出对话全屏' : '全屏查看对话'" @click="chatExpanded = !chatExpanded"><Minimize2 v-if="chatExpanded" :size="18" /><Maximize2 v-else :size="18" /></button></div>
            <div v-if="conflictLoading" class="conflict-empty" role="status"><LoaderCircle :size="18" class="spinning" />正在读取订单冲突…</div>
            <div v-else-if="conflictLoadError" class="conflict-empty conflict-error" role="alert">{{ conflictLoadError }}</div>
            <div v-else-if="!crossProjectConflicts.length" class="conflict-empty"><Check :size="20" /><strong>目前没有跨行程订单冲突</strong><span>检测到相关冲突后，会集中显示在这里。</span></div>
            <div v-else class="conflict-thread-list" role="log" aria-label="跨行程冲突对话">
              <article v-for="alert in crossProjectConflicts" :key="alert.id" class="conflict-message" :class="{ 'is-resolved': alert.status === 'resolved' }">
                <div class="conflict-message-meta"><span><CircleAlert :size="14" />{{ alert.severity === 'hard' ? '硬冲突' : '需要留意' }}</span><small>{{ alert.status === 'resolved' ? '已解决' : alert.readAt ? '已读' : '待查看' }}</small></div>
                <p>{{ alert.details }}</p>
                <button type="button" class="conflict-message-link" @click="selectedConflictId = alert.id">查看涉及订单 <ArrowRight :size="14" /></button>
              </article>
            </div>
          </section>
          <section class="conflict-manager">
            <div class="panel-heading"><div><h2>冲突管理</h2><small>查看订单与行程影响</small></div><button type="button" class="conflict-refresh" :disabled="conflictLoading" aria-label="刷新冲突" title="刷新冲突" @click="loadConflictCenter"><LoaderCircle v-if="conflictLoading" :size="16" class="spinning" /><ArrowRight v-else :size="16" /></button></div>
            <template v-if="selectedConflict">
              <div class="conflict-detail-summary"><span :class="['conflict-severity', selectedConflict.severity]">{{ selectedConflict.severity === 'hard' ? '硬冲突' : '软冲突' }}</span><strong>{{ selectedConflict.status === 'resolved' ? '已解决' : '待处理' }}</strong><p>{{ selectedConflict.details }}</p></div>
              <div class="conflict-orders">
                <article v-for="(order, index) in [selectedConflict.order, selectedConflict.otherOrder]" :key="order.id" class="conflict-order-card">
                  <span class="conflict-order-label">{{ index === 0 ? '相关订单' : '冲突订单' }} · {{ order.projectDestination || projects.find(project => project.id === order.projectId)?.destination || '行程' }}</span>
                  <strong>{{ order.title }}</strong>
                  <small>{{ order.type === 'hotel' ? `${order.checkIn} 至 ${order.checkOut}` : `${order.travelDate} · ${order.origin} → ${order.arrivalCity}` }}</small>
                  <button type="button" @click="emit('open-order', order.id)">查看订单详情 <ArrowRight :size="14" /></button>
                </article>
              </div>
            </template>
            <div v-else class="conflict-empty manager-empty"><CircleAlert :size="20" /><strong>暂无可管理的冲突</strong><span>项目内提醒会保留在对应行程的对话中。</span></div>
            <p class="conflict-manager-note">订单改签、取消和费用处理仍由你确认办理。</p>
          </section>
        </div>
      </section>
      </Teleport>
      </template>
      <section v-else-if="!activeProject && !projectLoading" class="create-view">
        <div class="create-heading"><span class="assistant-kicker">AI 行程助手</span><h1>下一段旅程，从这里开始。</h1><p>告诉我目的地和天数，一起把旅程安排得更合心意。</p></div>
        <form v-reveal="{ variant: 'left' }" class="create-form" @submit.prevent="createProject">
          <div class="route-fields" aria-label="出发和到达城市">
            <label class="form-field route-city"><span>出发城市 <small>选填</small></span><input v-model="departureCity" maxlength="60" placeholder="例如：沈阳" autocomplete="address-level2" aria-label="出发城市" /></label>
            <button class="route-swap" type="button" aria-label="交换出发城市和到达城市" title="交换出发城市和到达城市" @click="swapCities"><ArrowLeftRight :size="19" /></button>
            <label class="form-field route-city"><span>到达城市</span><input v-model="destination" maxlength="60" placeholder="例如：杭州" autocomplete="off" aria-label="到达城市" required /></label>
          </div>
          <label class="form-field days-input"><span>出行天数</span><div class="days-control"><button type="button" aria-label="减少出行天数" :disabled="days <= 1" @click="adjustDays(-1)"><Minus :size="15" /></button><input v-model.number="days" type="number" min="1" max="14" step="1" inputmode="numeric" aria-label="出行天数" required /><span>天</span><button type="button" aria-label="增加出行天数" :disabled="days >= 14" @click="adjustDays(1)"><Plus :size="15" /></button></div></label>
          <label class="form-field trip-date-input"><span><CalendarDays :size="15" /> 出发日期 <small>选填</small></span><input v-model="tripStartDate" type="date" :min="minTripDate" aria-label="出发日期" /></label>
          <div class="form-field preference-field">
          <span id="preference-label">旅行偏好 <small>选填</small></span>
          <details class="preference-picker">
            <summary aria-labelledby="preference-label preference-value"><span id="preference-value" class="preference-value" :class="{ 'is-placeholder': !normalizedPreferences().length }">{{ preferenceSummary }}</span><ChevronDown :size="17" /></summary>
            <div class="preference-menu">
              <fieldset v-for="group in preferenceGroups" :key="group.key" class="preference-group">
                <legend>{{ group.label }} <small>{{ group.multiple ? '可多选' : '单选' }}</small></legend>
                <div class="preference-options">
                  <button v-for="option in group.options" :key="option" type="button" :aria-pressed="group.multiple ? preferenceSelections[group.key].includes(option) : preferenceSelections[group.key] === option" :class="{ selected: group.multiple ? preferenceSelections[group.key].includes(option) : preferenceSelections[group.key] === option }" @click="choosePreference(group, option)">
                    <Check v-if="group.multiple ? preferenceSelections[group.key].includes(option) : preferenceSelections[group.key] === option" :size="13" />{{ option }}
                  </button>
                </div>
              </fieldset>
              <fieldset class="preference-group schedule-group"><legend>时间偏好 <small>可同时选择</small></legend><div class="preference-options">
                <button v-for="option in scheduleOptions" :key="option" type="button" :aria-pressed="preferenceSelections.schedule.includes(option)" :class="{ selected: preferenceSelections.schedule.includes(option) }" @click="toggleSchedule(option)"><Check v-if="preferenceSelections.schedule.includes(option)" :size="13" />{{ option }}</button>
              </div></fieldset>
              <button type="button" class="preference-done" @click="closePreferences">完成</button>
            </div>
          </details>
          </div>
          <label class="form-field requirements-input"><span>其他要求 <small>选填</small></span><textarea v-model="requirements" maxlength="500" rows="3" placeholder="例如：每天不安排太满，想留时间逛当地市场"></textarea><small class="character-count">{{ requirements.length }}/500</small></label>
          <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
          <InteractiveHoverButton class="primary-action" type="submit" :disabled="!destination.trim() || busy || planning" variant="solid">
            <LoaderCircle v-if="busy || planning" :size="17" class="spinning" /><Sparkles v-else :size="17" />
            {{ busy || planning ? '正在为你规划…' : '生成行程安排' }}
          </InteractiveHoverButton>
          <p class="privacy-note">AI 行程为参考建议；商品、价格和订单不代表真实交易。</p>
        </form>
      </section>

      <template v-else>
        <div v-if="projectLoading" class="project-detail-skeleton" role="status" aria-label="正在载入行程详情">
          <div class="skeleton-toolbar"><i></i><b></b></div>
          <div class="skeleton-workspace">
            <section class="skeleton-pane"><i></i><i></i><b></b><span></span><span></span><span></span></section>
            <section class="skeleton-pane"><i></i><i></i><b></b><span></span><span></span><span></span><span></span></section>
          </div>
        </div>
        <template v-else>
        <div class="project-toolbar">
          <div><span class="assistant-kicker">我的旅程</span><h1>{{ activeProject.destination }}之旅 <span>{{ activeProject.days }} 天</span></h1></div>
        </div>
        <Teleport to="body" :disabled="!itineraryExpanded && !chatExpanded">
        <div class="project-grid" :class="{ 'itinerary-expanded': itineraryExpanded, 'rail-collapsed': railCollapsed, 'chat-collapsed': chatCollapsed, 'project-chat-expanded': chatExpanded }" :aria-label="chatExpanded ? '全屏对话' : itineraryExpanded ? '全屏对话和行程安排' : undefined">
          <section v-reveal="{ variant: 'left' }" class="chat-panel" :class="{ 'chat-panel-collapsed': chatCollapsed && itineraryExpanded }">
            <div class="panel-heading"><div><h2>对话</h2><small>和小程一起调整旅程</small></div><div class="chat-heading-actions"><button v-if="itineraryExpanded && !chatExpanded" type="button" class="chat-collapse-toggle" :aria-label="chatCollapsed ? '展开对话栏' : '收起对话栏'" :title="chatCollapsed ? '展开对话栏' : '收起对话栏'" :aria-expanded="!chatCollapsed" @click="chatCollapsed = !chatCollapsed"><PanelLeftOpen v-if="chatCollapsed" :size="18" /><PanelLeftClose v-else :size="18" /></button><button v-if="!chatCollapsed || !itineraryExpanded" type="button" class="chat-collapse-toggle" :aria-label="chatExpanded ? '退出对话全屏' : '全屏查看对话'" :title="chatExpanded ? '退出对话全屏' : '全屏查看对话'" @click="chatExpanded = !chatExpanded"><Minimize2 v-if="chatExpanded" :size="18" /><Maximize2 v-else :size="18" /></button></div></div>
            <div ref="chatHistory" class="chat-history" role="log" aria-label="与小程的对话" aria-live="polite">
              <template v-for="run in chatRuns" :key="run.id">
                <div v-if="!isProactiveRun(run)" class="chat-message user-message"><span class="message-avatar">用</span><p>{{ run.requestSummary }}</p></div>
                <div class="chat-message assistant-message">
                  <span class="message-avatar ai-avatar"><Sparkles :size="14" /></span>
                  <div class="assistant-reply" :class="{ 'loading-reply': run.status === 'running', 'failed-reply': run.status === 'failed', 'proactive-reply': isProactiveRun(run) }">
                    <strong v-if="isProactiveRun(run)" class="proactive-label"><CircleAlert :size="14" />行程提醒</strong>
                    <div v-if="run.status === 'running'" class="message-pending" role="status"><MessageLoading /><span>小程正在思考…</span></div>
                    <p v-else>{{ run.responseSummary || '行程安排已经准备好。' }}</p>
                  </div>
                </div>
              </template>
              <div v-for="prompt in activeProject.memoryPrompts" :key="prompt.id" class="memory-question">
                <div><Sparkles :size="14" /><p>{{ prompt.question }}</p></div>
                <section><button :disabled="busy" @click="resolveMemoryPrompt(prompt.id, 'confirm')">记为长期偏好</button><button :disabled="busy" @click="resolveMemoryPrompt(prompt.id, 'dismiss')">仅本次</button></section>
              </div>
              <p v-if="memoryNotice" class="memory-notice" role="status">{{ memoryNotice }}</p>
              <section v-if="activeProject.packages?.length" class="chat-package-recommendation" aria-label="旅游套餐推荐">
                <div class="chat-package-heading"><div><strong>我找到一组适合这段行程的旅游包</strong><small>可以打开查看套餐内容，再决定是否购买</small></div><Sparkles :size="16" /></div>
                <a v-for="item in activeProject.packages" :key="item.id" :href="packageLink(item.id, projectAssistantRoute(activeProject.id))" class="chat-package-card">
                  <span><b>{{ item.title }}</b><small>{{ item.detail }} · {{ item.startDate }} 出发</small></span><ArrowRight :size="17" />
                </a>
              </section>
              <div v-if="!chatRuns.length" class="empty-chat"><Sparkles :size="21" /><span>告诉我你想怎么安排，我会帮你一起调整。</span></div>
            </div>
            <form class="composer" @submit.prevent="sendRequest">
              <textarea v-model="requestText" rows="3" maxlength="1000" placeholder="继续调整这段行程…（回车发送，Shift+回车换行）" aria-label="行程调整消息" :disabled="busy || planning" @keydown="handleComposerKeydown"></textarea>
              <div><small>可以直接告诉小程想怎么调整；已预订内容不会自动更改。</small><button aria-label="发送调整请求" :disabled="!requestText.trim() || busy || planning"><Send :size="16" /></button></div>
            </form>
          </section>

          <section v-reveal="{ variant: 'right', delay: 80 }" class="itinerary-panel" aria-label="行程安排">
            <div class="panel-heading"><div><h2>行程安排</h2><small>{{ activeProject.days }} 天 · {{ allItems.length }} 项安排<span v-if="activeProject.tripStartDate"> · {{ activeProject.tripStartDate }} 出发</span></small></div><button type="button" class="itinerary-expand-button" :aria-label="itineraryExpanded ? '退出全屏' : '全屏查看行程'" :title="itineraryExpanded ? '退出全屏' : '全屏查看行程'" @click="toggleItineraryExpanded"><Minimize2 v-if="itineraryExpanded" :size="18" /><Maximize2 v-else :size="18" /><span>{{ itineraryExpanded ? '退出全屏' : '全屏查看' }}</span></button></div>
            <section v-if="planProjection.unscheduled.length" class="unscheduled-plans" aria-label="待安排计划">
              <strong>待安排 · 未预订</strong>
              <p v-for="item in planProjection.unscheduled" :key="item.id">{{ item.title }} <span>{{ item.description }}</span></p>
            </section>
            <div v-if="planning" class="planning-state"><LoaderCircle :size="20" class="spinning" />正在为你整理行程…</div>
            <template v-else-if="currentItinerary">
              <div class="weather-advice">
                <CalendarDays :size="16" />
                <div v-if="currentWeather"><strong>{{ currentWeather.date }} · {{ currentWeather.description }} {{ currentWeather.temperatureMin }}～{{ currentWeather.temperatureMax }}℃</strong><span>降水概率 {{ currentWeather.precipitationProbability }}% · 预报可能变化 · {{ weather.location }} · {{ weather.source }}</span></div>
                <div v-else><strong>出行时请注意天气哦</strong><span v-if="weather?.available">当前日期不在已获取的预报范围内</span></div>
              </div>
              <section v-if="activeProject.packages?.length" class="matching-packages" aria-label="旅游套餐推荐">
                <div><strong>找到与您需求相似的旅游包</strong><small>组合内商品需分别预订</small></div>
                <a v-for="item in activeProject.packages" :key="item.id" :href="packageLink(item.id, projectAssistantRoute(activeProject.id))">
                  <span><b>{{ item.title }}</b><small>{{ item.detail }} · {{ item.startDate }} 出发</small></span><ArrowRight :size="18" />
                </a>
              </section>
              <div class="day-tabs" role="tablist" aria-label="选择出行日期" @wheel="event => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.currentTarget.scrollLeft += event.deltaY }">
                <button v-for="day in currentItinerary.days" :key="day.day" role="tab" :aria-selected="selectedDay === day.day" :class="{ selected: selectedDay === day.day }" @click="selectedDay = day.day">
                  <span>第 {{ day.day }} 天<span v-if="day.date"> · {{ day.date.slice(5) }}</span></span><strong>{{ day.title }}</strong><small>{{ day.items.length }} 项安排</small>
                </button>
              </div>
              <div v-if="currentDay" ref="dayTimeline" class="day-timeline" tabindex="0" aria-label="当日行程安排">
                <header><div><span class="day-script">Day {{ currentDay.day }}</span><h3>{{ currentDay.title }}</h3></div></header>
                <article v-for="(item, index) in currentDay.items" :key="item.id" v-reveal="{ delay: (index % 5) * 62, variant: 'fade' }" class="timeline-item">
                  <div class="timeline-time"><span>{{ item.time || '行程中' }}</span><i></i></div>
                  <div class="timeline-content">
                    <div class="timeline-item-heading">
                      <div class="item-heading-copy"><small>{{ itemTypeLabel(item.type) }} <span v-if="item.bookingId" class="booking-chip">已预订</span><span v-else-if="item.savedPlanId" class="booking-chip">未预订计划</span></small><h4>{{ item.title }}</h4></div>
                      <figure v-if="item.type === 'attraction'" class="attraction-preview"><img :src="productImage({ type: 'sight', title: item.title, detail: item.description })" alt="景点类别参考图片" loading="lazy" /></figure>
                    </div>
                    <p class="timeline-description">{{ item.description }}</p>
                    <div v-if="item.resources?.length" class="resource-list">
                      <article v-for="(resource, resourceIndex) in item.resources" :key="resource.id" v-reveal="{ delay: resourceIndex * 70 }" class="resource-card" :class="{ 'without-image': ['flight', 'train'].includes(resource.type) }">
                        <img v-if="!['flight', 'train'].includes(resource.type)" :src="productImage(resource)" :alt="`${resourceTypeLabel(resource.type)}参考图片`" loading="lazy" />
                        <div class="resource-copy"><span>{{ resource.type === 'sight' && resource.title !== item.title ? '相似景点' : resourceTypeLabel(resource.type) }} · {{ resource.provider }}</span><strong>{{ resource.title }}</strong><small>{{ resource.detail }}</small></div>
                        <div class="resource-action"><strong>{{ resource.price ? `¥${resource.price}` : '免费' }}<small>{{ resource.unit }}</small></strong><InteractiveHoverButton @click="openResource(resource, $event)">查看详情</InteractiveHoverButton></div>
                      </article>
                    </div>
                    <p v-if="item.travelLeg && !currentItinerary.departureCity && !item.resources?.length" class="resource-guidance">告诉小程你的出发城市，可查找匹配的交通。</p>
                  </div>
                  <span class="timeline-index">{{ String(index + 1).padStart(2, '0') }}</span>
                </article>
              </div>
              <div v-if="error" class="inline-error" role="alert">{{ error }}</div>
            </template>
            <div v-else class="no-itinerary">
              <CircleAlert :size="24" /><strong>{{ error ? '行程暂未生成' : '还没有行程安排' }}</strong>
              <p>{{ error || '重新整理一份行程建议。' }}</p>
              <InteractiveHoverButton class="secondary-action" :disabled="planning" @click="generateForProject(activeProject.id)" variant="outline">重新规划</InteractiveHoverButton>
            </div>
            <p class="itinerary-footnote">交通、住宿和景点信息为本地参考，不代表实时价格、库存或预订状态。</p>
          </section>
        </div>
        </Teleport>
        <Teleport to="body">
        <Transition name="assistant-modal">
        <div v-if="selectedResource" class="resource-modal-backdrop" @click.self="closeResource">
          <section class="resource-modal" role="dialog" aria-modal="true" :aria-label="selectedResource.title" tabindex="-1" @keydown="handleResourceDialogKeydown">
            <button ref="resourceCloseButton" class="resource-modal-close" aria-label="关闭详情" @click="closeResource"><X :size="19" /></button>
            <img v-if="!['flight', 'train'].includes(selectedResource.type)" :src="productImage(selectedResource)" :alt="`${resourceTypeLabel(selectedResource.type)}参考图片`" />
            <div><span class="assistant-kicker">{{ resourceTypeLabel(selectedResource.type) }} · 参考信息</span><h2>{{ selectedResource.title }}</h2><p>{{ selectedResource.detail }}</p><strong class="resource-modal-price">{{ selectedResource.price ? `¥${selectedResource.price}` : '免费' }} <small>{{ selectedResource.unit }}</small></strong><p class="resource-disclaimer">本地生成的课程演示数据，不是实时商品，不提供真实预订。</p></div>
          </section>
        </div>
        </Transition>
        </Teleport>
        <p v-if="error && currentItinerary" class="project-error" role="alert">{{ error }}</p>
        </template>
      </template>
    </main>
  </div>
</template>

<style scoped>
.unscheduled-plans{margin:0 0 14px;padding:12px 15px;border:1px solid #e5e5d8;border-radius:6px;background:#fffdf6;color:#665e40;font-size:13px}
.unscheduled-plans p{margin:7px 0 0;line-height:1.5}.unscheduled-plans p span{color:#8b8572;font-size:12px}
.matching-packages{display:grid;gap:9px;margin:0 0 16px;padding:13px 15px;border:1px solid #d9eaf3;border-radius:6px;background:#f7fbfe}
.matching-packages>div{display:flex;align-items:baseline;justify-content:space-between;gap:12px;color:#254a63;font-size:13px}
.matching-packages small{color:#718794;font-size:12px;line-height:1.5}
.matching-packages a{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid #e1ebf0;border-radius:4px;background:#fff;color:#0874be;text-decoration:none}
.matching-packages a:hover,.matching-packages a:focus-visible{border-color:#80bde4;background:#f4faff}
.matching-packages a span{display:grid;gap:4px;min-width:0}
.matching-packages a b{color:#284c62;font-size:13px}
.chat-package-recommendation{display:grid;gap:9px;margin:14px 0 4px;padding:13px 14px;border:1px solid #d9eaf3;border-radius:6px;background:#f7fbfe}
.chat-package-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;color:#0874be}
.chat-package-heading>div{display:grid;gap:3px}
.chat-package-heading strong{color:#254a63;font-size:13px;font-weight:650}
.chat-package-heading small{color:#718794;font-size:11px;line-height:1.5}
.chat-package-card{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 11px;border:1px solid #e1ebf0;border-radius:4px;background:#fff;color:#0874be;text-decoration:none}
.chat-package-card:hover,.chat-package-card:focus-visible{border-color:#80bde4;background:#f4faff}
.chat-package-card span{display:grid;gap:4px;min-width:0}
.chat-package-card b{color:#284c62;font-size:13px}
.chat-package-card small{overflow-wrap:anywhere;color:#718794;font-size:11px;line-height:1.45}
@media(max-width:600px){.matching-packages>div{align-items:flex-start;flex-direction:column;gap:3px}}
.project-assistant{--trip-blue:#0066cc;--trip-blue-dark:#0052a3;--trip-orange:#ff8a00;height:100%;min-height:0;overflow:hidden;display:grid;grid-template:minmax(0,1fr)/240px minmax(0,1fr);gap:16px;padding:16px 24px 20px;background:#edf4fa;color:#17324d}
.project-rail{grid-column:1;grid-row:1;min-width:0;min-height:0;overflow-y:auto;background:#fff;border:1px solid #d6e5efb8;border-radius:var(--radius-card,14px);display:flex;flex-direction:column;padding:20px 14px 14px}
.rail-heading{display:flex;align-items:center;padding:0 5px 14px;font-size:14px;font-weight:700;color:#183b5b}
.new-project-button{height:40px;border:1px solid #a6d1f6;border-radius:5px;display:flex;align-items:center;justify-content:center;gap:7px;color:#0766bf;background:#ebf5ff;font-size:12px;font-weight:600}
.project-list{overflow:auto;margin-top:13px;display:grid;align-content:start;gap:4px}
.project-link{width:100%;min-height:54px;padding:7px 8px;display:flex;align-items:center;gap:9px;text-align:left;border:1px solid transparent;border-radius:4px}
.project-link:hover,.project-link.selected{background:#e5f4ff;border-color:#bcdefb}
.project-link-row{position:relative;min-width:0;display:flex;align-items:center}
.project-link-row .project-link{width:100%;min-width:0;flex:1;padding-right:44px}
.project-link-icon{width:30px;height:30px;display:grid;place-items:center;border-radius:4px;background:#d7edff;color:#0766bf;flex:none}
.project-link-text{min-width:0;display:grid;gap:4px;flex:1}
.project-link-text strong{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.project-link-text small{font-size:9px;color:#829199}
.event-count{min-width:17px;height:17px;border-radius:50%;display:grid;place-items:center;background:#fff1e8;color:#cc7747;font-size:9px}
.no-projects{padding:9px 5px;font-size:10px;color:#89969c}
.memory-list{margin-top:auto;padding:13px 11px 11px;border:1px solid #d5e8f6;border-radius:10px;background:#f2f8fd;display:grid;gap:9px}
.memory-list h2{margin:0;display:flex;align-items:center;gap:6px;color:#275879;font-size:14px;font-weight:700}
.memory-list h2 svg{color:#0879c9}
.memory-list h2>span{margin-left:auto;min-width:20px;height:20px;padding:0 5px;display:grid;place-items:center;border-radius:999px;background:#deeffc;color:#276b9b;font-size:11px;font-weight:600}
.memory-chips{display:flex;flex-wrap:wrap;gap:7px}
.memory-chip{min-height:32px;display:inline-flex;align-items:center;overflow:hidden;border:1px solid #d5e4ee;border-radius:8px;background:#fff;color:#4a6b80;transition:border-color .16s ease,background-color .16s ease,box-shadow .16s ease}
.memory-chip:hover,.memory-chip.is-expanded{border-color:#8fc5e9;background:#fafdff;box-shadow:0 2px 7px #1d639015}
.memory-chip-label{min-width:0;min-height:30px;padding:0 9px;color:inherit;font-size:12px;line-height:1.4}
.memory-chip-remove{width:27px;height:30px;flex:none;display:grid;place-items:center;border-left:1px solid #e5edf2;color:#8497a4;transition:color .16s ease,background-color .16s ease}
.memory-chip-remove:hover:not(:disabled){background:#fff0ee;color:#c4574d}
.memory-chip-remove:disabled{cursor:wait}
.memory-list>small{font-size:11px;color:#8295a4}
.memory-list-notice{margin:0;color:#b3483b;font-size:11px;line-height:1.45}
.assistant-main{display:block;grid-column:2;grid-row:1;min-width:0;min-height:0;overflow:auto;margin:0;padding:28px clamp(22px,3vw,44px);border:1px solid #d6e5efb8;border-radius:var(--radius-card,14px)}
.create-view{max-width:1020px;margin:24px auto 32px}
.create-heading{margin-bottom:31px}.assistant-kicker{font:700 11px "DM Sans",sans-serif;color:#136fc7;letter-spacing:1px}
.create-heading h1{font-size:34px;font-weight:700;color:#12395e;margin:10px 0 9px}
.create-heading p{font-size:15px;color:#657d91;margin:0}
.create-form{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 190px;gap:20px 18px;padding:26px;background:#fff;border:1px solid #d2e5f5;border-radius:8px;box-shadow:0 12px 34px #0b417112}
.assistant-main .create-form{padding:0;background:transparent;border:0;box-shadow:none}
.form-field{min-width:0;display:grid;gap:8px;position:relative}
.form-field>span{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:#294a66}
.form-field>span svg{color:#0066cc}
.form-field small{font-size:9px;font-weight:400;color:#8b999f}
.form-field input,.form-field select,.form-field textarea{width:100%;border:1px solid #d6e3ed;border-radius:5px;background:#fff;padding:12px 13px;color:#183b5b;font:inherit;font-size:14px}
.form-field input,.form-field select{height:52px}
.days-control{height:52px;padding:0 6px;display:flex;align-items:center;gap:4px;border:1px solid #d6e3ed;border-radius:8px;background:#fff;color:#183b5b}
.days-control:focus-within{border-color:#58aaf0;box-shadow:0 0 0 3px #0066cc18}
.days-control input:focus-visible{outline:0}
.days-control input{width:0;min-width:0;flex:1;padding:0 4px;border:0;border-radius:0;outline:0;background:transparent;text-align:center;font:inherit;font-size:16px;font-variant-numeric:tabular-nums}
.days-control input::-webkit-inner-spin-button,.days-control input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
.days-control input[type=number]{appearance:textfield;-moz-appearance:textfield}
.days-control>span{color:#738493;font-size:13px}
.days-control button{width:32px;height:32px;flex:none;display:grid;place-items:center;border-radius:6px;background:#f2f7fa;color:#476276;transition:background-color .16s ease,color .16s ease}
.days-control button:hover:not(:disabled){background:#e3f2fd;color:#075fa7}
.days-control button:disabled{opacity:.4;cursor:not-allowed}
.form-field textarea{resize:vertical;line-height:1.6}
.route-fields{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);position:relative;min-width:0}
.route-city{min-width:0;gap:5px;padding:12px 18px;border:1px solid #d6e3ed;background:#fff}
.route-city:first-child{border-radius:8px 0 0 8px}
.route-city:last-child{border-left:0;border-radius:0 8px 8px 0;padding-left:28px}
.route-city>span{color:#718496;font-size:13px;font-weight:500}
.route-city input.form-field-input,.route-city input{height:35px;padding:0;border:0;background:transparent;font-size:18px;font-weight:650}
.route-city input:focus{outline:0}
.route-city:focus-within{border-color:#69afe8;box-shadow:0 0 0 2px #1682dc16;z-index:1}
.route-swap{position:absolute;z-index:2;top:50%;left:50%;width:44px;height:44px;display:grid;place-items:center;transform:translate(-50%,-50%);border:1px solid #d6e3ed;border-radius:50%;background:#fff;color:#0874ce;box-shadow:0 2px 9px #183a5416;transition:background-color .16s ease,border-color .16s ease}
.route-swap:hover{background:#eff8ff;border-color:#9bcdf2}
.route-swap:focus-visible{outline:2px solid #1682dc;outline-offset:2px}
.days-input,.trip-date-input{grid-column:span 1}
.preference-field,.requirements-input{grid-column:1/-1}
.preference-picker{position:relative;min-width:0}
.preference-picker>summary{height:52px;padding:0 13px;list-style:none;border:1px solid #d6e3ed;border-radius:5px;background:#fff;display:flex;align-items:center;justify-content:space-between;cursor:pointer}
.preference-picker>summary::-webkit-details-marker{display:none}
.preference-picker>summary .preference-value{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;color:#183b5b}
.preference-picker>summary .preference-value.is-placeholder{color:#8295a4}
.preference-picker>summary>svg{color:#7e8d94}
.preference-menu{position:absolute;z-index:5;top:calc(100% + 4px);left:0;right:0;max-height:360px;overflow:auto;padding:13px 14px;background:white;border:1px solid #dce5e9;border-radius:3px;box-shadow:0 10px 25px #263e4a1a}
.preference-group{border:0;padding:0 0 12px;margin:0}.preference-group:last-child{padding-bottom:0}
.preference-group legend{font-size:10px;font-weight:600;color:#485d65;margin-bottom:7px}.preference-group legend small{color:#91a0a5;font-weight:400;margin-left:4px}
.preference-options{display:flex;flex-wrap:wrap;gap:6px}
.preference-options button{height:29px;padding:0 9px;border:1px solid #e0e7ea;border-radius:3px;display:flex;align-items:center;gap:4px;font-size:10px;color:#66777e}
.preference-options button.selected{border-color:#429ced;background:#e5f4ff;color:#0766bf}
.schedule-group{border-top:1px solid #edf0f1;padding-top:11px}
.preference-done{height:30px;margin-top:10px;padding:0 11px;border:1px solid #dce5e9;border-radius:3px;color:#0f6aa2;background:#f8fbfc;font-size:9px}
.character-count{position:absolute;right:12px;bottom:9px}
.primary-action{min-width:230px;height:50px;grid-column:1/-1;justify-self:end;padding:0 20px;border-radius:5px;background:var(--trip-blue);color:#fff;display:flex;justify-content:center;align-items:center;gap:9px;font-size:14px;font-weight:700;box-shadow:0 5px 12px #0066cc2a}
.primary-action:hover:not(:disabled){background:var(--trip-blue-dark)}.primary-action:disabled{opacity:.55;cursor:wait}
.privacy-note{grid-column:1/-1;text-align:right;margin:-13px 4px 0;font-size:11px;color:#8193a1}
.inline-error,.project-error{color:#b34b3a;font-size:10px}.inline-error{grid-column:1/-1;margin:0}
.project-toolbar{max-width:1500px;margin:0 auto 15px;display:flex;align-items:center;justify-content:space-between;gap:15px}
.project-toolbar h1{font-size:22px;font-weight:700;margin:4px 0 0;color:#153c61}.project-toolbar h1 span{font-size:13px;font-weight:400;color:#829198;margin-left:6px}
.project-grid{max-width:1500px;min-height:calc(100vh - 165px);margin:auto;display:grid;grid-template-columns:minmax(230px,.84fr) minmax(280px,1fr) minmax(260px,.92fr);border:1px solid #e1e8eb;background:#fff;border-radius:4px;overflow:hidden}
.chat-panel,.itinerary-panel,.detail-panel{min-width:0;display:flex;flex-direction:column}
.chat-panel,.itinerary-panel{border-right:1px solid #e6ecee}
.panel-heading{min-height:57px;padding:0 15px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e8edef}
.panel-heading>div{display:grid;gap:4px}.panel-heading h2{font-size:12px;font-weight:600;margin:0}.panel-heading small{font-size:9px;color:#8a989e}.panel-heading>svg{color:#127dbe}
.chat-history{flex:1;min-height:200px;overflow:auto;padding:13px 11px;display:flex;flex-direction:column;gap:13px}
.chat-message{display:flex;align-items:flex-start;gap:7px}.message-avatar{width:23px;height:23px;flex:none;display:grid;place-items:center;border-radius:50%;background:#edf2f4;color:#67818a;font-size:9px}
.ai-avatar{background:#eaf5f8;color:#1071a9}
.chat-message p{margin:1px 0 0;padding:9px 10px;background:#f4f7f8;border-radius:3px;font-size:10px;line-height:1.65;color:#4c6169}
.user-message p{background:#e4f2f9}
.assistant-message>div{min-width:0}.assistant-message small{display:block;margin:5px 2px 0;color:#92a0a5;font-size:8px}
.memory-question{padding:9px;border:1px solid #dce9ed;border-radius:3px;background:#f7fbfc}
.memory-question>div{display:flex;align-items:flex-start;gap:6px}.memory-question svg{flex:none;margin-top:2px;color:#1077af}
.memory-question p{margin:0;font-size:9px;line-height:1.6;color:#526a73}
.memory-question section{display:flex;gap:6px;margin:8px 0 0 20px}
.memory-question button{height:25px;padding:0 7px;border:1px solid #dce5e8;border-radius:3px;background:#fff;color:#60777f;font-size:8px}
.memory-question button:first-child{border-color:#d3e8de;background:#edf7f1;color:#40836b}
.memory-question button:disabled{opacity:.5}
.memory-notice{font-size:9px;color:#43826c;margin:0 3px}
.empty-chat{min-height:150px;display:grid;align-content:center;justify-items:center;gap:8px;color:#91a0a5;font-size:10px;text-align:center}
.empty-chat svg{color:#e18b52}
.composer{border-top:1px solid #e8edef;padding:10px;display:grid;gap:7px}
.composer textarea{width:100%;resize:vertical;border:1px solid #e0e7e9;border-radius:3px;padding:8px;font:inherit;font-size:10px;line-height:1.5}
.composer>div{display:flex;align-items:center;justify-content:space-between;gap:6px}.composer small{font-size:8px;color:#8d999e;line-height:1.5}
.composer button{width:30px;height:30px;border-radius:3px;background:#096bb5;color:#fff;display:grid;place-items:center;flex:none}.composer button:disabled{opacity:.4}
.planning-state{min-height:150px;display:flex;align-items:center;justify-content:center;gap:8px;color:#6f858d;font-size:10px}
.spinning{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.day-overview-list{padding:9px;display:grid;align-content:start;gap:5px;overflow:auto}
.day-overview{min-height:56px;padding:7px 9px;border:1px solid transparent;border-radius:3px;display:flex;align-items:center;gap:9px;text-align:left}
.day-overview:hover,.day-overview.selected{border-color:#dbe9ee;background:#f3f8fa}
.day-number{font:600 17px "DM Sans",sans-serif;color:#dc8a52}
.day-overview-text{min-width:0;flex:1;display:grid;gap:4px}.day-overview-text strong{font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.day-overview-text small{font-size:8px;color:#89979c}
.day-overview>svg{color:#8e9da2}
.no-itinerary{flex:1;min-height:220px;padding:25px 20px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:9px;color:#829199}
.no-itinerary>svg{color:#d48a58}.no-itinerary strong{font-size:11px;color:#4a5d64}.no-itinerary p{max-width:300px;margin:0;font-size:9px;line-height:1.6}
.secondary-action{height:32px;padding:0 10px;border:1px solid #dce5e9;border-radius:3px;display:flex;align-items:center;gap:5px;font-size:9px;color:#4c7c92}
.itinerary-footnote{margin:auto 11px 0;padding:10px 0 11px;border-top:1px solid #edf0f1;color:#8c989d;font-size:8px;line-height:1.5}
.detail-tabs{min-height:48px;display:flex;border-bottom:1px solid #e8edef}
.detail-tabs button{flex:1;display:flex;align-items:center;justify-content:center;gap:5px;border-bottom:2px solid transparent;color:#86949a;font-size:10px}
.detail-tabs button.active{border-color:#106baa;color:#0e6398;font-weight:600}
.detail-tabs button span{min-width:16px;height:16px;border-radius:50%;display:grid;place-items:center;background:#fff0e5;color:#bb7044;font-size:8px}
.selected-day-detail{padding:14px 14px 10px}
.selected-day-detail h2{font-size:14px;margin:5px 0 11px}
.selected-day-detail ol{list-style:none;margin:0;padding:0}
.selected-day-detail li{display:grid;grid-template-columns:42px minmax(0,1fr);gap:8px;padding:10px 0;border-top:1px solid #edf0f1}
.selected-day-detail time{padding-top:1px;font-size:9px;color:#0e669b}
.selected-day-detail li strong{font-size:10px;color:#40565e}.selected-day-detail li p{font-size:9px;line-height:1.55;color:#839197;margin:4px 0 0}
.empty-detail{flex:1;min-height:180px;padding:22px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#8a999f;text-align:center;font-size:9px}
.empty-detail svg{color:#83a6b3}.empty-detail button{color:#0e6499;font-size:9px}
.project-error{margin:9px auto;max-width:1500px}
@media(max-width:1180px){.project-assistant{grid-template-columns:215px minmax(0,1fr)}.assistant-main{padding:17px}.project-grid{grid-template-columns:minmax(220px,.85fr) minmax(280px,1fr)}.detail-panel{grid-column:1/-1;min-height:260px;border-top:1px solid #e6ecee}.chat-panel{border-right:1px solid #e6ecee}.itinerary-panel{border-right:0}}
@media(max-width:720px){.project-assistant{display:flex;flex-direction:column}.project-rail{min-height:unset;max-height:170px;border-right:0;border-bottom:1px solid #e3e9ec;padding:8px 10px}.rail-heading{padding:0 3px 6px}.new-project-button{height:31px}.project-list{grid-auto-flow:column;grid-auto-columns:minmax(135px,1fr);overflow-x:auto;overflow-y:hidden;margin-top:7px}.project-link{min-height:45px}.memory-list{display:none}.assistant-main{padding:18px 14px;overflow:visible}.create-view{margin:27px auto 35px}.create-heading{margin-bottom:23px}.create-heading h1{font-size:27px;line-height:1.25}.create-heading p{font-size:14px;line-height:1.6}.create-form{grid-template-columns:minmax(0,1fr) 132px;gap:17px 10px;padding:17px;border-radius:6px}.form-field>span{font-size:12px}.form-field input,.form-field select{padding:9px;font-size:13px}.form-field .days-control input{padding:0 2px;font-size:13px}.days-control{gap:2px;padding:0 4px}.days-control button{width:28px;height:30px}.preference-menu{max-height:50vh;padding:10px}.primary-action{width:100%;min-width:0;justify-self:stretch}.privacy-note{text-align:center;margin:0}.project-toolbar{margin-bottom:10px}.project-toolbar h1{font-size:16px}.project-grid{min-height:unset;grid-template-columns:1fr;overflow:visible}.chat-panel,.itinerary-panel{border-right:0;border-bottom:1px solid #e6ecee}.chat-panel{min-height:300px}.chat-history{max-height:250px}.itinerary-panel{min-height:230px}.detail-panel{grid-column:auto;min-height:320px;border-top:0}.selected-day-detail{padding:12px}.event-inbox{max-height:420px}.event-trigger{height:32px;padding:0 7px;font-size:9px}.proposal-banner{margin:8px}.day-overview-list{max-height:280px}.assistant-main .project-error{margin:8px 0}}
.assistant-main{background:#ebf3fbb8;backdrop-filter:blur(28px) saturate(1.1)}
.project-rail{padding:22px 13px 15px}
.rail-heading{color:#173d60}
.project-entry{min-width:0}
.project-link-row{width:100%}
.project-link{min-height:60px;border-radius:6px}
.project-link-text strong{font-size:13px;color:#093862}
.project-link-text small{font-size:11px}
.project-delete{position:absolute;z-index:1;top:50%;right:7px;transform:translateY(-50%);width:32px;height:32px;display:grid;place-items:center;border:1px solid transparent;border-radius:5px;color:#91a4b3;opacity:.65;transition:opacity 0.195s ease,color .15s ease,border-color .15s ease,background .15s ease}
.project-entry:hover .project-delete,.project-delete:focus-visible{opacity:1}
.project-delete:hover:not(:disabled){border-color:#f1d4cc;background:#fff5f2;color:#c85842}
.project-delete:disabled{cursor:wait;opacity:.45}
.project-link-row .project-link:hover{transform:none}
.delete-error{margin:8px 4px 0;color:#b34b3a;font-size:11px;line-height:1.5}
.event-count{width:9px;min-width:9px;height:9px;background:#f26b44;box-shadow:0 0 0 3px #fff1eb}
.project-grid{max-width:1600px;min-height:calc(100vh - 150px);grid-template-columns:minmax(280px,.62fr) minmax(0,1.45fr);border:1px solid #d2e2ef;border-radius:6px;background:transparent;box-shadow:0 4px 18px #093a640b}
.chat-panel{background:#eaf4ff80}
.itinerary-panel{background:#ffffffb8}
.chat-panel{border-right:1px solid #dae7f2;min-height:620px}
.itinerary-panel{min-height:620px;border-right:0}
.panel-heading{min-height:68px;padding:0 20px;border-bottom-color:#dde9f3}
.panel-heading h2{font-size:16px;color:#183d5e}
.panel-heading small{font-size:12px;color:#8295a5}
.panel-heading>svg{color:#0066cc}
.chat-history{padding:18px 16px;gap:18px}
.chat-message{gap:10px}
.message-avatar{width:34px;height:34px;font-size:13px;background:#ddeefc;color:#1066b0}
.ai-avatar{background:#d8edff;color:#0766bf}
.chat-message p{padding:12px 14px;border-radius:7px;font-size:14px;line-height:1.8;color:#38556d}
.user-message p{background:#e5f4ff}
.assistant-message>div{flex:1}
.assistant-reply{padding:15px 16px;border:1px solid #e4edf4;border-radius:8px;background:#fff;box-shadow:0 4px 16px #0b43740b}
.assistant-reply p{margin:0;padding:0;background:none;font-size:14px;line-height:1.9;color:#284660;white-space:pre-line}
.assistant-reply.proactive-reply{border-color:#f1c9a8;background:#fffaf5}
.proactive-label{display:flex;align-items:center;gap:6px;margin-bottom:7px;color:#bf633c;font-size:12px}
.booking-chip{margin-left:5px;padding:2px 6px;border-radius:3px;background:#eaf7f0;color:#378562;font-size:10px}
.composer{padding:14px 16px;border-top:1px solid #e6eff5;background:#ffffffb8}
.composer textarea{min-height:94px;padding:12px;border:1px solid #d7e5ef;border-radius:6px;font-size:13px}
.composer>div{align-items:center}
.composer small{font-size:11px;color:#8295a5}
.composer button{width:40px;height:40px;border-radius:50%;background:#0066cc}
.itinerary-panel{overflow:hidden}
.day-tabs{display:flex;gap:8px;overflow-x:auto;padding:0 18px 13px;border-bottom:1px solid #e8eff5;scrollbar-width:thin}
.day-tabs button{min-width:150px;min-height:72px;padding:9px 12px;display:grid;justify-items:start;align-content:center;gap:5px;border:1px solid #e2ebf2;border-radius:5px;text-align:left;background:#fff}
.day-tabs button.selected{border-color:#50a6ef;background:#e5f4ff;box-shadow:inset 3px 0 #0066cc}
.day-tabs button span{font-size:11px;color:#116ab9}
.day-tabs button strong{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#093965}
.day-tabs button small{font-size:10px;color:#8495a3}
.day-timeline{padding:14px 20px 25px;overflow:auto;max-height:calc(100vh - 390px);min-height:250px;scrollbar-color:#afd0e7 transparent}
.day-timeline>header{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin:0 0 16px;padding:0 0 12px;border-bottom:1px solid #eaf0f4}
.day-script{font:italic 700 26px Georgia,serif;color:#0766bf}
.day-timeline h3{margin:5px 0 0;font-size:17px;color:#173d60}
.timeline-item{position:relative;display:grid;grid-template-columns:82px minmax(0,1fr);gap:14px;padding:0 0 18px}
.timeline-time{position:relative;display:flex;justify-content:flex-end;padding:7px 16px 0 0;color:#1065ac;font-size:12px;white-space:nowrap}
.timeline-time i{position:absolute;right:0;top:11px;width:9px;height:9px;border:2px solid #fff;border-radius:50%;background:#0b78c9;box-shadow:0 0 0 2px #9cd1f9;z-index:1}
.timeline-item:not(:last-child)::before{position:absolute;left:95px;top:20px;bottom:-2px;width:1px;background:#d2e5f2;content:""}
.timeline-content{min-width:0;padding:12px 14px;border:1px solid #e3edf4;border-radius:6px;background:#fff}
.timeline-item-heading{display:flex;align-items:center;gap:11px}
.item-heading-copy{min-width:0}
.attraction-preview{margin:0 0 0 auto;flex:none;position:relative;width:100px;height:64px;overflow:hidden;border-radius:5px;background:#eef4f8}
.attraction-preview img{width:100%;height:100%;display:block;object-fit:cover}
.item-heading-copy small{font-size:10px;color:#116ab9}
.item-heading-copy h4{margin:3px 0 0;font-size:15px;color:#203f5b}
.timeline-description{margin:8px 0 0 33px;color:#5e7486;font-size:12px;line-height:1.7}
.resource-list{display:grid;gap:8px;margin:12px 0 0 33px}
.resource-guidance{margin:9px 0 0 33px;padding:9px 11px;border-left:2px solid #ff9b43;background:#fff8f0;color:#8a6848;font-size:11px;line-height:1.6}
.resource-card{min-width:0;display:grid;grid-template-columns:90px minmax(0,1fr) auto;align-items:center;gap:12px;padding:8px;border:1px solid #e5edf3;border-radius:5px;background:#f2faff}
.resource-card.without-image{grid-template-columns:minmax(0,1fr) auto}
.resource-card.without-image .resource-action{grid-column:auto}
.resource-card>img{width:90px;height:68px;object-fit:cover;border-radius:4px;background:#deecf5}
.resource-copy{min-width:0;display:grid;gap:4px}
.resource-copy>span{font-size:10px;color:#71899b}
.resource-copy>strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#294b68}
.resource-copy>small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;color:#8294a2}
.resource-action{display:grid;justify-items:end;gap:7px}
.resource-action>strong{font-size:15px;color:#f07832;white-space:nowrap}
.resource-action>strong small{display:block;margin-top:2px;text-align:right;font-size:9px;font-weight:400;color:#8193a0}
.resource-action button{min-height:30px;padding:0 9px;border:1px solid #97cbf3;border-radius:4px;background:#fff;color:#0766bf;font-size:11px}
.resource-action button:hover{background:#e5f4ff}
.itinerary-footnote{margin:0;padding:11px 18px;border-top:1px solid #edf2f6;color:#8495a2;font-size:10px}
.resource-modal-backdrop{position:fixed;z-index:30;inset:0;display:grid;place-items:center;padding:20px;background:#122c4080}
.resource-modal{position:relative;width:min(560px,100%);overflow:hidden;border-radius:8px;background:#fff;box-shadow:0 24px 80px #102c4440}
.resource-modal>img{display:block;width:100%;height:230px;object-fit:cover}
.resource-modal>div{padding:23px}
.resource-modal h2{margin:8px 0;font-size:22px;color:#183e60}
.resource-modal>div>p{color:#657d91;line-height:1.7}
.resource-modal-price{display:block;margin-top:14px;color:#f07832;font-size:23px}
.resource-modal-price small{font-size:12px;font-weight:400}
.resource-disclaimer{padding-top:12px;border-top:1px solid #e8eff4;font-size:11px}
.resource-modal-close{position:absolute;top:12px;right:12px;width:38px;height:38px;display:grid;place-items:center;border-radius:50%;background:#fff;color:#2e536e;box-shadow:0 2px 8px #153c5c25}
@media(max-width:1180px){.project-grid{grid-template-columns:minmax(260px,.75fr) minmax(0,1.25fr)}.day-timeline{max-height:none}.timeline-item{grid-template-columns:72px minmax(0,1fr)}.timeline-item:not(:last-child)::before{left:85px}}
@media(max-width:720px){.project-grid{grid-template-columns:minmax(0,1fr);min-height:unset}.chat-panel{min-height:410px;border-right:0;border-bottom:1px solid #dae7f2}.itinerary-panel{min-height:500px}.panel-heading{min-height:58px}.chat-history{max-height:390px}.day-tabs{padding:0 12px 11px}.day-tabs button{min-width:132px;min-height:67px}.day-timeline{padding:13px 12px 20px;max-height:none}.day-timeline>header{align-items:flex-start;flex-direction:column}.timeline-item{grid-template-columns:58px minmax(0,1fr);gap:10px}.timeline-item:not(:last-child)::before{left:67px}.timeline-time{font-size:10px;padding-right:13px}.timeline-time i{width:8px;height:8px}.timeline-content{padding:10px}.item-heading-copy h4{font-size:13px}.timeline-description{margin-left:0}.resource-list,.resource-guidance{margin-left:0}.resource-card{grid-template-columns:66px minmax(0,1fr);gap:8px}.resource-card.without-image{grid-template-columns:minmax(0,1fr) auto}.resource-card>img{width:66px;height:58px}.resource-action{grid-column:2;display:flex;align-items:center;justify-content:space-between;width:100%}.resource-card.without-image .resource-action{grid-column:auto;width:auto}.resource-action>strong{font-size:13px}.resource-action>strong small{display:inline;margin-left:4px}.resource-action button{min-height:34px}.proposal-banner{margin:10px;padding:11px}.proposal-actions{justify-content:space-between;flex-wrap:wrap}.proposal-actions button{font-size:11px;padding:0 9px}.event-board{padding:16px}.event-board-heading{align-items:flex-start}.event-board-heading h2{font-size:19px}.event-board-heading p{font-size:12px}.event-board .event-form .primary-action{width:100%}.resource-modal>img{height:175px}}
@media(max-width:720px){.project-delete{width:28px;height:28px;opacity:1}.project-link-row{gap:1px}}

.assistant-main.workspace-view{display:flex;flex-direction:column;overflow:hidden;padding:24px clamp(18px,3vw,44px)}
.workspace-view .project-toolbar{width:100%;max-width:1600px;flex:none}
.workspace-view .project-grid{width:100%;min-height:0;min-width:0;flex:1;margin:0 auto;grid-template-rows:minmax(0,1fr);overflow:hidden}
.workspace-view .chat-panel,.workspace-view .itinerary-panel{min-height:0;overflow:hidden}
.workspace-view .panel-heading,.workspace-view .composer,.workspace-view .day-tabs,.workspace-view .itinerary-footnote{flex:none}
.workspace-view .chat-history{flex:1;min-height:0;max-height:none;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#afd0e7 transparent}
.chat-history>*{flex-shrink:0}
.chat-message{min-width:0}
.user-message{flex-direction:row-reverse;align-self:flex-end;max-width:92%}
.user-message p{min-width:0;white-space:pre-wrap;overflow-wrap:anywhere;border-radius:10px 2px 10px 10px}
.assistant-message{align-self:stretch}
.assistant-reply{overflow-wrap:anywhere;border-radius:2px 10px 10px 10px}
.assistant-reply.loading-reply{flex:none;padding:11px 14px;background:#f0f7ff}
.message-pending{display:flex;align-items:center;gap:10px;color:#0766bf}
.message-pending span{font-size:12px;color:#71899d}
.assistant-reply.failed-reply{background:#fff8f5;border-color:#f0d9d0}
.workspace-view .composer textarea{resize:none;max-height:120px}
.workspace-view .day-timeline{flex:1;min-height:0;max-height:none;overflow-y:auto;overscroll-behavior:contain}
.workspace-view .planning-state,.workspace-view .no-itinerary{flex:1;min-height:0;overflow:auto}
.workspace-view .project-error{width:100%;flex:none}
@media(max-width:720px){
  .project-assistant,.project-assistant.has-active-project{height:100%;min-height:0;overflow:hidden}
  .assistant-main{flex:1;min-height:0;overflow:auto}
  .has-active-project .project-rail{flex:none;min-height:0;max-height:160px;padding:8px 10px}
  .assistant-main.workspace-view{flex:1;min-height:0;padding:10px}
  .workspace-view .project-toolbar{margin-bottom:8px;gap:8px}
  .workspace-view .project-grid{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1.15fr) minmax(0,1fr)}
  .workspace-view .panel-heading{min-height:44px;padding:6px 12px}
  .workspace-view .panel-heading h2{font-size:14px}
  .workspace-view .panel-heading small{font-size:10px}
  .workspace-view .chat-history{padding:10px;gap:12px}
  .workspace-view .chat-message{gap:7px}
  .workspace-view .message-avatar{width:26px;height:26px;font-size:11px}
  .workspace-view .chat-message p{font-size:13px}
  .workspace-view .composer{padding:8px 10px;gap:5px}
  .workspace-view .composer textarea{height:54px;min-height:54px;max-height:54px;padding:8px;font-size:13px}
  .workspace-view .composer small{font-size:10px}
  .workspace-view .composer button{width:32px;height:32px}
  .workspace-view .day-tabs{padding:6px 10px}
  .workspace-view .day-tabs button{min-height:48px;gap:3px;padding:5px 9px}
  .workspace-view .day-tabs button small{display:none}
  .workspace-view .itinerary-footnote{padding:5px 10px;font-size:9px}
}

.rail-heading{font-size:16px}
.project-link{border-radius:6px}
.project-link-text strong{font-size:14px}
.project-link-text small,.no-projects{font-size:12px}
.memory-list h2{font-size:14px}
.memory-list>small{font-size:11px}
.new-project-button,.secondary-action{border-radius:5px}
.event-count{font-size:10px}
.create-heading .assistant-kicker{font-size:12px}
.create-heading p{font-size:16px;line-height:1.7}
.form-field small{font-size:12px}
.preference-group legend{font-size:12px}
.preference-options button{height:34px;padding:0 11px;border-radius:5px;font-size:12px}
.preference-done{height:34px;border-radius:5px;font-size:12px}
.privacy-note{font-size:12px}
.inline-error,.project-error{font-size:12px}
.project-toolbar h1{font-size:24px}
.project-toolbar h1 span{font-size:15px}
.panel-heading h2{font-size:17px}
.panel-heading small{font-size:12px}
.assistant-message small{font-size:11px}
.memory-question{border-radius:6px}
.memory-question p{font-size:12px}
.memory-question button{height:32px;padding:0 10px;border-radius:5px;font-size:11px}
.memory-notice,.planning-state{font-size:12px}
.empty-chat,.empty-detail{font-size:12px}
.composer textarea{border-radius:5px;font-size:13px}
.composer small,.itinerary-footnote{font-size:11px}
.day-overview{border-radius:5px}
.day-overview-text strong{font-size:13px}
.day-overview-text small{font-size:11px}
.no-itinerary strong{font-size:13px}
.no-itinerary p{font-size:11px}
.detail-tabs button{font-size:12px}
.selected-day-detail time{font-size:11px}
.selected-day-detail li strong{font-size:12px}
.selected-day-detail li p{font-size:11px}
.day-tabs button,.timeline-content,.resource-card{border-radius:6px}
.day-tabs button strong{font-size:14px}
.day-tabs button small{font-size:11px}
.resource-copy>span,.resource-copy>small{font-size:11px}
.resource-copy>strong{font-size:14px}
.resource-action button{border-radius:5px;font-size:12px;padding-inline:22px;min-height:34px}
.new-project-button.interactive-hover-button,.secondary-action.interactive-hover-button{padding-inline:24px}
.project-list-skeleton{display:grid;gap:7px;padding-top:2px}
.project-skeleton-row{position:relative;height:60px;padding:9px;display:flex;align-items:center;gap:10px;overflow:hidden;border:1px solid #e8eef2;border-radius:5px;background:#fff}
.project-skeleton-row>i,.project-skeleton-row b,.project-skeleton-row small,.skeleton-toolbar i,.skeleton-toolbar b,.skeleton-pane>i,.skeleton-pane>b,.skeleton-pane>span{position:relative;display:block;overflow:hidden;background:#edf2f5}
.project-skeleton-row>i{width:30px;height:30px;flex:none;border-radius:4px}
.project-skeleton-row>span{flex:1;display:grid;gap:7px}
.project-skeleton-row b{width:56%;height:11px}.project-skeleton-row small{width:34%;height:8px}
.project-detail-skeleton{width:100%;max-width:1600px;min-height:0;flex:1;margin:0 auto;display:flex;flex-direction:column;gap:12px}
.skeleton-toolbar{height:52px;flex:none;display:flex;align-items:center;justify-content:space-between}
.skeleton-toolbar i{width:155px;height:22px}.skeleton-toolbar b{width:132px;height:36px;border-radius:5px}
.skeleton-workspace{min-height:0;flex:1;display:grid;grid-template-columns:minmax(280px,.62fr) minmax(0,1.45fr);overflow:hidden;border:1px solid #dfe9f0;border-radius:6px;background:#fff}
.skeleton-pane{min-width:0;padding:18px;display:flex;flex-direction:column;gap:14px}
.skeleton-pane+.skeleton-pane{border-left:1px solid #e8eef2}
.skeleton-pane>i{height:17px;width:35%;margin-bottom:3px}
.skeleton-pane>b{height:68px;border-radius:5px}
.skeleton-pane>span{height:78px;border-radius:5px}
.project-skeleton-row::after,.skeleton-toolbar i::after,.skeleton-toolbar b::after,.skeleton-pane>i::after,.skeleton-pane>b::after,.skeleton-pane>span::after{position:absolute;inset:0;content:"";transform:translateX(-100%);background:linear-gradient(90deg,transparent,#ffffffae,transparent);animation:skeleton-sweep 1.25s ease-in-out infinite}
@keyframes skeleton-sweep{to{transform:translateX(100%)}}
@media(prefers-reduced-motion:reduce){.project-skeleton-row::after,.skeleton-toolbar i::after,.skeleton-toolbar b::after,.skeleton-pane>i::after,.skeleton-pane>b::after,.skeleton-pane>span::after{animation:none}}

@media(max-width:720px){
  .project-assistant{gap:12px;padding:12px}
  .project-rail{flex:none}
  .rail-heading{font-size:14px}
  .project-rail .project-list{margin-top:3px;flex:none}
  .project-rail .project-link{min-height:48px}
  .workspace-view .project-grid{grid-template-rows:minmax(0,.8fr) minmax(0,1.2fr)}
  .project-link-text strong{font-size:14px}
  .project-link-text small,.no-projects{font-size:12px}
  .create-heading p{font-size:14px}
  .project-toolbar h1{font-size:19px}
  .panel-heading h2{font-size:15px}
  .panel-heading small{font-size:11px}
  .workspace-view .panel-heading small{font-size:11px}
  .workspace-view .composer small{font-size:11px}
  .workspace-view .day-tabs button strong{font-size:13px}
  .workspace-view .day-tabs button small{display:block;font-size:10px}
  .workspace-view .itinerary-footnote{font-size:10px}
  .timeline-content,.resource-card{border-radius:5px}
  .skeleton-workspace{grid-template-columns:minmax(0,1fr);grid-template-rows:1fr 1.2fr}
  .skeleton-pane{padding:12px}
  .skeleton-pane+.skeleton-pane{border-top:1px solid #e8eef2;border-left:0}
}

.project-link,.project-delete,.day-tabs button,.resource-card,.resource-action button,
.composer button,.preference-options button,.detail-tabs button,.memory-question button{
  transition:color 160ms ease,background-color 160ms ease,border-color 160ms ease,box-shadow 180ms ease,transform 234ms cubic-bezier(.2,.75,.25,1);
}
.project-link:hover,.day-tabs button:hover,.resource-card:hover{transform:translateY(-1px)}
.project-link:active,.day-tabs button:active,.resource-action button:active,
.preference-options button:active,.memory-question button:active{transform:scale(.985)}
.memory-question,.planning-state,.no-itinerary,.create-view,.project-detail-skeleton{
  animation:assistant-state-in 312ms cubic-bezier(.16,1,.3,1) both;
}
.preference-picker[open] .preference-menu{animation:assistant-state-in 234ms cubic-bezier(.16,1,.3,1) both}
.assistant-modal-enter-active,.assistant-modal-leave-active{transition:opacity 234ms ease}
.assistant-modal-enter-active .resource-modal,.assistant-modal-leave-active .resource-modal{
  transition:opacity 286ms ease,transform 325ms cubic-bezier(.16,1,.3,1);
}
.assistant-modal-enter-from,.assistant-modal-leave-to{opacity:0}
.assistant-modal-enter-from .resource-modal,.assistant-modal-leave-to .resource-modal{
  opacity:0;transform:translateY(10px) scale(.99);
}
.resource-modal{transform-origin:center}
@media(max-width:720px){
  .project-assistant{height:auto;min-height:100%;overflow:visible}
  .project-rail{max-height:none;overflow:visible}
  .memory-list{display:grid;margin-top:9px;padding:9px}
}
@keyframes assistant-state-in{
  from{opacity:0;transform:translateY(5px)}
  to{opacity:1;transform:translateY(0)}
}
@media(prefers-reduced-motion:reduce){
  .assistant-modal-enter-active,.assistant-modal-leave-active,
  .assistant-modal-enter-active .resource-modal,.assistant-modal-leave-active .resource-modal{transition:none}
  .memory-question,.planning-state,.no-itinerary,.create-view,.project-detail-skeleton,
  .preference-picker[open] .preference-menu{animation:none}
}
.project-assistant.rail-collapsed{grid-template-columns:58px minmax(0,1fr)}
.rail-heading{justify-content:space-between;gap:8px}
.rail-toggle,.itinerary-expand-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:36px;min-height:36px;border:1px solid #d4e5f3;border-radius:6px;background:#fff;color:#176bb3}
.rail-toggle:hover,.itinerary-expand-button:hover{background:#eaf5ff;border-color:#9ecff4}
.rail-toggle:focus-visible,.itinerary-expand-button:focus-visible{outline:2px solid #1682dc;outline-offset:2px}
.rail-collapsed .project-rail{padding:16px 10px;overflow:hidden}
.rail-collapsed .rail-heading{padding:0;justify-content:center}
.trip-date-input{max-width:none}
.itinerary-expand-button{padding:0 10px;font-size:12px;white-space:nowrap}
.weather-advice{display:flex;align-items:flex-start;gap:9px;margin:12px 18px;padding:10px 12px;border:1px solid #cde5f7;border-radius:6px;background:#eff8ff;color:#176aab}
.weather-advice svg{flex:none;margin-top:1px}
.weather-advice div{display:grid;gap:3px;min-width:0}
.weather-advice strong{font-size:13px;line-height:1.4}
.weather-advice span{font-size:11px;line-height:1.4;color:#607e95}
.workspace-view .weather-advice{flex:none}
.project-grid.itinerary-expanded{position:fixed;z-index:100;inset:0;width:100vw;max-width:none;height:100dvh;min-height:0;margin:0;grid-template-columns:minmax(300px,.62fr) minmax(0,1.45fr);grid-template-rows:minmax(0,1fr);border:0;border-radius:0;background:#f8fbfe;box-shadow:none}
.itinerary-expanded .chat-panel,.itinerary-expanded .itinerary-panel{min-height:0;overflow:hidden}
.itinerary-expanded .chat-panel{background:#edf6ff}
.itinerary-expanded .itinerary-panel{background:#f8fbfe}
.itinerary-expanded .panel-heading,.itinerary-expanded .composer,.itinerary-expanded .weather-advice,.itinerary-expanded .day-tabs,.itinerary-expanded .itinerary-footnote{flex:none}
.itinerary-expanded .chat-history,.itinerary-expanded .day-timeline{flex:1;min-height:0;max-height:none;overflow-y:auto;overscroll-behavior:contain}
.itinerary-expanded .composer textarea{resize:none;max-height:120px}
.itinerary-expanded .itinerary-panel .panel-heading{padding-inline:clamp(18px,4vw,56px)}
.itinerary-expanded .day-tabs,.itinerary-expanded .day-timeline{padding-inline:clamp(18px,4vw,56px)}
.resource-modal-backdrop{z-index:110}
.project-assistant.itinerary-fullscreen .project-rail{position:fixed;z-index:101;inset:0 auto 0 0;width:260px;height:100dvh;max-height:none;box-shadow:4px 0 20px #173e561a}
.project-assistant.itinerary-fullscreen.rail-collapsed .project-rail{width:58px}
.project-assistant.itinerary-fullscreen .project-rail{padding-top:3px}
.project-assistant.itinerary-fullscreen .rail-heading{min-height:58px;padding:0 5px;box-sizing:border-box}
.project-grid.itinerary-expanded{inset:0 0 0 260px;width:auto;transition:left 220ms cubic-bezier(.2,.75,.25,1)}
.project-grid.itinerary-expanded.rail-collapsed{left:58px}
.chat-collapse-toggle{width:36px;height:36px;flex:none;display:grid;place-items:center;border:1px solid #d4e5f3;border-radius:6px;background:#fff;color:#176bb3}
.chat-collapse-toggle:hover{background:#eaf5ff;border-color:#9ecff4}
.chat-collapse-toggle:focus-visible{outline:2px solid #1682dc;outline-offset:2px}
.project-grid.itinerary-expanded.chat-collapsed{grid-template-columns:58px minmax(0,1fr)}
.itinerary-expanded .chat-panel-collapsed .panel-heading{min-height:58px;padding:8px;justify-content:center}
.chat-panel-collapsed .panel-heading>div:first-child,.chat-panel-collapsed .chat-history,.chat-panel-collapsed .composer{display:none}
@media(max-width:720px){
  .project-assistant.rail-collapsed{display:flex}
  .rail-collapsed .project-rail{padding:6px 10px}
  .rail-collapsed .rail-heading{justify-content:flex-start}
  .trip-date-input{max-width:none}
  .route-city{padding:11px 12px}
  .route-city:last-child{padding-left:19px}
  .route-city input.form-field-input,.route-city input{font-size:15px}
  .route-swap{width:38px;height:38px}
  .project-grid.itinerary-expanded{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,.85fr) minmax(0,1.15fr)}
  .project-grid.itinerary-expanded.chat-collapsed{grid-template-columns:minmax(0,1fr);grid-template-rows:56px minmax(0,1fr)}
  .itinerary-expanded .chat-panel-collapsed .panel-heading{min-height:56px;padding:6px 10px;justify-content:flex-start}
  .project-assistant.itinerary-fullscreen .project-rail,.project-assistant.itinerary-fullscreen.rail-collapsed .project-rail{inset:0 0 auto;width:100%;height:160px}
  .project-assistant.itinerary-fullscreen.rail-collapsed .project-rail{height:58px}
  .project-assistant.itinerary-fullscreen .project-rail{padding-top:10px}
  .project-assistant.itinerary-fullscreen .rail-heading{min-height:44px;padding:0 3px}
  .project-grid.itinerary-expanded{inset:160px 0 0;left:0;height:calc(100dvh - 160px);transition:top 220ms cubic-bezier(.2,.75,.25,1)}
  .project-grid.itinerary-expanded.rail-collapsed{inset:58px 0 0;left:0;height:calc(100dvh - 58px)}
  .itinerary-expanded .panel-heading{min-height:44px;padding:6px 12px}
  .itinerary-expanded .panel-heading h2{font-size:14px}
  .itinerary-expanded .panel-heading small{font-size:10px}
  .itinerary-expanded .chat-history{padding:10px;gap:12px}
  .itinerary-expanded .composer{padding:8px 10px;gap:5px}
  .itinerary-expanded .composer textarea{height:54px;min-height:54px;max-height:54px;padding:8px;font-size:13px}
  .itinerary-expanded .composer small{font-size:10px}
  .itinerary-expanded .day-tabs{padding:6px 10px}
  .itinerary-expanded .day-tabs button{min-height:48px;padding:5px 9px}
  .itinerary-expanded .itinerary-panel .panel-heading,.itinerary-expanded .day-timeline{padding-inline:12px}
  .itinerary-expanded .itinerary-footnote{padding:5px 10px;font-size:9px}
  .project-assistant.itinerary-fullscreen .project-rail{overflow:hidden}
  .project-assistant.itinerary-fullscreen .project-rail>.project-list{min-height:0;flex:1;overflow-x:auto;overflow-y:hidden}
  .project-assistant.itinerary-fullscreen .project-rail .memory-list{display:none}
}
.conflict-link{width:100%;min-height:58px;display:flex;align-items:center;gap:10px;padding:8px;border:1px solid #f2dfc7;border-radius:6px;background:#fffaf3;color:#344b60;text-align:left}
.conflict-link:hover,.conflict-link.selected{border-color:#edb76c;background:#fff4e3}
.conflict-link-icon{width:32px;height:32px;display:grid;place-items:center;flex:none;border-radius:5px;background:#ffedcf;color:#bd6a16}
.conflict-link .project-link-text strong{font-size:13px;color:#71491f}
.conflict-link .project-link-text small{font-size:11px;color:#967657}
.conflict-count{min-width:20px;height:20px;padding:0 5px;display:grid;place-items:center;border-radius:50%;background:#d94e38;color:#fff;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums}
.conflict-view{width:100%;max-width:1600px;min-height:0;flex:1;display:flex;flex-direction:column;margin:0 auto}
.conflict-view-heading{flex:none;display:flex;justify-content:space-between;align-items:center;gap:16px;margin:0 0 14px}
.conflict-view-heading h1{margin:4px 0;color:#173d60;font-size:25px;line-height:1.3}
.conflict-view-heading p{margin:0;color:#70879a;font-size:13px}
.conflict-summary{flex:none;padding:7px 11px;border:1px solid #f0dfca;border-radius:5px;background:#fffaf3;color:#9b5b1c;font-size:12px}
.conflict-workspace{min-height:0;flex:1;display:grid;grid-template-columns:minmax(280px,.72fr) minmax(360px,1.28fr);overflow:hidden;border:1px solid #d2e2ef;border-radius:6px;background:#fff}
.conflict-view-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
.conflict-view-action{min-height:36px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 10px;border:1px solid #d4e5f3;border-radius:6px;background:#fff;color:#176bb3;font-size:12px;white-space:nowrap}
.conflict-view-action:hover{background:#eaf5ff;border-color:#9ecff4}
.conflict-view-action:focus-visible{outline:2px solid #1682dc;outline-offset:2px}
.conflict-thread,.conflict-manager{min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.conflict-thread{border-right:1px solid #dae7f2;background:#f4f9fd}
.conflict-manager{background:#fff}
.conflict-thread .panel-heading,.conflict-manager .panel-heading{justify-content:space-between}
.conflict-thread-list{min-height:0;flex:1;display:flex;flex-direction:column;gap:12px;padding:16px;overflow:auto;overscroll-behavior:contain}
.conflict-message{max-width:620px;padding:13px 14px;border:1px solid #f0d7bd;border-radius:7px;background:#fffaf5;box-shadow:0 2px 8px #183e5608}
.conflict-message.is-resolved{border-color:#dce8e3;background:#f7fbf9}
.conflict-message-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
.conflict-message-meta>span{display:flex;align-items:center;gap:6px;color:#ad5c32;font-size:12px;font-weight:700}
.conflict-message.is-resolved .conflict-message-meta>span{color:#518369}
.conflict-message-meta small{color:#8192a0;font-size:11px}
.conflict-message p{margin:0;color:#405c73;font-size:13px;line-height:1.7}
.conflict-message-link{min-height:34px;display:inline-flex;align-items:center;gap:5px;margin-top:8px;color:#0874c7;font-size:12px;font-weight:600}
.conflict-message-link:hover,.conflict-orders button:hover{color:#00549b}
.conflict-refresh{width:34px;height:34px;display:grid;place-items:center;border:1px solid #d8e6f0;border-radius:5px;background:#fff;color:#2877b2}
.conflict-refresh:hover:not(:disabled){background:#eef7ff;border-color:#a8cde7}
.conflict-refresh:disabled{opacity:.6}
.conflict-detail-summary{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:8px 10px;padding:16px 18px 14px;border-bottom:1px solid #e8eff4}
.conflict-detail-summary>strong{justify-self:end;color:#84929b;font-size:12px}
.conflict-detail-summary p{grid-column:1/-1;margin:0;color:#38566f;font-size:13px;line-height:1.7}
.conflict-severity{width:max-content;padding:4px 7px;border-radius:4px;background:#fff0df;color:#a75c23;font-size:11px;font-weight:700}
.conflict-severity.soft{background:#fff6dd;color:#8a6d1a}
.conflict-orders{min-height:0;flex:1;display:grid;align-content:start;gap:10px;padding:14px 16px;overflow:auto;overscroll-behavior:contain}
.conflict-order-card{display:grid;gap:6px;padding:12px;border:1px solid #e2ebf1;border-radius:5px;background:#fbfdff}
.conflict-order-label{color:#7c8e9b;font-size:11px}
.conflict-order-card>strong{color:#294b67;font-size:14px;line-height:1.45}
.conflict-order-card>small{color:#657f92;font-size:12px;line-height:1.45}
.conflict-orders button{width:max-content;min-height:32px;display:inline-flex;align-items:center;gap:5px;color:#0874c7;font-size:12px;font-weight:600}
.conflict-manager-note{flex:none;margin:0;padding:10px 16px;border-top:1px solid #e8eff4;color:#8293a0;font-size:11px;line-height:1.5}
.conflict-empty{min-height:160px;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;padding:20px;color:#6d8495;text-align:center}
.conflict-empty>svg{color:#6197bf}
.conflict-empty strong{color:#3c5b72;font-size:14px}
.conflict-empty span{max-width:280px;color:#8797a1;font-size:12px;line-height:1.6}
.conflict-empty.conflict-error{color:#b14539}
.conflict-empty.conflict-error>svg{color:#b14539}
.manager-empty{min-height:240px}
.project-assistant.conflict-fullscreen .project-rail{position:fixed;z-index:101;inset:0 auto 0 0;width:260px;height:100dvh;max-height:none;box-shadow:4px 0 20px #173e561a}
.project-assistant.conflict-fullscreen.rail-collapsed .project-rail{width:58px}
.project-assistant.conflict-fullscreen .project-rail{padding-top:3px}
.project-assistant.conflict-fullscreen .rail-heading{min-height:58px;padding:0 5px;box-sizing:border-box}
.conflict-view-expanded{position:fixed;z-index:100;inset:0;width:100%;max-width:none;height:100dvh;padding:20px 24px 20px 284px;background:#f8fbfe}
.conflict-view-expanded.rail-is-collapsed{padding-left:82px}
.chat-heading-actions{display:flex;gap:6px}
.project-grid.project-chat-expanded,.conflict-view.conflict-chat-expanded{position:fixed;z-index:105;inset:0;width:100%;max-width:none;height:100dvh;min-height:0;margin:0;padding:0;display:flex;flex-direction:column;border:0;border-radius:0;background:#f8fbfe}
.project-chat-expanded .chat-panel,.conflict-chat-expanded .conflict-workspace{flex:1;min-height:0;overflow:hidden}
.project-chat-expanded .chat-panel{border:0}
.project-chat-expanded .chat-history,.conflict-chat-expanded .conflict-thread-list{flex:1;min-height:0;max-height:none;overflow:auto}
.project-chat-expanded .itinerary-panel,.conflict-chat-expanded .conflict-view-heading,.conflict-chat-expanded .conflict-manager{display:none}
.conflict-chat-expanded .conflict-workspace{display:flex;border:0;border-radius:0}
.conflict-chat-expanded .conflict-thread{flex:1;border:0}
@media(max-width:1100px){
  .conflict-workspace{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(170px,.8fr) minmax(230px,1.2fr);overflow:hidden}
  .conflict-thread{border-right:0;border-bottom:1px solid #dae7f2}
  .conflict-thread-list,.conflict-orders{overflow:auto}
}
@media(max-width:720px){
  .conflict-view-heading h1{font-size:20px}
  .conflict-view-heading p{font-size:12px}
  .conflict-workspace{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(170px,.8fr) minmax(230px,1.2fr);overflow:visible}
  .conflict-thread{border-right:0;border-bottom:1px solid #dae7f2}
  .conflict-thread-list,.conflict-orders{overflow:visible}
  .conflict-summary{padding:6px 8px;font-size:11px}
  .conflict-manager-note{padding:8px 12px}
  .conflict-view-actions{gap:5px}
  .conflict-view-action{min-height:34px;padding:0 8px;font-size:11px}
  .conflict-view-expanded{inset:0;width:100%;height:100dvh;padding:170px 10px 10px;background:#f8fbfe}
  .conflict-view-expanded.rail-is-collapsed{padding-top:68px}
  .project-assistant.conflict-fullscreen .project-rail,.project-assistant.conflict-fullscreen.rail-collapsed .project-rail{inset:0 0 auto;width:100%;height:160px}
  .project-assistant.conflict-fullscreen.rail-collapsed .project-rail{height:58px}
  .project-assistant.conflict-fullscreen .project-rail{padding-top:10px}
  .project-assistant.conflict-fullscreen .rail-heading{min-height:44px;padding:0 3px}
  .project-assistant.conflict-fullscreen .project-rail{overflow:hidden}
  .project-assistant.conflict-fullscreen .project-rail>.project-list{min-height:0;flex:1;overflow-x:auto;overflow-y:hidden}
  .project-assistant.conflict-fullscreen .project-rail .memory-list{display:none}
  .conflict-view-expanded .conflict-view-heading{margin-bottom:8px}
  .conflict-view-expanded .conflict-workspace{min-height:0;height:calc(100% - 66px);grid-template-rows:minmax(130px,.8fr) minmax(180px,1.2fr);overflow:hidden}
  .conflict-view-expanded .conflict-thread-list,.conflict-view-expanded .conflict-orders{overflow:auto}
  .conflict-view-expanded .conflict-manager-note{padding:8px 12px}
}
.project-grid.itinerary-expanded.project-chat-expanded,
.project-grid.itinerary-expanded.rail-collapsed.project-chat-expanded{inset:0;height:100dvh;transition:none}
</style>
