import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTransportCity, returnSearchValues } from '../frontend/src/roundtrip.js'

test('roundtrip reverses route and date without changing the original search', () => {
  const values = { origin: '兰州', destination: '杭州东站', depart: '2027-06-12', return: '2027-06-15', passengers: '2位成人' }
  const result = returnSearchValues(values)
  assert.equal(result.origin, '杭州东站')
  assert.equal(result.destination, '兰州')
  assert.equal(result.depart, '2027-06-15')
  assert.equal(values.depart, '2027-06-12')
  assert.equal(normalizeTransportCity(result.origin), normalizeTransportCity('杭州东'))
})

