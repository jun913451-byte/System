export function toggleTravellerSelection(selected, id, limit) {
  if (selected.includes(id)) return selected.filter(value => value !== id)
  if (limit === 1) return [id]
  return selected.length < limit ? [...selected, id] : selected
}

export function retainTravellerSelection(available, preferred, count) {
  const retained = preferred.filter(id => available.some(person => person.id === id))
  return retained.length === count ? retained : available.slice(0, count).map(person => person.id)
}
