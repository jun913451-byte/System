export function projectSavedPlans(project) {
  const original = project?.itinerary
  const itinerary = original ? {
    ...original,
    days: original.days.map(day => ({
      ...day,
      items: day.items.filter(item => !item.savedPlanId),
    })),
  } : null
  const unscheduled = []

  for (const item of project?.savedPlans || []) {
    const plan = {
      id: `plan-${item.id}`,
      savedPlanId: item.id,
      type: 'attraction',
      time: '待安排',
      title: item.title,
      description: item.detail || '',
    }
    const day = itinerary?.days?.find(entry => entry.date && entry.date === item.date)
    if (day) day.items.push(plan)
    else unscheduled.push(plan)
  }

  return { itinerary, unscheduled }
}
