import test from 'node:test'
import assert from 'node:assert/strict'
import { matchSight } from './sight-matching.js'

const products = [
  { title: '北京城市博物馆' },
  { title: '北京湖滨公园' },
  { title: '北京艺术中心' },
]

test('sight recommendations match the attraction rather than the day index', () => {
  assert.deepEqual(matchSight(products, { title: '首都博物馆' }), [products[0]])
  assert.deepEqual(matchSight(products, { title: '城市公园' }), [products[1]])
  assert.deepEqual(matchSight(products, { title: '北京艺术中心' }), [products[2]])
  assert.deepEqual(matchSight(products, { title: '欢乐游乐园' }), [])
  assert.deepEqual(matchSight(products, { title: '一处风景' }), [])
})
