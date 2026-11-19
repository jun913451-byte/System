import { addDays, isIsoDate } from './booking-domain.js'

const reminder = '出行时请注意天气哦'
const unavailable = () => ({ available: false, summary: reminder, days: [] })
const descriptions = new Map([
  [0, '晴'], [1, '大部晴朗'], [2, '局部多云'], [3, '阴'], [45, '雾'], [48, '雾凇'],
  [51, '小毛毛雨'], [53, '毛毛雨'], [55, '强毛毛雨'], [56, '冻毛毛雨'], [57, '强冻毛毛雨'],
  [61, '小雨'], [63, '中雨'], [65, '大雨'], [66, '冻雨'], [67, '强冻雨'],
  [71, '小雪'], [73, '中雪'], [75, '大雪'], [77, '雪粒'], [80, '小阵雨'], [81, '阵雨'], [82, '强阵雨'],
  [85, '阵雪'], [86, '强阵雪'], [95, '雷暴'], [96, '雷暴伴冰雹'], [99, '强雷暴伴冰雹'],
])

export async function getTripWeather({ destination, tripStartDate, days }, { fetcher = fetch, now = new Date(), timeoutMs = 6000 } = {}) {
  if (!isIsoDate(tripStartDate) || !Number.isInteger(days) || days < 1 || days > 14 || typeof destination !== 'string') return unavailable()
  const utcToday = now.toISOString().slice(0, 10)
  const lastDate = addDays(tripStartDate, days - 1)
  // A one-day margin covers destination time zones before looking up the location.
  if (lastDate < addDays(utcToday, -1) || tripStartDate > addDays(utcToday, 7)) return unavailable()
  try {
    const signal = AbortSignal.timeout(timeoutMs)
    const locationUrl = new URL('https://geocoding-api.open-meteo.com/v1/search')
    locationUrl.search = new URLSearchParams({ name: destination, count: '100', language: 'zh', format: 'json' })
    const locationResponse = await fetcher(locationUrl, { signal })
    if (!locationResponse.ok) return unavailable()
    const locationData = await locationResponse.json()
    const normalize = value => value.trim().replace(/市$/, '').toLocaleLowerCase()
    const locations = (Array.isArray(locationData.results) ? locationData.results : []).filter(place =>
      typeof place.name === 'string' && normalize(place.name) === normalize(destination) &&
      Number.isFinite(place.latitude) && Number.isFinite(place.longitude) && typeof place.timezone === 'string')
    const capitals = locations.filter(place => ['PPLA', 'PPLC'].includes(place.feature_code))
    const place = locations.length === 1 ? locations[0] : capitals.length === 1 ? capitals[0] : null
    if (!place) return unavailable()
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: place.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
    const startDate = tripStartDate > today ? tripStartDate : today
    const horizon = addDays(today, 6)
    const endDate = lastDate < horizon ? lastDate : horizon
    if (startDate > endDate) return unavailable()
    const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast')
    forecastUrl.search = new URLSearchParams({ latitude: String(place.latitude), longitude: String(place.longitude), timezone: place.timezone,
      start_date: startDate, end_date: endDate, daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' })
    const forecastResponse = await fetcher(forecastUrl, { signal })
    if (!forecastResponse.ok) return unavailable()
    const forecast = await forecastResponse.json()
    const daily = forecast.daily
    const coveredDays = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000) + 1
    if (!daily || !Array.isArray(daily.time) || daily.time.length !== coveredDays || forecast.timezone !== place.timezone ||
      forecast.daily_units?.temperature_2m_max !== '°C' || forecast.daily_units?.temperature_2m_min !== '°C' ||
      forecast.daily_units?.precipitation_probability_max !== '%') return unavailable()
    const result = daily.time.map((date, index) => ({ date, code: daily.weather_code?.[index],
      temperatureMax: daily.temperature_2m_max?.[index], temperatureMin: daily.temperature_2m_min?.[index],
      precipitationProbability: daily.precipitation_probability_max?.[index] }))
    if (result.some((day, index) => day.date !== addDays(startDate, index) || !descriptions.has(day.code) ||
      !Number.isFinite(day.temperatureMax) || !Number.isFinite(day.temperatureMin) || day.temperatureMin > day.temperatureMax ||
      !Number.isFinite(day.precipitationProbability) || day.precipitationProbability < 0 || day.precipitationProbability > 100)) return unavailable()
    const forecastDays = result.map(day => ({ ...day, description: descriptions.get(day.code) }))
    return { available: true, summary: forecastDays.map(day => `${day.date} ${day.description} ${day.temperatureMin}～${day.temperatureMax}℃，降水概率${day.precipitationProbability}%`).join('；'),
      days: forecastDays, coverageStart: startDate, coverageEnd: endDate, partial: startDate !== tripStartDate || endDate !== lastDate,
      source: 'Open-Meteo', location: [place.name, place.admin1, place.country].filter(Boolean).join('，'),
      timezone: place.timezone, fetchedAt: now.toISOString() }
  } catch {
    return unavailable()
  }
}
