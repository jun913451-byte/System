import test from 'node:test'
import assert from 'node:assert/strict'
import { retainTravellerSelection, toggleTravellerSelection } from '../frontend/src/traveller-selection.js'

test('single selection switches directly and supports deselection', () => {
  assert.deepEqual(toggleTravellerSelection(['a'], 'b', 1), ['b'])
  assert.deepEqual(toggleTravellerSelection(['b'], 'b', 1), [])
})

test('multiple selections respect the limit and allow removal', () => {
  assert.deepEqual(toggleTravellerSelection(['a'], 'b', 2), ['a', 'b'])
  assert.deepEqual(toggleTravellerSelection(['a', 'b'], 'c', 2), ['a', 'b'])
  assert.deepEqual(toggleTravellerSelection(['a', 'b'], 'a', 2), ['b'])
})

test('roundtrip checkout retains the chosen travellers when they still exist', () => {
  const available = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.deepEqual(retainTravellerSelection(available, ['b', 'c'], 2), ['b', 'c'])
  assert.deepEqual(retainTravellerSelection(available, ['missing'], 1), ['a'])
})
