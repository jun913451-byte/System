import test from 'node:test'
import assert from 'node:assert/strict'
import { alertNavigationTarget } from '../frontend/src/alert-navigation.js'

test('project soft conflicts and assistant alerts open the trip conversation', () => {
  assert.deepEqual(alertNavigationTarget({
    projectId: 'trip-1', orderId: 'order-1', severity: 'soft', code: 'destination',
  }), { type: 'assistant', projectId: 'trip-1' })
  assert.deepEqual(alertNavigationTarget({
    projectId: 'trip-1', severity: 'info', code: 'weather',
  }), { type: 'assistant', projectId: 'trip-1' })
  assert.deepEqual(alertNavigationTarget({
    projectId: 'trip-1', severity: 'info', code: 'assistant_reply',
  }), { type: 'assistant', projectId: 'trip-1' })
})

test('hard conflicts open their order and unassociated non-order alerts stay in the inbox', () => {
  assert.deepEqual(alertNavigationTarget({
    projectId: 'trip-1', orderId: 'order-1', severity: 'hard', code: 'transport_overlap',
  }), { type: 'order', orderId: 'order-1' })
  assert.deepEqual(alertNavigationTarget({
    orderId: 'order-2', severity: 'soft', code: 'uncertain_connection',
  }), { type: 'order', orderId: 'order-2' })
  assert.equal(alertNavigationTarget({ severity: 'info', code: 'assistant_reply' }), null)
})
