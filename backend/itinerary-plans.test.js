import test from 'node:test'
import assert from 'node:assert/strict'
import { projectSavedPlans } from '../frontend/src/itinerary-plans.js'

test('saved itinerary notes appear on their date or remain unscheduled', () => {
  const project = {
    id: 'trip-1',
    itinerary: { days: [
      { day: 1, date: '2027-06-12', items: [{ id: 'order', bookingId: 'order', title: '已订' }] },
      { day: 2, date: '2027-06-13', items: [] },
    ] },
    savedPlans: [
      { id: 'a', title: '公园', detail: '散步', date: '2027-06-12' },
      { id: 'b', title: '博物馆' },
    ],
  }
  const result = projectSavedPlans(project)
  assert.equal(result.itinerary.days[0].items[0].bookingId, 'order')
  assert.equal(result.itinerary.days[0].items[1].savedPlanId, 'a')
  assert.equal(result.unscheduled[0].savedPlanId, 'b')
  assert.equal(project.itinerary.days[0].items.length, 1)
  assert.deepEqual(projectSavedPlans({ ...project, itinerary: result.itinerary }), result)
})

test('saved notes remain visible before an itinerary exists', () => {
  const result = projectSavedPlans({
    id: 'trip-1',
    itinerary: null,
    savedPlans: [{ id: 'a', title: '公园', detail: '散步' }],
  })
  assert.equal(result.itinerary, null)
  assert.equal(result.unscheduled[0].title, '公园')
})
