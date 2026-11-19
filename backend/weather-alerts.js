import { randomUUID } from 'node:crypto'
import { getTripWeather } from './weather.js'

const alertCodes = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99])

export function initWeatherAlerts(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS weather_alerts (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, forecast_date TEXT NOT NULL,
      title TEXT NOT NULL, details TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      read_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), resolved_at TEXT,
      UNIQUE(project_id, forecast_date)
    );
    CREATE TABLE IF NOT EXISTS weather_checks (
      project_id TEXT PRIMARY KEY, checked_at TEXT NOT NULL
    );
  `)
}

export function listWeatherAlerts(db) {
  return db.prepare(`
    SELECT id, project_id AS projectId, NULL AS orderId, 'weather' AS code,
      'soft' AS severity, forecast_date AS forecastDate, title, details, status,
      read_at AS readAt, created_at AS createdAt, resolved_at AS resolvedAt
    FROM weather_alerts
  `).all()
}

export function createWeatherChecker(db, { fetcher = globalThis.fetch, clock = () => new Date() } = {}) {
  let running = false
  return async function checkNext() {
    if (running) return
    running = true
    try {
      const now = clock()
      const project = db.prepare(`
        SELECT p.id, p.destination, p.days, p.trip_start_date
        FROM travel_projects p LEFT JOIN weather_checks c ON c.project_id = p.id
        WHERE p.status IN ('planning', 'active') AND p.trip_start_date IS NOT NULL
          AND date(p.trip_start_date, '+' || (p.days - 1) || ' days') >= date(?, '-1 day')
          AND p.trip_start_date <= date(?, '+7 days')
          AND (c.checked_at IS NULL OR c.checked_at <= ?)
        ORDER BY c.checked_at, p.rowid LIMIT 1
      `).get(now.toISOString(), now.toISOString(), new Date(now.getTime() - 30 * 60000).toISOString())
      if (!project) return
      db.prepare(`INSERT INTO weather_checks (project_id, checked_at) VALUES (?, ?)
        ON CONFLICT(project_id) DO UPDATE SET checked_at = excluded.checked_at`).run(project.id, now.toISOString())
      const weather = await getTripWeather({ destination: project.destination, days: project.days,
        tripStartDate: project.trip_start_date }, { fetcher, now })
      if (!weather.available) return
      const current = db.prepare('SELECT destination, days, trip_start_date, status FROM travel_projects WHERE id = ?').get(project.id)
      if (!current || current.destination !== project.destination || current.days !== project.days ||
        current.trip_start_date !== project.trip_start_date || !['planning', 'active'].includes(current.status)) return
      db.exec('BEGIN IMMEDIATE')
      try {
        for (const day of weather.days) {
          if (alertCodes.has(day.code)) {
            const details = `${weather.location} ${day.date}预报${day.description}，户外安排建议预留室内备选。请留意出行安全。数据来源：${weather.source}（${weather.fetchedAt}）。`
            db.prepare(`
              INSERT INTO weather_alerts (id, project_id, forecast_date, title, details)
              VALUES (?, ?, ?, '天气提醒', ?)
              ON CONFLICT(project_id, forecast_date) DO UPDATE SET
                details = excluded.details,
                read_at = CASE WHEN weather_alerts.status = 'resolved' THEN NULL ELSE weather_alerts.read_at END,
                status = 'pending', resolved_at = NULL
            `).run(randomUUID(), project.id, day.date, details)
          } else {
            db.prepare(`UPDATE weather_alerts SET status = 'resolved',
              read_at = COALESCE(read_at, datetime('now')), resolved_at = datetime('now')
              WHERE project_id = ? AND forecast_date = ? AND status = 'pending'`).run(project.id, day.date)
          }
        }
        db.prepare(`UPDATE weather_alerts SET status = 'resolved',
          read_at = COALESCE(read_at, datetime('now')), resolved_at = datetime('now')
          WHERE project_id = ? AND status = 'pending'
            AND (forecast_date < ? OR forecast_date > date(?, '+' || (? - 1) || ' days'))`)
          .run(project.id, project.trip_start_date, project.trip_start_date, project.days)
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    } finally {
      running = false
    }
  }
}
