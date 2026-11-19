import { addDays, isIsoDate } from './booking-domain.js'

function shiftMonth(value, amount) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + amount)
  return date.toISOString().slice(0, 7)
}

export function requestedTripStartDate(request, currentDate) {
  if (!isIsoDate(currentDate) || !/行程.{0,12}(?:改到|调整到|改为)/.test(request)) return ''

  const fullDate = request.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/)
    || request.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/)
  if (fullDate) {
    const date = `${fullDate[1]}-${String(fullDate[2]).padStart(2, '0')}-${String(fullDate[3]).padStart(2, '0')}`
    return isIsoDate(date) ? date : ''
  }

  const monthDay = request.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/)
  if (monthDay) {
    const date = `${currentDate.slice(0, 4)}-${String(monthDay[1]).padStart(2, '0')}-${String(monthDay[2]).padStart(2, '0')}`
    return isIsoDate(date) ? date : ''
  }

  const dayOnly = request.match(/(?:改到|调整到|改为)\s*(\d{1,2})\s*日/)
  if (!dayOnly) return ''
  const day = Number(dayOnly[1])
  const candidates = [-1, 0, 1].map(offset => {
    const month = shiftMonth(currentDate, offset)
    const date = `${month}-${String(day).padStart(2, '0')}`
    return isIsoDate(date) ? date : ''
  }).filter(Boolean)
  return candidates.sort((left, right) =>
    Math.abs(Date.parse(`${left}T00:00:00Z`) - Date.parse(`${currentDate}T00:00:00Z`))
      - Math.abs(Date.parse(`${right}T00:00:00Z`) - Date.parse(`${currentDate}T00:00:00Z`)),
  )[0] || ''
}
