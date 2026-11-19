export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function orderStatus(order, today = localDate()) {
  if (!order) return ''
  if (order.status === 'cancelled') return '已取消'
  if (order.status === 'completed') return '已完成'

  const hotel = order.type === 'hotel'
  const start = hotel ? order.checkIn : order.travelDate
  const end = hotel ? order.checkOut : order.travelDate
  if (end && (hotel ? end <= today : end < today)) return '已完成'
  if (start && start <= today) return '出行中'
  return '待出行'
}

export function sortOrders(orders, today = localDate()) {
  return [...orders].sort((a, b) =>
    Number(orderStatus(a, today) === '已完成') - Number(orderStatus(b, today) === '已完成'))
}
