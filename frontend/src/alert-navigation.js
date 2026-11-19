export function alertNavigationTarget(alert) {
  if (alert?.projectId && (alert.severity === 'soft' || ['weather', 'assistant_reply'].includes(alert.code))) {
    return { type: 'assistant', projectId: alert.projectId }
  }
  if (alert?.orderId) return { type: 'order', orderId: alert.orderId }
  return null
}
