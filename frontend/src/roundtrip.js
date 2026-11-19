export function normalizeTransportCity(value) {
  return String(value || '').trim().replace(/(北|南|东|西)?站$/, '').replace(/(北|南|东|西)$/, '')
}

export function returnSearchValues(values) {
  return { ...values, origin: values.destination, destination: values.origin, depart: values.return }
}
