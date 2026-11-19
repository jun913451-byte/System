const [, , productId, projectId, dateOrCheckIn, checkOut] = process.argv

if (!productId) {
  console.error('Usage: node backend/scripts/create-test-order.js <productId> [projectId] [travelDate|checkIn] [checkOut]')
  process.exit(1)
}

const apiBase = process.env.API_BASE_URL || 'http://localhost:5173'
const productResponse = await fetch(`${apiBase}/api/products`)
if (!productResponse.ok) throw new Error('无法读取演示商品目录，请确认后端已启动')
const { products } = await productResponse.json()
const product = products.find(item => item.id === productId)
if (!product) throw new Error(`商品不存在：${productId}`)

const payload = { productId }
if (projectId) payload.projectId = projectId
if (product.type === 'hotel') {
  if (!dateOrCheckIn || !checkOut) {
    throw new Error('酒店测试订单需提供入住与退房日期')
  }
  payload.checkIn = dateOrCheckIn
  payload.checkOut = checkOut
} else if (dateOrCheckIn) {
  payload.travelDate = dateOrCheckIn
}

const response = await fetch(`${apiBase}/api/dev/test-orders`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload),
})
const result = await response.json()
if (!response.ok) throw new Error(result.error || '创建测试订单失败')
console.log(JSON.stringify({
  conflict: result.conflict,
  projectId: result.project.id,
  destination: result.project.destination,
  itinerary: result.project.itinerary,
}, null, 2))
