import { createServer } from 'node:http'
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { addDays, BOOKING_OFFERS, classifyBookingConflicts, createBookingSnapshot, findBookingConflict, findIntentConflict, isIsoDate } from './booking-domain.js'
import { findProduct, listProducts, withOffers } from './product-catalog.js'
import { getTripWeather } from './weather.js'
import { createWeatherChecker, initWeatherAlerts, listWeatherAlerts } from './weather-alerts.js'
import { matchSight } from './sight-matching.js'
import { matchTransport } from './transport-matching.js'
import { matchingPackages, tourismPackages } from '../frontend/src/tourism-packages.js'
import { requestedTripStartDate } from './trip-date-intent.js'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const frontendRoot = join(projectRoot, 'frontend')
const envPath = join(projectRoot, '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match || match[1] in process.env) continue
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
}
const accessPassword = process.env.APP_ACCESS_PASSWORD || ''
const accessAuthDisabled = process.env.APP_AUTH_DISABLED === '1'
if (process.env.NODE_ENV === 'production' && !accessAuthDisabled && accessPassword.length < 16) {
  throw new Error('Production requires APP_ACCESS_PASSWORD with at least 16 characters')
}
const staticRoot = existsSync(join(projectRoot, 'dist'))
  ? join(projectRoot, 'dist')
  : frontendRoot
const productCatalogPath = join(projectRoot, 'backend', 'demo-products.json')
const demoProducts = existsSync(productCatalogPath)
  ? JSON.parse(readFileSync(productCatalogPath, 'utf8')).products
  : []
const dbDir = join(projectRoot, 'data')
if (!process.env.TRIP_DB_PATH && !existsSync(dbDir)) mkdirSync(dbDir)
const dbPath = process.env.TRIP_DB_PATH ? resolve(process.env.TRIP_DB_PATH) : join(dbDir, 'demo.sqlite')
const db = new DatabaseSync(dbPath)
db.exec(`
  CREATE TABLE IF NOT EXISTS demo_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    confirmed INTEGER NOT NULL DEFAULT 0,
    processed INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );
  INSERT OR IGNORE INTO demo_state (id, confirmed, processed, updated_at)
  VALUES (1, 0, 0, datetime('now'));
  CREATE TABLE IF NOT EXISTS travel_projects (
    id TEXT PRIMARY KEY,
    destination TEXT NOT NULL,
    days INTEGER NOT NULL,
    preferences_json TEXT NOT NULL DEFAULT '[]',
    requirements TEXT NOT NULL DEFAULT '',
    trip_start_date TEXT,
    departure_city TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'planning',
    itinerary_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES travel_projects(id) ON DELETE CASCADE,
    trigger_type TEXT NOT NULL,
    request_summary TEXT NOT NULL,
    status TEXT NOT NULL,
    response_summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS trip_events (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES travel_projects(id) ON DELETE CASCADE,
    run_id TEXT,
    title TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
  );
  CREATE TABLE IF NOT EXISTS assistant_alerts (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES travel_projects(id) ON DELETE CASCADE,
    run_id TEXT NOT NULL UNIQUE REFERENCES agent_runs(id) ON DELETE CASCADE,
    code TEXT NOT NULL DEFAULT 'assistant_reply',
    severity TEXT NOT NULL DEFAULT 'info',
    title TEXT NOT NULL,
    details TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS travel_memories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT 'user1234',
    memory_key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, memory_key, value)
  );
  CREATE TABLE IF NOT EXISTS memory_prompts (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES travel_projects(id) ON DELETE CASCADE,
    memory_key TEXT NOT NULL,
    value TEXT NOT NULL,
    question TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT,
    UNIQUE(project_id, memory_key, value)
  );
  CREATE TABLE IF NOT EXISTS test_bookings (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES travel_projects(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS customer_bookings (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES travel_projects(id) ON DELETE SET NULL,
    product_id TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS booking_alerts (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    other_order_id TEXT,
    project_id TEXT,
    code TEXT NOT NULL,
    severity TEXT NOT NULL,
    details TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
  );
  CREATE TABLE IF NOT EXISTS saved_plans (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES travel_projects(id) ON DELETE SET NULL,
    item_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS saved_travellers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    identity_number TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS saved_traveller_seeds (
    id TEXT PRIMARY KEY
  );
`)
initWeatherAlerts(db)
db.exec('BEGIN IMMEDIATE')
try {
  if (!db.prepare("SELECT id FROM saved_traveller_seeds WHERE id = 'demo-v1'").get()) {
    const insert = db.prepare('INSERT OR IGNORE INTO saved_travellers (id, name, identity_number) VALUES (?, ?, ?)')
    for (const [name, identityNumber] of [['ljc', '12345678'], ['mjk', '234567'], ['wyj', '4567890']]) {
      insert.run(randomUUID(), name, identityNumber)
    }
    db.prepare("INSERT INTO saved_traveller_seeds (id) VALUES ('demo-v1')").run()
  }
  db.exec('COMMIT')
} catch (error) {
  db.exec('ROLLBACK')
  throw error
}
if (!db.prepare('PRAGMA table_info(travel_projects)').all().some(column => column.name === 'trip_start_date')) {
  db.exec('ALTER TABLE travel_projects ADD COLUMN trip_start_date TEXT')
}
if (!db.prepare('PRAGMA table_info(travel_projects)').all().some(column => column.name === 'departure_city')) {
  db.exec("ALTER TABLE travel_projects ADD COLUMN departure_city TEXT NOT NULL DEFAULT ''")
}
if (!db.prepare('PRAGMA table_info(trip_events)').all().some(column => column.name === 'read_at')) {
  db.exec('ALTER TABLE trip_events ADD COLUMN read_at TEXT')
}
function state() {
  return db.prepare('SELECT confirmed, processed FROM demo_state WHERE id = 1').get()
}

function decodeJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback } catch { return fallback }
}

function projectView(id) {
  const project = db.prepare('SELECT * FROM travel_projects WHERE id = ?').get(id)
  if (!project) return null
  const itinerary = decodeJson(project.itinerary_json, null)
  return {
    id: project.id,
    destination: project.destination,
    departureCity: project.departure_city || identifyDepartureCity(project.requirements, project.destination),
    days: project.days,
    preferences: decodeJson(project.preferences_json, []),
    requirements: project.requirements,
    tripStartDate: project.trip_start_date || '',
    status: project.status,
    itinerary: itinerary
      ? enrichItinerary(itinerary, project.destination)
      : null,
    packages: matchingPackages(project.destination, project.days,
      project.departure_city || itinerary?.departureCity || identifyDepartureCity(project.requirements, project.destination),
      project.trip_start_date || ''),
    savedPlans: db.prepare('SELECT * FROM saved_plans WHERE project_id = ? ORDER BY rowid').all(id).map(savedPlan),
    bookings: listProjectBookings(id),
    createdAt: project.created_at,
    updatedAt: project.updated_at,
    runs: db.prepare(`
      SELECT id, trigger_type AS triggerType, request_summary AS requestSummary,
        status, response_summary AS responseSummary, created_at AS createdAt
      FROM agent_runs WHERE project_id = ?
      ORDER BY created_at DESC, rowid DESC LIMIT 30
    `).all(id),
    events: [...db.prepare(`
      SELECT id, run_id AS runId, title, details, status, read_at AS readAt, created_at AS createdAt
      FROM trip_events WHERE project_id = ?
      ORDER BY created_at DESC, rowid DESC
    `).all(id), ...listAlerts().filter(alert => alert.projectId === id)]
      .sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1)
        || b.createdAt.localeCompare(a.createdAt)),
    memoryPrompts: db.prepare(`
      SELECT id, memory_key AS memoryKey, value, question
      FROM memory_prompts WHERE project_id = ? AND status = 'pending'
      ORDER BY created_at DESC, rowid DESC
    `).all(id),
  }
}

function savedPlan(row) {
  return { ...decodeJson(row.item_json, {}), id: row.id, projectId: row.project_id || null }
}

function listBookingAlerts() {
  return db.prepare(`
    SELECT a.id, a.order_id AS orderId, a.other_order_id AS otherOrderId,
      a.project_id AS projectId, a.code, a.severity, a.details, a.status,
      a.read_at AS readAt, a.created_at AS createdAt, a.resolved_at AS resolvedAt,
      b.snapshot_json AS snapshotJson, p.destination AS projectDestination
    FROM booking_alerts a
    LEFT JOIN customer_bookings b ON b.id = a.order_id
    LEFT JOIN travel_projects p ON p.id = a.project_id
    ORDER BY CASE WHEN a.status = 'pending' THEN 0 ELSE 1 END, a.created_at DESC, a.rowid DESC
  `).all().map(({ snapshotJson, ...row }) => ({
    ...row,
    title: row.severity === 'hard' ? '订单时间冲突' : '行程需要留意',
    orderTitle: decodeJson(snapshotJson, {}).title || '',
    projectDestination: row.projectDestination || '',
  }))
}

function listAssistantAlerts() {
  return db.prepare(`
    SELECT a.id, NULL AS orderId, a.project_id AS projectId, a.code, a.severity,
      a.title, a.details, a.status, a.read_at AS readAt, a.created_at AS createdAt,
      p.destination AS projectDestination
    FROM assistant_alerts a
    LEFT JOIN travel_projects p ON p.id = a.project_id
    ORDER BY CASE WHEN a.status = 'pending' THEN 0 ELSE 1 END, a.created_at DESC, a.rowid DESC
  `).all().map(row => ({ ...row, orderTitle: '', projectDestination: row.projectDestination || '' }))
}

function listAlerts() {
  return [...listBookingAlerts(), ...listWeatherAlerts(db), ...listAssistantAlerts()]
    .sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1)
      || b.createdAt.localeCompare(a.createdAt))
}

function listProjectBookings(projectId) {
  return [
    ...db.prepare('SELECT id, snapshot_json AS snapshotJson, created_at AS createdAt FROM test_bookings WHERE project_id = ?')
      .all(projectId),
    ...db.prepare("SELECT id, snapshot_json AS snapshotJson, created_at AS createdAt FROM customer_bookings WHERE project_id = ? AND status = 'confirmed'")
      .all(projectId),
  ]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(row => ({ id: row.id, ...decodeJson(row.snapshotJson, {}) }))
}

function listCustomerBookings() {
  return db.prepare(`
    SELECT b.id, b.project_id AS projectId, b.product_id AS productId,
      b.snapshot_json AS snapshotJson, b.status, b.created_at AS createdAt,
      p.destination AS projectDestination
    FROM customer_bookings b LEFT JOIN travel_projects p ON p.id = b.project_id
    ORDER BY b.created_at DESC, b.rowid DESC
  `).all().map(row => ({
    ...decodeJson(row.snapshotJson, {}),
    id: row.id,
    projectId: row.projectId,
    status: row.status,
    createdAt: row.createdAt,
    projectDestination: row.projectDestination || '',
  }))
}

function savedTravellersForOrder(ids, expectedCount) {
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !id)
    || new Set(ids).size !== ids.length || ids.length !== expectedCount) {
    return { error: `请选择 ${expectedCount} 位不同的出行人`, status: 400 }
  }
  const travellers = ids.map(id => db.prepare(`
    SELECT id, name, identity_number AS identityNumber
    FROM saved_travellers WHERE id = ?
  `).get(id))
  if (travellers.some(traveller => !traveller)) return { error: '所选出行人不存在', status: 404 }
  return { travellers }
}

function bookingConflicts(booking, project) {
  const context = project && {
    destination: project.destination, days: project.days, tripStartDate: project.trip_start_date || '',
  }
  return classifyBookingConflicts(
    booking,
    listCustomerBookings().filter(order => order.status === 'confirmed' && order.id !== booking.id),
    context,
  )
}

function reconcileBookingAlerts(orderId, createNew = true) {
  const orders = listCustomerBookings()
  const order = orders.find(item => item.id === orderId)
  const project = order?.projectId ? db.prepare('SELECT * FROM travel_projects WHERE id = ?').get(order.projectId) : null
  const conflicts = order?.status === 'confirmed' ? bookingConflicts(order, project) : []
  const existing = db.prepare("SELECT * FROM booking_alerts WHERE order_id = ? AND status = 'pending'").all(orderId)
  const detailsFor = conflict => {
    const other = orders.find(item => item.id === conflict.otherOrderId)
    return other
      ? `${conflict.message}${other.projectDestination ? `（关联${other.projectDestination}行程）` : '（未关联行程）'}。`
      : `${conflict.message}。`
  }
  for (const alert of existing) {
    const match = conflicts.find(item => item.code === alert.code && (item.otherOrderId || null) === alert.other_order_id)
    if (match) {
      db.prepare('UPDATE booking_alerts SET project_id = ?, details = ?, severity = ? WHERE id = ?')
        .run(order.projectId, detailsFor(match), match.severity, alert.id)
    } else {
      db.prepare("UPDATE booking_alerts SET status = 'resolved', read_at = COALESCE(read_at, datetime('now')), resolved_at = datetime('now') WHERE id = ?")
        .run(alert.id)
    }
  }
  if (createNew && order) {
    for (const conflict of conflicts) {
      if (existing.some(item => item.code === conflict.code && item.other_order_id === (conflict.otherOrderId || null))) continue
      if (conflict.otherOrderId && db.prepare(`
        SELECT id FROM booking_alerts WHERE order_id = ? AND other_order_id = ? AND code = ? AND status = 'pending'
      `).get(conflict.otherOrderId, orderId, conflict.code)) continue
      db.prepare(`
        INSERT INTO booking_alerts (id, order_id, other_order_id, project_id, code, severity, details)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), orderId, conflict.otherOrderId || null, order.projectId, conflict.code, conflict.severity, detailsFor(conflict))
    }
  }
  return conflicts
}

// The caller owns the transaction so compound order flows can reuse these rules atomically.
function saveCustomerBooking(product, booking, projectId) {
  const project = projectId ? db.prepare('SELECT * FROM travel_projects WHERE id = ?').get(projectId) : null
  const projectContext = project && { destination: project.destination, days: project.days, tripStartDate: project.trip_start_date || '' }
  booking.id = randomUUID()
  booking.orderCode = `TR${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`
  booking.createdAt = new Date().toISOString()
  booking.bookingType = 'customer'
  db.prepare('INSERT INTO customer_bookings (id, project_id, product_id, snapshot_json) VALUES (?, ?, ?, ?)')
    .run(booking.id, project?.id || null, product.id, JSON.stringify(booking))
  const conflicts = reconcileBookingAlerts(booking.id)
  const conflict = conflicts.length > 0
  if (project && !conflict) {
    const startDate = project.trip_start_date || (booking.type === 'hotel' ? booking.checkIn
      : booking.direction === 'in' ? addDays(booking.travelDate, -(project.days - 1)) : booking.travelDate)
    db.prepare("UPDATE travel_projects SET trip_start_date = ?, itinerary_json = ?, status = 'active', updated_at = datetime('now') WHERE id = ?")
      .run(startDate, JSON.stringify(enrichItinerary(itineraryWithBooking(decodeJson(project.itinerary_json, null), {
        ...projectContext, tripStartDate: startDate,
      }, booking), project.destination)), project.id)
  }
  return { id: booking.id, conflict: Boolean(conflict) }
}

function recordAssistantRun(projectId, triggerType, requestSummary, message) {
  const runId = randomUUID()
  db.prepare(`
    INSERT INTO agent_runs (id, project_id, trigger_type, request_summary, status, response_summary)
    VALUES (?, ?, ?, ?, 'completed', ?)
  `).run(runId, projectId, triggerType, requestSummary.slice(0, 500), message.slice(0, 1000))
  return runId
}

function recordAssistantAlert(projectId, runId, message) {
  db.prepare(`
    INSERT OR IGNORE INTO assistant_alerts
      (id, project_id, run_id, title, details)
    VALUES (?, ?, ?, '小程已回复', ?)
  `).run(randomUUID(), projectId, runId, message.slice(0, 500))
}

function recordConflictMessage(projectId, triggerType, requestSummary, message) {
  const runId = recordAssistantRun(projectId, triggerType, requestSummary, message)
  const eventId = randomUUID()
  db.prepare(`
    INSERT INTO trip_events (id, project_id, run_id, title, details)
    VALUES (?, ?, ?, '行程安排存在冲突', ?)
  `).run(eventId, projectId, runId, message.slice(0, 500))
  return runId
}

function itineraryWithBooking(source, project, booking) {
  const startDate = project.tripStartDate || (
    booking.type === 'hotel' ? booking.checkIn
      : booking.direction === 'in' ? addDays(booking.travelDate, -(project.days - 1))
        : booking.travelDate
  )
  const itinerary = source || {
    summary: `${project.destination}${project.days}日行程`,
    assistantMessage: '',
    days: Array.from({ length: project.days }, (_, index) => ({
      day: index + 1,
      title: `第 ${index + 1} 天`,
      items: [],
    })),
  }
  const days = itinerary.days.map((day, index) => ({ ...day, date: addDays(startDate, index), items: [...day.items] }))
  const addBookedItem = (date, item) => {
    const day = days.find(entry => entry.date === date)
    if (!day) return false
    const leg = item.travelLeg
    if (leg) day.items = day.items.filter(existing => !(existing.travelLeg === leg && !existing.bookingId))
    if (item.type === 'stay') day.items = day.items.filter(existing => !(existing.type === 'stay' && !existing.bookingId))
    day.items.push(item)
    return true
  }

  if (booking.type === 'hotel') {
    for (let date = booking.checkIn; date < booking.checkOut; date = addDays(date, 1)) {
      addBookedItem(date, {
        id: `${booking.id}-${date}`,
        time: '住宿',
        type: 'stay',
        title: booking.title,
        description: `${booking.checkIn} 入住 · ${booking.checkOut} 退房`,
        bookingId: booking.id,
      bookingType: booking.bookingType || 'test',
      })
    }
  } else {
    const isArrival = booking.direction !== 'in'
    addBookedItem(booking.travelDate, {
      id: booking.id,
      time: booking.departTime,
      type: 'transport',
      travelLeg: isArrival ? 'arrival' : 'departure',
      title: booking.title,
      description: `${booking.origin} ${booking.departTime} 出发 · ${booking.arrivalCity} ${booking.arriveTime} 到达${booking.bookingType === 'customer' ? '' : ' · 测试订单'}`,
      bookingId: booking.id,
      bookingType: booking.bookingType || 'test',
    })
  }
  return { ...itinerary, days }
}

function listProjects() {
  return db.prepare(`
    SELECT p.id, p.destination, p.days, p.status, p.created_at AS createdAt,
      p.updated_at AS updatedAt, SUM(CASE WHEN e.status = 'pending' AND e.read_at IS NULL THEN 1 ELSE 0 END)
        + (SELECT COUNT(*) FROM booking_alerts a WHERE a.project_id = p.id AND a.severity = 'hard' AND a.status = 'pending' AND a.read_at IS NULL) AS pendingEvents,
      SUM(CASE WHEN e.status = 'pending' AND e.read_at IS NULL THEN 1 ELSE 0 END)
        + (SELECT COUNT(*) FROM booking_alerts a WHERE a.project_id = p.id AND a.status = 'pending' AND a.read_at IS NULL)
        + (SELECT COUNT(*) FROM weather_alerts w WHERE w.project_id = p.id AND w.status = 'pending' AND w.read_at IS NULL)
        + (SELECT COUNT(*) FROM assistant_alerts a WHERE a.project_id = p.id AND a.status = 'pending' AND a.read_at IS NULL) AS pendingAssistantEvents,
      (SELECT id FROM trip_events WHERE project_id = p.id AND status = 'pending' AND read_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 1) AS latestAlertId,
      (SELECT details FROM trip_events WHERE project_id = p.id AND status = 'pending' AND read_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 1) AS latestAlertDetails
    FROM travel_projects p
    LEFT JOIN trip_events e ON e.project_id = p.id
    GROUP BY p.id
    ORDER BY p.updated_at DESC, p.rowid DESC
  `).all()
}

function listMemories() {
  return db.prepare(`
    SELECT id, memory_key AS key, value, updated_at AS updatedAt
    FROM travel_memories WHERE user_id = 'user1234'
    ORDER BY updated_at DESC, rowid DESC
  `).all()
}

function identifyDepartureCity(text, destination) {
  const cities = [...new Set(demoProducts
    .filter(product => product.type === 'flight' && product.destination === destination)
    .map(product => product.origin)
    .filter(Boolean))]
  return cities.find(city => new RegExp(`(?:从|由|出发地(?:是|为|[：:]?))\\s*${city}(?:出发|前往|来|到)?`).test(text)) || ''
}

function ensureTravelBasics(itinerary, destination) {
  const days = itinerary.days.map(day => ({ ...day, items: [...day.items] }))
  const firstDay = days[0]
  const lastDay = days.at(-1)
  lastDay.items = lastDay.items.filter(item => item.type !== 'stay')
  const arrival = firstDay.items.find(item => item.travelLeg === 'arrival')
    || firstDay.items.find(item => item.type === 'transport' && /抵达|到达|落地|进城/.test(`${item.title} ${item.description}`))
  const departure = lastDay.items.find(item => item.travelLeg === 'departure')
    || lastDay.items.find(item => item.type === 'transport' && /返程|返航|离开|回程|返城/.test(`${item.title} ${item.description}`))

  if (arrival) {
    Object.assign(arrival, { id: arrival.id || `arrival-${firstDay.day}`, type: 'transport', travelLeg: 'arrival' })
  } else {
    firstDay.items.unshift({
      id: `arrival-${firstDay.day}`,
      time: '抵达时段',
      type: 'transport',
      travelLeg: 'arrival',
      title: `乘飞机抵达${destination}`,
      description: '抵达后前往酒店办理入住，具体航班可根据出发城市补充。',
    })
  }

  if (departure) {
    Object.assign(departure, { id: departure.id || `departure-${lastDay.day}`, type: 'transport', travelLeg: 'departure' })
  } else {
    lastDay.items.push({
      id: `departure-${lastDay.day}`,
      time: '返程时段',
      type: 'transport',
      travelLeg: 'departure',
      title: `乘飞机离开${destination}`,
      description: '返程航班需结合出发城市和实际行程时间选择。',
    })
  }

  for (const day of days.slice(0, -1)) {
    const stay = day.items.find(item => item.type === 'stay')
    if (stay) {
      stay.lodgingNight = true
      continue
    }
    day.items.push({
      id: `stay-${day.day}`,
      time: '晚上',
      type: 'stay',
      lodgingNight: true,
      title: `入住${destination}酒店`,
      description: '当晚住宿参考选项见下方，可根据位置和偏好选择。',
    })
  }

  return { ...itinerary, days }
}

function resourcesForItem(item, destination, day, departureCity, date, purchaseRequested) {
  if (item.type === 'transport') {
    const products = isIsoDate(date)
      ? demoProducts.filter(product => ['flight', 'train'].includes(product.type)).map(product => ({ ...product, travelDate: date }))
      : demoProducts
    const matches = matchTransport(products, item, { destination, departureCity, date, purchaseRequested })
    return isIsoDate(date)
      ? matches.map(product => findProduct(demoProducts, `${product.type}-on-${date}--${product.id}`)).filter(Boolean)
      : matches
  }

  const type = item.type === 'stay' ? ['hotel']
      : item.type === 'attraction' ? ['sight']
        : []
  if (!type.length) return []
  const matches = demoProducts.filter(product => product.destination === destination && type.includes(product.type))
  if (item.type === 'attraction') return matchSight(matches, item)
  const count = 1
  const start = (day - 1) % Math.max(matches.length, 1)
  return matches.slice(start, start + count).length
    ? matches.slice(start, start + count)
    : matches.slice(0, count)
}

function enrichItinerary(source, destination) {
  const itinerary = ensureTravelBasics(source, destination)
  return {
    ...itinerary,
    days: itinerary.days.map(day => ({
      ...day,
      items: day.items.map(item => ({
        ...item,
        id: item.id || `legacy-${destination}-${day.day}-${item.title}`,
        resources: resourcesForItem(item, destination, day.day, itinerary.departureCity, day.date, itinerary.transportPurchaseRequested),
      })),
    })),
  }
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function readJson(req, limit = 16_000) {
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (body.length > limit) throw new Error('请求内容过长')
  }
  return JSON.parse(body || '{}')
}

async function createItinerary(payload) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('服务端尚未配置 DeepSeek API 密钥')

  const prompt = [
    '为用户规划一份完整、自然、有温度的旅行灵感草案或调整方案。只输出 JSON，不要 Markdown。',
    '格式：{"summary":"简短概述","assistantMessage":"对用户的完整回复，说明规划思路、行程亮点和需用户留意之处，不超过500字","days":[{"title":"当天主题","items":[{"time":"上午","type":"transport|stay|attraction|meal|other","title":"安排名称","description":"简短说明"}]}]}',
    `必须恰好输出 ${payload.days} 天，每天 2 到 4 项。`,
    '每个安排标明 type；交通用 transport，住宿用 stay，景点用 attraction，美食用 meal，其余用 other。不要假设用户未提供的出发城市。',
    '不要生成商品、价格、库存、订单或预订链接；商品资源会由应用从本地演示数据中匹配。不要声称信息实时核实。',
    '内容是未确认的灵感建议，交通时间、开放时间和预约要求可能变化。',
    `目的地：${payload.destination}`,
    `出发地：${payload.departureCity || '未指定'}`,
    `出行开始日期：${payload.tripStartDate || '未指定'}`,
    payload.weather?.available
      ? `以下是目的地天气预报（可能变化），只能用于覆盖日期，其他日期不得推断天气；按日期安排未预订的户外活动并提示用户，订单仍须保持不变：${JSON.stringify(payload.weather)}`
      : '没有可用的可信天气预报，不得猜测具体天气；提醒用户出行时关注天气。',
    `偏好：${payload.preferences.join('、') || '未指定'}`,
    `补充要求：${payload.requirements || '无'}`,
    `已确认的长期旅行偏好：${listMemories().map(memory => `${memory.key}：${memory.value}`).join('；') || '暂无'}。当前项目明确要求优先于长期偏好。`,
    `当前已确认订单（只读事实，反映本地订单当前状态）：${JSON.stringify((payload.bookings || []).map(({ travellers, ...booking }) => booking))}`,
    payload.completedDemoOrderChanges?.length
      ? `以下改动已在本地演示订单中完成，不代表供应商真实办理：${JSON.stringify(payload.completedDemoOrderChanges)}。回复中简洁告知用户，并围绕更新后的订单安排，不要再次声称订单只读或要求确认。`
      : '订单为只读事实；不得办理、创建、修改、改签或取消任何订单。',
    `用户明确关联本行程的未预订计划（并非订单，不得称为已预订）：${JSON.stringify(payload.plans || [])}`,
    `可参考的本地旅行组合（仅可引用提供的选项，不要编造价格、库存、链接或声称已预订；如为空则不推荐套餐）：${JSON.stringify(payload.packages || [])}`,
    payload.baseItinerary ? `当前行程草案：${JSON.stringify(payload.baseItinerary)}` : '',
    payload.requestText ? `本次任务：${payload.requestText}` : '',
  ].join('\n')

  const requestBody = {
      model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
      messages: [
        { role: 'system', content: payload.completedDemoOrderChanges?.length
          ? '你是旅行行程构思助手。仅可如实说明系统已经完成的本地演示订单改签，并规划行程；不得声称真实供应商办理或涉及真实支付。严格遵循输出格式和数据边界。'
          : '你是旅行行程构思助手。订单是只读事实；你只能规划或调整行程，不能办理、创建、修改、改签或取消任何订单。严格遵循输出格式和数据边界。' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: Math.min(8000, 1400 + payload.days * 700),
  }
  let itinerary
  let failure = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    let response
    try {
      response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(attempt ? {
          ...requestBody,
          messages: [...requestBody.messages, { role: 'user', content: failure === 'length'
            ? '上次输出被截断。请精简文字，每天只写 2 项，仍需输出全部天数及完整 JSON。'
            : failure === 'shape'
              ? `上次结果缺少完整行程。请严格输出恰好 ${payload.days} 天，每天至少一个带 title 的 items，保持 JSON 完整。`
              : '上次输出的 JSON 语法无效。请重新生成完整 JSON，字符串中的双引号必须转义，避免在字符串内使用双引号；精简文字，每天 2 项。' }],
          temperature: 0.2,
          max_tokens: 8000,
        } : requestBody),
        signal: AbortSignal.timeout(60_000),
      })
    } catch {
      throw new Error('行程服务连接失败，请稍后重试')
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('DeepSeek API 密钥无效或无权调用，请检查服务端配置')
      }
      if (response.status === 429) throw new Error('DeepSeek 当前请求较多，请稍后重试')
      throw new Error(`DeepSeek 请求失败（HTTP ${response.status}）`)
    }
    try {
      const data = await response.json()
      const choice = data.choices?.[0]
      failure = choice?.finish_reason === 'length' ? 'length' : 'json'
      if (failure === 'length' || typeof choice?.message?.content !== 'string') throw new Error()
      const candidate = JSON.parse(choice.message.content)
      failure = 'shape'
      if (!candidate || typeof candidate !== 'object' || !Array.isArray(candidate.days)
        || candidate.days.length !== payload.days
        || candidate.days.some(day => !day || typeof day !== 'object'
          || !Array.isArray(day.items) || !day.items.slice(0, 4).some(item => item && typeof item === 'object' && typeof item.title === 'string' && item.title.trim()))) {
        throw new Error()
      }
      itinerary = candidate
      break
    } catch {
      console.warn(`[itinerary] model response rejected: ${failure || 'json'}, attempt ${attempt + 1}`)
      if (attempt === 2) throw new Error('行程生成结果不完整，请稍后重试；原有行程未改变。')
    }
  }
  itinerary.days = itinerary.days.map((day, index) => {
    const items = Array.isArray(day.items) ? day.items.slice(0, 4).filter(item => item && typeof item === 'object').map(item => ({
      id: randomUUID(),
      time: String(item.time || '').slice(0, 24),
      type: ['transport', 'stay', 'attraction', 'meal', 'other'].includes(item.type) ? item.type : 'other',
      title: String(item.title || '').slice(0, 100),
      description: String(item.description || '').slice(0, 240),
    })).filter(item => item.title) : []
    if (items.length < 1) throw new Error(`第 ${index + 1} 天缺少有效安排，请重试`)
    return {
      day: index + 1,
      title: String(day.title || `第 ${index + 1} 天`).slice(0, 80),
      items,
    }
  })
  return {
    summary: String(itinerary.summary || '').slice(0, 400),
    assistantMessage: String(itinerary.assistantMessage || itinerary.summary || '').slice(0, 1000),
    days: itinerary.days,
  }
}

async function runAgent(projectId, triggerType, requestText, baseItinerary = null, completedDemoOrderChanges = []) {
  const project = db.prepare('SELECT * FROM travel_projects WHERE id = ?').get(projectId)
  if (!project) throw new Error('旅行项目不存在')
  const runId = randomUUID()
  db.prepare(`
    INSERT INTO agent_runs (id, project_id, trigger_type, request_summary, status)
    VALUES (?, ?, ?, ?, 'running')
  `).run(runId, projectId, triggerType, requestText.slice(0, 500))
  try {
    const context = `${project.requirements}\n${requestText}`
    const tripStartDate = requestedTripStartDate(requestText, project.trip_start_date) || project.trip_start_date || ''
    const departureCity = project.departure_city || identifyDepartureCity(context, project.destination)
      || baseItinerary?.departureCity || ''
    const packages = matchingPackages(project.destination, project.days, departureCity, tripStartDate)
    const itinerary = await createItinerary({
      destination: project.destination,
      departureCity,
      days: project.days,
      preferences: decodeJson(project.preferences_json, []),
      requirements: project.requirements,
      tripStartDate,
      weather: await getTripWeather({ destination: project.destination, tripStartDate, days: project.days }),
      bookings: listProjectBookings(projectId),
      plans: db.prepare('SELECT * FROM saved_plans WHERE project_id = ? ORDER BY rowid').all(projectId).map(savedPlan),
      packages,
      requestText,
      baseItinerary,
      completedDemoOrderChanges,
    })
    itinerary.departureCity = departureCity || itinerary.departureCity || ''
    itinerary.transportPurchaseRequested = /(?:买|购买|预订|订购|订|查找|查询).{0,12}(?:机票|火车票|高铁票|动车票|车票)/.test(`${project.requirements}\n${requestText}`)
    if (tripStartDate) {
      itinerary.days = itinerary.days.map((day, index) => ({ ...day, date: addDays(tripStartDate, index) }))
    }
    if (completedDemoOrderChanges.length) {
      itinerary.assistantMessage += `\n已在本地演示订单中调整：${completedDemoOrderChanges.map(change => `${change.title}（${change.date}）`).join('；')}。`
    }
    let mergedItinerary = itinerary
    for (const booking of listProjectBookings(projectId)) {
      const projectWithDate = {
        destination: project.destination,
        days: project.days,
        tripStartDate,
      }
      mergedItinerary = itineraryWithBooking(mergedItinerary, projectWithDate, booking)
    }
    const enrichedItinerary = enrichItinerary(mergedItinerary, project.destination)
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(`
        UPDATE travel_projects
        SET itinerary_json = ?, trip_start_date = ?, status = 'active', updated_at = datetime('now')
        WHERE id = ?
      `).run(JSON.stringify(enrichedItinerary), tripStartDate || null, projectId)
      if (tripStartDate !== (project.trip_start_date || '')) {
        db.prepare('DELETE FROM weather_checks WHERE project_id = ?').run(projectId)
        db.prepare(`UPDATE weather_alerts SET status = 'resolved',
          read_at = COALESCE(read_at, datetime('now')), resolved_at = datetime('now')
          WHERE project_id = ? AND status = 'pending'
          AND (forecast_date < ? OR forecast_date > date(?, '+' || (? - 1) || ' days'))`)
          .run(projectId, tripStartDate, tripStartDate, project.days)
      }
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    db.prepare(`
      UPDATE agent_runs SET status = 'completed', response_summary = ?
      WHERE id = ?
    `).run(itinerary.assistantMessage || itinerary.summary, runId)
    recordAssistantAlert(projectId, runId, itinerary.assistantMessage || itinerary.summary)
    if (triggerType === 'planning') {
      const lodgingPreference = decodeJson(project.preferences_json, [])
        .find(value => value.startsWith('住宿偏好：'))
      if (lodgingPreference) {
        const value = lodgingPreference.slice('住宿偏好：'.length)
        const question = value === '靠近地铁'
          ? '您是喜欢住在离地铁近的酒店吗？需要把它记为您的长期偏好吗？'
          : `您偏好“${value}”的住宿，需要把它记为您的长期偏好吗？`
        db.prepare(`
          INSERT OR IGNORE INTO memory_prompts (id, project_id, memory_key, value, question)
          VALUES (?, ?, '住宿偏好', ?, ?)
        `).run(randomUUID(), projectId, value, question)
      }
    }
    db.prepare("UPDATE travel_projects SET updated_at = datetime('now') WHERE id = ?").run(projectId)
    return { runId, itinerary: enrichedItinerary }
  } catch (error) {
    db.prepare("UPDATE agent_runs SET status = 'failed', response_summary = ? WHERE id = ?")
      .run(error.message.slice(0, 300), runId)
    throw error
  }
}

function extendDemoTripReturnByOneDay(projectId) {
  const project = db.prepare('SELECT * FROM travel_projects WHERE id = ?').get(projectId)
  if (!isIsoDate(project.trip_start_date) || project.days >= 14) throw new Error('请先确认行程日期，行程最多支持 14 天')
  const projectOrders = listCustomerBookings().filter(order => order.projectId === projectId && order.status === 'confirmed')
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
  const returnOrders = projectOrders.filter(order =>
    order.type !== 'hotel' && order.direction === 'in' && order.travelDate === addDays(project.trip_start_date, project.days - 1) && order.travelDate > today)
  if (returnOrders.length !== 1) throw new Error('请先确认当前行程中唯一的返程订单')
  const returnOrder = returnOrders[0]

  const returnDate = addDays(returnOrder.travelDate, 1)
  const changes = [{
    orderId: returnOrder.id,
    productId: `${returnOrder.type}-on-${returnDate}--${returnOrder.productId.replace(/^(flight|train)-on-\d{4}-\d{2}-\d{2}--/, '')}`,
    input: { travelDate: returnDate },
  }]
  for (const order of projectOrders.filter(item =>
    item.type === 'hotel' && item.checkOut === returnOrder.travelDate
    && item.travellers?.some(person => returnOrder.travellers?.some(traveller => traveller.id === person.id)))) {
    changes.push({
      orderId: order.id,
      productId: `hotel-stay-${order.checkIn}-${addDays(order.checkOut, 1)}--${order.productId.replace(/^hotel-stay-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}--/, '')}`,
      input: { checkIn: order.checkIn, checkOut: addDays(order.checkOut, 1) },
    })
  }

  const prepared = changes.map(change => {
    const row = db.prepare('SELECT * FROM customer_bookings WHERE id = ? AND project_id = ? AND status = ?')
      .get(change.orderId, projectId, 'confirmed')
    if (!row) throw new Error('关联订单状态已变化，请刷新后重试')
    const original = decodeJson(row.snapshot_json, {})
    const product = findProduct(demoProducts, change.productId)
    if (!product) throw new Error('找不到改签所需的演示商品')
    const booking = {
      ...createBookingSnapshot(product, {
        ...original,
        ...change.input,
        offerId: original.offerId,
        rooms: original.rooms,
        guests: original.guests,
        passengers: original.passengers,
      }),
      id: original.id,
      orderCode: original.orderCode,
      createdAt: original.createdAt,
      bookingType: original.bookingType,
      ...(original.travellers ? { travellers: original.travellers } : {}),
    }
    return { row, booking, product }
  })

  db.exec('BEGIN IMMEDIATE')
  try {
    for (const { row, booking, product } of prepared) {
      db.prepare('UPDATE customer_bookings SET product_id = ?, snapshot_json = ? WHERE id = ?')
        .run(product.id, JSON.stringify(booking), row.id)
    }
    const source = decodeJson(project.itinerary_json, null)
    if (!source?.days?.length) throw new Error('请先生成行程后再改期')
    const changedIds = new Set(prepared.map(({ row }) => row.id))
    let fallback = {
      ...source,
      days: [
        ...source.days.map(day => ({ ...day, items: day.items.filter(item => !changedIds.has(item.bookingId)) })),
        { day: project.days + 1, title: '新增一天', items: [{ id: randomUUID(), time: '全天', type: 'other', title: '自由活动', description: '可在对话中继续调整安排' }] },
      ],
    }
    for (const { booking } of prepared) {
      fallback = itineraryWithBooking(fallback, { destination: project.destination, days: project.days + 1, tripStartDate: project.trip_start_date }, booking)
    }
    db.prepare("UPDATE travel_projects SET days = days + 1, itinerary_json = ?, updated_at = datetime('now') WHERE id = ?")
      .run(JSON.stringify(fallback), projectId)
    db.prepare('DELETE FROM weather_checks WHERE project_id = ?').run(projectId)
    for (const { row } of prepared) reconcileBookingAlerts(row.id)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return prepared.map(({ booking }) => ({
    title: booking.title,
    type: booking.type,
    date: booking.type === 'hotel' ? `${booking.checkIn} 至 ${booking.checkOut} 退房` : booking.travelDate,
  }))
}

const server = createServer(async (req, res) => {
  if (process.env.NODE_ENV === 'production' && !accessAuthDisabled) {
    const authorization = req.headers.authorization || ''
    const credentials = authorization.startsWith('Basic ')
      ? Buffer.from(authorization.slice(6), 'base64').toString('utf8')
      : ''
    const password = credentials.slice(credentials.indexOf(':') + 1)
    const suppliedHash = createHash('sha256').update(password).digest()
    const expectedHash = createHash('sha256').update(accessPassword).digest()
    if (!credentials.includes(':') || !timingSafeEqual(suppliedHash, expectedHash)) {
      res.writeHead(401, {
        'content-type': 'application/json; charset=utf-8',
        'www-authenticate': 'Basic realm="Trip planning demo", charset="UTF-8"',
        'cache-control': 'no-store',
      })
      res.end(JSON.stringify({ error: '需要访问密码' }))
      return
    }
  }

  const pathname = new URL(req.url, 'http://localhost').pathname
  const pathParts = pathname.split('/').filter(Boolean)

  if (pathname === '/api/travellers' && (req.method === 'GET' || req.method === 'POST')) {
    res.setHeader('cache-control', 'no-store')
    if (req.method === 'GET') {
      const travellers = db.prepare(`
        SELECT id, name, identity_number AS identityNumber, created_at AS createdAt
        FROM saved_travellers ORDER BY rowid
      `).all()
      return send(res, 200, { travellers })
    }
    let payload
    try {
      payload = await readJson(req)
    } catch (error) {
      return send(res, error.message === '请求内容过长' ? 413 : 400, { error: '请求内容格式无效或过长' })
    }
    const name = typeof payload?.name === 'string' ? payload.name.trim() : ''
    const identityNumber = typeof payload?.identityNumber === 'string' ? payload.identityNumber.trim() : ''
    if (!name || name.length > 100 || !identityNumber || identityNumber.length > 100) {
      return send(res, 400, { error: '姓名和证件号须为 1 到 100 个字符的字符串' })
    }
    if (db.prepare('SELECT id FROM saved_travellers WHERE identity_number = ?').get(identityNumber)) {
      return send(res, 409, { error: '该证件号已存在' })
    }
    const id = randomUUID()
    db.prepare('INSERT INTO saved_travellers (id, name, identity_number) VALUES (?, ?, ?)').run(id, name, identityNumber)
    const traveller = db.prepare(`
      SELECT id, name, identity_number AS identityNumber, created_at AS createdAt
      FROM saved_travellers WHERE id = ?
    `).get(id)
    return send(res, 201, { traveller })
  }

  if (pathname === '/api/projects' && req.method === 'GET') {
    return send(res, 200, { projects: listProjects() })
  }

  if (pathname === '/api/projects' && req.method === 'POST') {
    try {
      const payload = await readJson(req)
      const destination = typeof payload.destination === 'string' ? payload.destination.trim() : ''
      const departureCity = typeof payload.departureCity === 'string' ? payload.departureCity.trim() : ''
      const days = Number(payload.days)
      const preferences = Array.isArray(payload.preferences)
        ? payload.preferences.filter(value => typeof value === 'string').slice(0, 12).map(value => value.slice(0, 60))
        : []
      const requirements = typeof payload.requirements === 'string' ? payload.requirements.trim().slice(0, 500) : ''
      const tripStartDate = payload.tripStartDate == null || payload.tripStartDate === '' ? null : payload.tripStartDate
      if (!destination || destination.length > 60) return send(res, 400, { error: '请填写 1 到 60 个字符的目的地' })
      if (departureCity.length > 60) return send(res, 400, { error: '出发地不能超过 60 个字符' })
      if (!Number.isInteger(days) || days < 1 || days > 14) return send(res, 400, { error: '出行天数需为 1 到 14 天' })
      if (tripStartDate !== null && (!isIsoDate(tripStartDate) || !isIsoDate(addDays(tripStartDate, days - 1)))) {
        return send(res, 400, { error: '出行日期须为有效的 YYYY-MM-DD 日期' })
      }
      const id = randomUUID()
      db.prepare(`
        INSERT INTO travel_projects (id, destination, days, preferences_json, requirements, trip_start_date, departure_city)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, destination, days, JSON.stringify(preferences), requirements, tripStartDate, departureCity)
      return send(res, 201, projectView(id))
    } catch (error) {
      const status = error.message === '请求内容过长' ? 413 : 400
      return send(res, status, { error: error.message || '无法创建旅行项目' })
    }
  }

  if (pathParts[0] === 'api' && pathParts[1] === 'projects' && pathParts.length === 3 && req.method === 'DELETE') {
    const projectId = pathParts[2]
    if (!db.prepare('SELECT id FROM travel_projects WHERE id = ?').get(projectId)) {
      return send(res, 404, { error: '行程不存在或已删除' })
    }

    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('DELETE FROM trip_events WHERE project_id = ?').run(projectId)
      db.prepare('DELETE FROM assistant_alerts WHERE project_id = ?').run(projectId)
      db.prepare('DELETE FROM weather_alerts WHERE project_id = ?').run(projectId)
      db.prepare('DELETE FROM weather_checks WHERE project_id = ?').run(projectId)
      db.prepare('DELETE FROM test_bookings WHERE project_id = ?').run(projectId)
      db.prepare('UPDATE customer_bookings SET project_id = NULL WHERE project_id = ?').run(projectId)
      db.prepare('UPDATE saved_plans SET project_id = NULL WHERE project_id = ?').run(projectId)
      db.prepare('UPDATE booking_alerts SET project_id = NULL WHERE project_id = ?').run(projectId)
      if (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'itinerary_proposals'").get()) {
        db.prepare('DELETE FROM itinerary_proposals WHERE project_id = ?').run(projectId)
      }
      db.prepare('DELETE FROM agent_runs WHERE project_id = ?').run(projectId)
      db.prepare('DELETE FROM memory_prompts WHERE project_id = ?').run(projectId)
      db.prepare('DELETE FROM travel_projects WHERE id = ?').run(projectId)
      db.exec('COMMIT')
      return send(res, 200, { deleted: true })
    } catch (error) {
      db.exec('ROLLBACK')
      return send(res, 500, { error: '删除行程失败，请稍后重试' })
    }
  }

  if (pathname === '/api/memories' && req.method === 'GET') {
    return send(res, 200, { memories: listMemories() })
  }

  if (pathParts[0] === 'api' && pathParts[1] === 'memories' && pathParts.length === 3 && req.method === 'DELETE') {
    const result = db.prepare(`
      DELETE FROM travel_memories WHERE id = ? AND user_id = 'user1234'
    `).run(pathParts[2])
    if (!result.changes) return send(res, 404, { error: '偏好不存在或已删除' })
    return send(res, 200, { memories: listMemories() })
  }

  if (pathname === '/api/products' && req.method === 'GET') {
    const search = new URL(req.url, 'http://localhost').searchParams
    return send(res, 200, {
      products: withOffers(listProducts(demoProducts, search), BOOKING_OFFERS),
    })
  }

  if (pathParts[0] === 'api' && pathParts[1] === 'products' && pathParts.length === 3 && req.method === 'GET') {
    let productId
    try {
      productId = decodeURIComponent(pathParts[2])
    } catch {
      return send(res, 400, { error: '商品编号无效' })
    }
    const product = findProduct(demoProducts, productId)
    if (!product) return send(res, 404, { error: '演示商品不存在或已下架' })
    return send(res, 200, { product: withOffers([product], BOOKING_OFFERS)[0] })
  }

  if (pathname === '/api/plans' && req.method === 'GET') {
    return send(res, 200, { items: db.prepare('SELECT * FROM saved_plans ORDER BY rowid').all().map(savedPlan) })
  }

  if (pathname === '/api/plans' && req.method === 'POST') {
    let payload
    try { payload = await readJson(req) } catch (error) {
      return send(res, error.message === '请求内容过长' ? 413 : 400, { error: error.message })
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || typeof payload.id !== 'string' || !payload.id.trim() || payload.id.length > 200
      || typeof payload.title !== 'string' || !payload.title.trim() || payload.title.length > 200) {
      return send(res, 400, { error: '计划编号和标题不能为空' })
    }
    const item = { id: payload.id, title: payload.title.trim() }
    for (const key of ['channel', 'detail', 'date']) {
      if (typeof payload[key] === 'string') item[key] = payload[key].slice(0, 500)
    }
    db.prepare('INSERT OR IGNORE INTO saved_plans (id, item_json) VALUES (?, ?)')
      .run(item.id, JSON.stringify(item))
    return send(res, 201, { item: savedPlan(db.prepare('SELECT * FROM saved_plans WHERE id = ?').get(item.id)) })
  }

  if (pathParts[0] === 'api' && pathParts[1] === 'plans' && pathParts.length === 3 && req.method === 'DELETE') {
    let id
    try { id = decodeURIComponent(pathParts[2]) } catch { return send(res, 400, { error: '计划编号无效' }) }
    const result = db.prepare('DELETE FROM saved_plans WHERE id = ?').run(id)
    return result.changes ? send(res, 200, { deleted: true }) : send(res, 404, { error: '计划不存在' })
  }

  if (pathParts[0] === 'api' && pathParts[1] === 'plans' && pathParts.length === 4
    && pathParts[3] === 'project' && req.method === 'PATCH') {
    let id
    try { id = decodeURIComponent(pathParts[2]) } catch { return send(res, 400, { error: '计划编号无效' }) }
    let payload
    try { payload = await readJson(req) } catch (error) {
      return send(res, error.message === '请求内容过长' ? 413 : 400, { error: error.message })
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || (payload.projectId !== null && (typeof payload.projectId !== 'string' || !payload.projectId.trim()))) {
      return send(res, 400, { error: 'projectId 必须为行程编号或 null' })
    }
    if (!db.prepare('SELECT id FROM saved_plans WHERE id = ?').get(id)) return send(res, 404, { error: '计划不存在' })
    if (payload.projectId && !db.prepare('SELECT id FROM travel_projects WHERE id = ?').get(payload.projectId)) {
      return send(res, 404, { error: '所选行程不存在或已删除' })
    }
    db.prepare('UPDATE saved_plans SET project_id = ? WHERE id = ?').run(payload.projectId, id)
    return send(res, 200, { item: savedPlan(db.prepare('SELECT * FROM saved_plans WHERE id = ?').get(id)) })
  }

  if (pathParts[0] === 'api' && pathParts[1] === 'packages' && pathParts.length === 4
    && pathParts[3] === 'checkout' && req.method === 'POST') {
    const packageItem = tourismPackages.find(item => item.id === pathParts[2])
    if (!packageItem) return send(res, 404, { error: '旅游套餐不存在' })
    let payload
    try { payload = await readJson(req) } catch (error) {
      return send(res, error.message === '请求内容过长' ? 413 : 400, { error: error.message })
    }
    const travellerIds = payload?.travellerIds
    if (!Array.isArray(travellerIds) || travellerIds.length < 1 || travellerIds.length > 9
      || travellerIds.some(id => typeof id !== 'string' || !id) || new Set(travellerIds).size !== travellerIds.length
      || (payload.projectId != null && (typeof payload.projectId !== 'string' || !payload.projectId.trim()))) {
      return send(res, 400, { error: '请选择 1 到 9 位不同的出行人' })
    }
    const travellers = savedTravellersForOrder(travellerIds, travellerIds.length)
    if (travellers.error) return send(res, travellers.status, { error: travellers.error })
    const project = payload.projectId ? db.prepare('SELECT * FROM travel_projects WHERE id = ?').get(payload.projectId) : null
    if (payload.projectId && !project) return send(res, 404, { error: '所选行程不存在或已删除' })
    const rooms = Math.ceil(travellerIds.length / 2)
    const entries = []
    try {
      for (const component of packageItem.components.filter(item => ['机票', '火车票', '酒店'].includes(item.channel))) {
        const product = findProduct(demoProducts, component.id)
        if (!product) throw new Error('套餐内商品暂不可用')
        const input = product.type === 'hotel'
          ? { checkIn: component.checkIn, checkOut: component.checkOut, rooms, guests: travellerIds.length, offerId: 'room-comfort' }
          : { travelDate: component.travelDate, passengers: travellerIds.length, offerId: product.type === 'flight' ? 'fare-saver' : undefined }
        const booking = createBookingSnapshot(product, input)
        booking.travellers = travellers.travellers
        entries.push({ product, booking })
      }
    } catch (error) {
      return send(res, 400, { error: error.message })
    }
    if (!entries.length) return send(res, 409, { error: '套餐暂时没有可预订的交通或住宿商品' })
    const originalTotal = entries.reduce((sum, item) => sum + item.booking.totalPrice, 0)
    const discountedTotal = Math.round(originalTotal * 0.8)
    let allocatedTotal = 0
    entries.forEach((entry, index) => {
      const originalAmount = entry.booking.totalPrice
      const amount = index === entries.length - 1
        ? discountedTotal - allocatedTotal
        : Math.round(originalAmount * 0.8)
      allocatedTotal += amount
      entry.booking.totalPrice = amount
      entry.booking.packageId = packageItem.id
      entry.booking.packageTitle = packageItem.title
      entry.booking.packageOriginalTotal = originalAmount
      entry.booking.packageDiscountAmount = originalAmount - amount
      entry.booking.packageDiscountRate = 0.2
    })
    db.exec('BEGIN IMMEDIATE')
    try {
      const results = entries.map(entry => saveCustomerBooking(entry.product, entry.booking, project?.id))
      db.exec('COMMIT')
      const orders = listCustomerBookings()
      return send(res, 201, {
        package: { id: packageItem.id, title: packageItem.title },
        originalTotal,
        discountedTotal,
        discountAmount: originalTotal - discountedTotal,
        conflict: results.some(result => result.conflict),
        orders: results.map(result => orders.find(order => order.id === result.id)),
      })
    } catch {
      db.exec('ROLLBACK')
      return send(res, 500, { error: '套餐订单提交失败，请重试' })
    }
  }

  if (pathname === '/api/orders' && req.method === 'GET') {
    return send(res, 200, { orders: listCustomerBookings() })
  }

  if (pathname === '/api/alerts' && req.method === 'GET') {
    return send(res, 200, { alerts: listAlerts() })
  }

  if (pathParts[0] === 'api' && pathParts[1] === 'alerts' && pathParts.length === 4
    && pathParts[3] === 'read' && req.method === 'POST') {
    const result = db.prepare("UPDATE booking_alerts SET read_at = COALESCE(read_at, datetime('now')) WHERE id = ?").run(pathParts[2])
    const weatherResult = result.changes ? result : db.prepare("UPDATE weather_alerts SET read_at = COALESCE(read_at, datetime('now')) WHERE id = ?").run(pathParts[2])
    const assistantResult = weatherResult.changes ? weatherResult : db.prepare("UPDATE assistant_alerts SET read_at = COALESCE(read_at, datetime('now')) WHERE id = ?").run(pathParts[2])
    if (!assistantResult.changes) return send(res, 404, { error: '提醒不存在' })
    return send(res, 200, { alert: listAlerts().find(item => item.id === pathParts[2]) })
  }

  if (pathParts[0] === 'api' && pathParts[1] === 'orders' && pathParts.length === 4
    && ((pathParts[3] === 'project' && req.method === 'PATCH')
      || (['cancel', 'change'].includes(pathParts[3]) && req.method === 'POST'))) {
    const action = pathParts[3]
    const row = db.prepare('SELECT * FROM customer_bookings WHERE id = ?').get(pathParts[2])
    if (!row) return send(res, 404, { error: '订单不存在' })
    if (row.status !== 'confirmed') return send(res, 409, { error: '只有已确认订单可以操作' })
    const original = decodeJson(row.snapshot_json, {})
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
    const start = original.type === 'hotel' ? original.checkIn : original.travelDate
    if (!isIsoDate(start) || start <= today) return send(res, 409, { error: '已开始或已完成的订单不能操作' })

    let payload = {}
    if (action !== 'cancel') {
      try {
        payload = await readJson(req)
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('请求内容格式无效')
      } catch (error) {
        return send(res, error.message === '请求内容过长' ? 413 : 400, { error: error.message })
      }
    }
    if (action !== 'project' && original.type === 'hotel' && original.offerPolicy !== '限时免费取消') {
      return send(res, 409, { error: '酒店订单方案不可取消或更改' })
    }

    let projectId = row.project_id
    let booking = original
    let productId = row.product_id
    if (action === 'project') {
      if (payload.projectId !== null && (typeof payload.projectId !== 'string' || !payload.projectId.trim())) {
        return send(res, 400, { error: 'projectId 必须为项目编号或 null' })
      }
      projectId = payload.projectId
    } else if (action === 'change') {
      if (original.type === 'hotel') {
        if (!isIsoDate(payload.checkIn) || !isIsoDate(payload.checkOut) || payload.checkIn <= today) {
          return send(res, 400, { error: '请填写未来有效的入住和退房日期' })
        }
      } else if (!isIsoDate(payload.travelDate) || payload.travelDate <= today) {
        return send(res, 400, { error: '请填写未来有效的出行日期' })
      }
      if (original.type !== 'hotel') {
        const baseId = productId.replace(/^(flight|train)-on-\d{4}-\d{2}-\d{2}--/, '')
        productId = `${original.type}-on-${payload.travelDate}--${baseId}`
      }
      const product = findProduct(demoProducts, productId)
      if (!product) return send(res, 404, { error: '演示商品不存在或已下架' })
      try {
        booking = {
          ...createBookingSnapshot(product, { ...original, ...payload, offerId: original.offerId,
            rooms: original.rooms, guests: original.guests, passengers: original.passengers }),
          id: original.id, orderCode: original.orderCode, createdAt: original.createdAt, bookingType: original.bookingType,
          ...(original.travellers ? { travellers: original.travellers } : {}),
        }
      } catch (error) {
        return send(res, 400, { error: error.message })
      }
    }
    const project = projectId ? db.prepare('SELECT * FROM travel_projects WHERE id = ?').get(projectId) : null
    if (projectId && !project) return send(res, 404, { error: '所选行程不存在或已删除' })
    if (action === 'project' && projectId === row.project_id) {
      return send(res, 200, { order: listCustomerBookings().find(item => item.id === row.id) })
    }

    db.exec('BEGIN IMMEDIATE')
    try {
      if (row.project_id) {
        const oldProject = db.prepare('SELECT itinerary_json FROM travel_projects WHERE id = ?').get(row.project_id)
        const itinerary = decodeJson(oldProject?.itinerary_json, null)
        if (itinerary) {
          itinerary.days = itinerary.days.map(day => ({ ...day, items: day.items.filter(item => item.bookingId !== row.id) }))
          db.prepare("UPDATE travel_projects SET itinerary_json = ?, updated_at = datetime('now') WHERE id = ?")
            .run(JSON.stringify(itinerary), row.project_id)
        }
      }
      db.prepare('UPDATE customer_bookings SET project_id = ?, product_id = ?, snapshot_json = ?, status = ? WHERE id = ?')
        .run(projectId, productId, JSON.stringify(booking), action === 'cancel' ? 'cancelled' : 'confirmed', row.id)
      const affected = db.prepare("SELECT DISTINCT order_id FROM booking_alerts WHERE other_order_id = ? AND status = 'pending'").all(row.id)
      for (const item of affected) reconcileBookingAlerts(item.order_id, false)
      const conflicts = reconcileBookingAlerts(row.id, action !== 'cancel')
      if (project && action !== 'cancel' && !conflicts.length) {
        const current = db.prepare('SELECT * FROM travel_projects WHERE id = ?').get(project.id)
        const startDate = current.trip_start_date || (booking.type === 'hotel' ? booking.checkIn
          : booking.direction === 'in' ? addDays(booking.travelDate, -(current.days - 1)) : booking.travelDate)
        const context = { destination: current.destination, days: current.days, tripStartDate: startDate }
        db.prepare("UPDATE travel_projects SET trip_start_date = ?, itinerary_json = ?, status = 'active', updated_at = datetime('now') WHERE id = ?")
          .run(startDate, JSON.stringify(enrichItinerary(itineraryWithBooking(decodeJson(current.itinerary_json, null), context, booking), current.destination)), current.id)
      }
      db.exec('COMMIT')
    } catch {
      db.exec('ROLLBACK')
      return send(res, 500, { error: '订单保存失败，请重试' })
    }
    return send(res, 200, { order: listCustomerBookings().find(item => item.id === row.id) })
  }

  if (pathname === '/api/orders' && req.method === 'POST') {
    let payload
    try {
      payload = await readJson(req)
    } catch (error) {
      return send(res, error.message === '请求内容过长' ? 413 : 400, { error: error.message })
    }
    const product = findProduct(demoProducts, payload.productId)
    if (!product) return send(res, 404, { error: '演示商品不存在或已下架' })
    const project = payload.projectId
      ? db.prepare('SELECT * FROM travel_projects WHERE id = ?').get(payload.projectId)
      : null
    if (payload.projectId && !project) return send(res, 404, { error: '所选行程不存在或已删除' })

    let booking
    try {
      booking = createBookingSnapshot(product, payload)
    } catch (error) {
      return send(res, 400, { error: error.message })
    }
    const expectedTravellerCount = booking.type === 'hotel' ? booking.guests : booking.passengers
    const travellerResult = savedTravellersForOrder(payload.travellerIds, expectedTravellerCount)
    if (travellerResult.error) return send(res, travellerResult.status, { error: travellerResult.error })
    booking.travellers = travellerResult.travellers
    let result
    db.exec('BEGIN IMMEDIATE')
    try {
      result = saveCustomerBooking(product, booking, project?.id)
      db.exec('COMMIT')
    } catch {
      db.exec('ROLLBACK')
      return send(res, 500, { error: '订单保存失败，请重试' })
    }
    return send(res, 201, {
      order: listCustomerBookings().find(item => item.id === result.id),
      conflict: result.conflict,
      project: project ? projectView(project.id) : null,
    })
  }

  if (pathname === '/api/dev/test-orders' && req.method === 'POST') {
    if (process.env.NODE_ENV === 'production') return send(res, 404, { error: '未找到对应的 API 接口' })
    let payload
    try {
      payload = await readJson(req)
    } catch (error) {
      return send(res, error.message === '请求内容过长' ? 413 : 400, { error: error.message })
    }
    const product = demoProducts.find(item => item.id === payload.productId)
    if (!product) return send(res, 404, { error: '演示商品不存在' })
    let booking
    try {
      booking = createBookingSnapshot(product, payload)
    } catch (error) {
      return send(res, 400, { error: error.message })
    }
    const project = payload.projectId
      ? db.prepare('SELECT * FROM travel_projects WHERE id = ?').get(payload.projectId)
      : db.prepare(`
        SELECT * FROM travel_projects
        WHERE status IN ('planning', 'active')
          AND (trip_start_date IS NULL OR trip_start_date >= date('now'))
        ORDER BY created_at DESC, rowid DESC LIMIT 1
      `).get()
    if (!project) return send(res, 404, { error: '没有可关联的未开始行程' })
    const existing = listProjectBookings(project.id)
    const projectContext = {
      destination: project.destination,
      days: project.days,
      tripStartDate: project.trip_start_date || '',
    }
    const conflict = findBookingConflict(booking, existing, projectContext)
    const bookingId = randomUUID()
    booking.id = bookingId
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(`
        INSERT INTO test_bookings (id, project_id, product_id, snapshot_json)
        VALUES (?, ?, ?, ?)
      `).run(bookingId, project.id, product.id, JSON.stringify(booking))

      if (!conflict) {
        const startDate = project.trip_start_date || (
          booking.type === 'hotel' ? booking.checkIn
            : booking.direction === 'in' ? addDays(booking.travelDate, -(project.days - 1))
              : booking.travelDate
        )
        db.prepare(`
          UPDATE travel_projects SET trip_start_date = ?, itinerary_json = ?, status = 'active', updated_at = datetime('now')
          WHERE id = ?
        `).run(
          startDate,
          JSON.stringify(enrichItinerary(itineraryWithBooking(decodeJson(project.itinerary_json, null), {
            ...projectContext,
            tripStartDate: startDate,
          }, booking), project.destination)),
          project.id,
        )
      } else {
        const details = `${conflict}。订单保持不变，小程暂不调整行程，请在对话中说明希望如何安排。`
        recordConflictMessage(project.id, 'booking_conflict', `新增订单：${booking.title}`, details)
      }
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      return send(res, 500, { error: '保存测试订单并核对行程失败' })
    }
    return send(res, 201, { conflict: Boolean(conflict), project: projectView(project.id) })
  }

  if (pathParts[0] === 'api' && pathParts[1] === 'projects' && pathParts.length === 6 && pathParts[3] === 'memory-prompts' && req.method === 'POST') {
    const [projectId, promptId, action] = [pathParts[2], pathParts[4], pathParts[5]]
    const prompt = db.prepare(`
      SELECT id, memory_key, value FROM memory_prompts
      WHERE id = ? AND project_id = ? AND status = 'pending'
    `).get(promptId, projectId)
    if (!prompt) return send(res, 404, { error: '偏好确认请求不存在' })
    if (action === 'confirm') {
      db.prepare(`
        INSERT INTO travel_memories (id, user_id, memory_key, value)
        VALUES (?, 'user1234', ?, ?)
        ON CONFLICT(user_id, memory_key, value) DO UPDATE SET updated_at = datetime('now')
      `).run(randomUUID(), prompt.memory_key, prompt.value)
      db.prepare("UPDATE memory_prompts SET status = 'confirmed', resolved_at = datetime('now') WHERE id = ?").run(promptId)
      return send(res, 200, { project: projectView(projectId), memories: listMemories() })
    }
    if (action === 'dismiss') {
      db.prepare("UPDATE memory_prompts SET status = 'dismissed', resolved_at = datetime('now') WHERE id = ?").run(promptId)
      return send(res, 200, { project: projectView(projectId), memories: listMemories() })
    }
    return send(res, 404, { error: '不支持的偏好操作' })
  }

  if (pathParts[0] === 'api' && pathParts[1] === 'projects' && pathParts.length === 4 && pathParts[3] === 'weather' && req.method === 'GET') {
    const project = db.prepare('SELECT destination, days, trip_start_date FROM travel_projects WHERE id = ?').get(pathParts[2])
    if (!project) return send(res, 404, { error: '旅行项目不存在' })
    return send(res, 200, await getTripWeather({ destination: project.destination, tripStartDate: project.trip_start_date, days: project.days }))
  }

  if (pathParts[0] === 'api' && pathParts[1] === 'projects' && pathParts.length === 3 && req.method === 'GET') {
    const project = projectView(pathParts[2])
    return project ? send(res, 200, project) : send(res, 404, { error: '旅行项目不存在' })
  }

  if (pathParts[0] === 'api' && pathParts[1] === 'projects' && pathParts.length === 4 && pathParts[3] === 'plan' && req.method === 'POST') {
    const project = db.prepare('SELECT id FROM travel_projects WHERE id = ?').get(pathParts[2])
    if (!project) return send(res, 404, { error: '旅行项目不存在' })
    try {
      await runAgent(pathParts[2], 'planning', '根据已填写的目的地、天数和偏好生成首次行程草案')
      return send(res, 200, projectView(pathParts[2]))
    } catch (error) {
      return send(res, 502, { error: error.message, project: projectView(pathParts[2]) })
    }
  }

  if (pathParts[0] === 'api' && pathParts[1] === 'projects' && pathParts.length === 4 && pathParts[3] === 'assist' && req.method === 'POST') {
    const project = db.prepare('SELECT * FROM travel_projects WHERE id = ?').get(pathParts[2])
    if (!project) return send(res, 404, { error: '旅行项目不存在' })
    let payload
    try {
      payload = await readJson(req)
    } catch (error) {
      return send(res, error.message === '请求内容过长' ? 413 : 400, { error: error.message })
    }
    const requestText = typeof payload.request === 'string' ? payload.request.trim().slice(0, 1000) : ''
    if (!requestText) return send(res, 400, { error: '请描述你想调整的内容' })
    if (/行程.{0,12}(?:改到|调整到|改为)/.test(requestText)
      && !requestedTripStartDate(requestText, project.trip_start_date)) {
      return send(res, 400, { error: '未能确定新的出行日期，请填写完整有效的日期后重试。' })
    }
    if (/给别人|帮别人|替别人/.test(requestText)) {
      const pending = db.prepare(`
        SELECT a.id, a.order_id FROM booking_alerts a
        JOIN customer_bookings b ON b.id = a.order_id
        WHERE a.project_id = ? AND a.status = 'pending' AND a.severity = 'soft'
          AND a.code IN ('hotel_overlap', 'destination') AND json_extract(b.snapshot_json, '$.type') = 'hotel'
      `).all(pathParts[2])
      const orderIds = [...new Set(pending.map(alert => alert.order_id))]
      if (orderIds.length === 1) {
        db.prepare(`UPDATE booking_alerts SET status = 'resolved', read_at = COALESCE(read_at, datetime('now')),
          resolved_at = datetime('now') WHERE project_id = ? AND order_id = ? AND severity = 'soft'
          AND code IN ('hotel_overlap', 'destination') AND status = 'pending'`).run(pathParts[2], orderIds[0])
        const message = '明白，这笔酒店是给别人预订的，已消除相关提醒；订单和出行人信息保持不变。'
        const runId = recordAssistantRun(pathParts[2], 'user_request', requestText, message)
        recordAssistantAlert(pathParts[2], runId, message)
        return send(res, 200, projectView(pathParts[2]))
      }
    }
    if (/晚一天(?:回去|回来|返程|返回)|(?:回去|回来|返程|返回).{0,8}晚一天/.test(requestText)) {
      let changes
      try {
        changes = extendDemoTripReturnByOneDay(pathParts[2])
      } catch (error) {
        return send(res, 409, { error: error.message })
      }
      try {
        await runAgent(pathParts[2], 'user_request', requestText, decodeJson(project.itinerary_json, null), changes)
        return send(res, 200, projectView(pathParts[2]))
      } catch (error) {
        return send(res, 502, { error: `演示订单已改签，但新行程生成失败：${error.message}`, project: projectView(pathParts[2]) })
      }
    }
    const baseItinerary = decodeJson(project.itinerary_json, null)
    const intentConflict = findIntentConflict(requestText, listProjectBookings(pathParts[2]))
    if (intentConflict) {
      recordConflictMessage(pathParts[2], 'intent_conflict', requestText, intentConflict)
      return send(res, 200, projectView(pathParts[2]))
    }
    if (/改签|退票|取消(?:机票|火车票|酒店|订单)|修改订单/.test(requestText)) {
      const runId = recordAssistantRun(
        pathParts[2],
        'user_request',
        requestText,
        '我不能办理或修改订单，只能调整未预订的行程安排。你可以告诉我希望如何安排其他行程。',
      )
      recordAssistantAlert(pathParts[2], runId, '我不能办理或修改订单，只能调整未预订的行程安排。你可以告诉我希望如何安排其他行程。')
      return send(res, 200, projectView(pathParts[2]))
    }
    try {
      await runAgent(pathParts[2], 'user_request', requestText, baseItinerary)
      return send(res, 200, projectView(pathParts[2]))
    } catch (error) {
      return send(res, 502, { error: error.message, project: projectView(pathParts[2]) })
    }
  }

  if (pathParts[0] === 'api' && pathParts[1] === 'projects' && pathParts.length === 5 && pathParts[3] === 'events' && pathParts[4] === 'read' && req.method === 'POST') {
    if (!db.prepare('SELECT id FROM travel_projects WHERE id = ?').get(pathParts[2])) {
      return send(res, 404, { error: '旅行项目不存在' })
    }
    db.prepare(`
      UPDATE trip_events SET read_at = COALESCE(read_at, datetime('now'))
      WHERE project_id = ? AND status = 'pending' AND read_at IS NULL
    `).run(pathParts[2])
    db.prepare(`
      UPDATE booking_alerts SET read_at = COALESCE(read_at, datetime('now'))
      WHERE project_id = ? AND status = 'pending' AND read_at IS NULL
    `).run(pathParts[2])
    db.prepare(`
      UPDATE weather_alerts SET read_at = COALESCE(read_at, datetime('now'))
      WHERE project_id = ? AND status = 'pending' AND read_at IS NULL
    `).run(pathParts[2])
    db.prepare(`
      UPDATE assistant_alerts SET read_at = COALESCE(read_at, datetime('now'))
      WHERE project_id = ? AND status = 'pending' AND read_at IS NULL
    `).run(pathParts[2])
    return send(res, 200, projectView(pathParts[2]))
  }

  if (req.url === '/api/assistant/plan' && req.method === 'POST') {
    let payload
    try {
      payload = await readJson(req)
    } catch (error) {
      const status = error.message === '请求内容过长' ? 413 : 400
      return send(res, status, { error: error.message || '请求内容格式无效' })
    }
    const destination = typeof payload?.destination === 'string' ? payload.destination.trim() : ''
    const days = Number(payload?.days)
    const preferences = Array.isArray(payload?.preferences)
      ? payload.preferences.filter(value => typeof value === 'string').slice(0, 12).map(value => value.slice(0, 60))
      : []
    const requirements = typeof payload?.requirements === 'string' ? payload.requirements.trim().slice(0, 500) : ''
    if (!destination || destination.length > 60) {
      return send(res, 400, { error: '请填写 1 到 60 个字符的目的地' })
    }
    if (!Number.isInteger(days) || days < 1 || days > 14) {
      return send(res, 400, { error: '出行天数需为 1 到 14 天' })
    }
    try {
      return send(res, 200, await createItinerary({ destination, days, preferences, requirements }))
    } catch (error) {
      return send(res, 502, { error: error.message || '行程生成失败，请稍后重试' })
    }
  }
  if (req.url === '/api/state' && req.method === 'GET') {
    return send(res, 200, state())
  }
  if (req.url === '/api/confirm' && req.method === 'POST') {
    let body = ''
    for await (const chunk of req) body += chunk
    const payload = JSON.parse(body || '{}')
    if (payload.confirmed !== true) return send(res, 400, { error: '需要明确确认方案' })
    db.prepare('UPDATE demo_state SET confirmed = 1, processed = 0, updated_at = datetime(\'now\') WHERE id = 1').run()
    return send(res, 200, state())
  }
  if (req.url === '/api/process' && req.method === 'POST') {
    if (!state().confirmed) return send(res, 409, { error: '方案尚未确认，不能模拟办理' })
    db.prepare('UPDATE demo_state SET processed = 1, updated_at = datetime(\'now\') WHERE id = 1').run()
    return send(res, 200, state())
  }
  if (pathname === '/api/reset-orders' && req.method === 'POST') {
    db.exec('BEGIN IMMEDIATE')
    try {
      const orderIds = new Set(db.prepare('SELECT id FROM customer_bookings').all().map(row => row.id))
      const projectIds = []
      for (const project of db.prepare('SELECT id, itinerary_json FROM travel_projects WHERE itinerary_json IS NOT NULL').all()) {
        const itinerary = decodeJson(project.itinerary_json, null)
        if (!Array.isArray(itinerary?.days)) continue
        let changed = false
        for (const day of itinerary.days) {
          if (!Array.isArray(day.items)) continue
          day.items = day.items.map(item => {
            if (!orderIds.has(item.bookingId)) return item
            changed = true
            const { bookingId, bookingType, ...unbooked } = item
            return unbooked
          })
        }
        if (changed) {
          db.prepare("UPDATE travel_projects SET itinerary_json = ?, updated_at = datetime('now') WHERE id = ?")
            .run(JSON.stringify(itinerary), project.id)
          projectIds.push(project.id)
        }
      }
      for (const row of db.prepare('SELECT DISTINCT project_id FROM booking_alerts WHERE project_id IS NOT NULL').all()) {
        if (!projectIds.includes(row.project_id)) projectIds.push(row.project_id)
      }
      db.prepare('DELETE FROM booking_alerts').run()
      db.prepare('DELETE FROM customer_bookings').run()
      db.exec('COMMIT')
      return send(res, 200, { deleted: orderIds.size, projectIds })
    } catch {
      db.exec('ROLLBACK')
      return send(res, 500, { error: '清除订单失败，请重试' })
    }
  }
  if (req.url === '/api/reset' && req.method === 'POST') {
    db.prepare('UPDATE demo_state SET confirmed = 0, processed = 0, updated_at = datetime(\'now\') WHERE id = 1').run()
    return send(res, 200, state())
  }

  const staticPath = req.url === '/' ? '/index.html' : req.url.split('?')[0]
  const filePath = join(staticRoot, staticPath.replace(/^\/+/, ''))
  if (filePath.startsWith(staticRoot) && existsSync(filePath)) {
    const type = {
      '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
      '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png',
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    }[extname(filePath)] || 'application/octet-stream'
    res.writeHead(200, { 'content-type': `${type}; charset=utf-8` })
    res.end(readFileSync(filePath))
    return
  }
  if (req.url.startsWith('/api/')) {
    return send(res, 404, { error: '未找到对应的 API 接口' })
  }
  res.writeHead(404)
  res.end('Not found')
})

const port = Number(process.env.PORT || 3101)
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0')
const checkWeather = createWeatherChecker(db)
server.listen(port, host, () => {
  console.log(`API ready at http://${host}:${port}`)
  const run = () => checkWeather().catch(error => console.error('Weather check failed:', error.message))
  run()
  setInterval(run, 5000).unref()
})
