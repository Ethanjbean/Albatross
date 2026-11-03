// Player card stats: milestones, career totals, ugly stats.

import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { pool, request, resetDb, buildApp, createUser } from './helpers.js'

let app, user
before(async () => { app = await buildApp() })
beforeEach(async () => {
  await resetDb()
  user = await createUser(app, 'ethan')
})
after(() => pool.end())

const getStats = (u = user) =>
  request(app).get('/api/profiles/me/stats').set('Authorization', u.auth)

// 18 holes, all par 4 parred with 2 putts, unless overridden: { 3: { strokes: 3 } }
function holes(overrides = {}, pars = {}) {
  return Array.from({ length: 18 }, (_, i) => {
    const n = i + 1
    return { hole_number: n, par: pars[n] ?? 4, strokes: pars[n] ?? 4, putts: 2, ...overrides[n] }
  })
}

async function addRound(date, holeList, u = user, course = 'Home Course') {
  const res = await request(app).post('/api/rounds').set('Authorization', u.auth)
    .send({ course_name: course, date_played: date, holes: holeList })
  assert.equal(res.status, 201, JSON.stringify(res.body))
  return res.body.id
}

test('no rounds: zeros, every milestone locked', async () => {
  const res = await getStats()
  assert.equal(res.status, 200)
  assert.equal(res.body.holes_tracked, 0)
  assert.deepEqual(Object.values(res.body.milestones), [null, null, null, null, null])
  assert.deepEqual(res.body.totals, { hole_in_ones: 0, albatrosses: 0, eagles: 0, birdies: 0, pars: 0 })
  assert.equal(res.body.ugly.bogeys, 0)
  assert.equal(res.body.ugly.penalty_strokes, 0)
})

test('counts every score type on the right holes', async () => {
  await addRound('2026-10-01', holes({
    1: { strokes: 3 },               // birdie
    2: { strokes: 2 },               // eagle
    3: { strokes: 5 },               // bogey
    4: { strokes: 6, putts: 3 },     // double, three-putt
    5: { strokes: 7, penalties: 2 }, // triple+
    6: { strokes: 9, putts: 4 },     // triple+, three-putt
  }))

  const { body } = await getStats()
  assert.equal(body.holes_tracked, 18)
  assert.deepEqual(body.totals, { hole_in_ones: 0, albatrosses: 0, eagles: 1, birdies: 1, pars: 12 })
  assert.equal(body.ugly.bogeys, 1)
  assert.equal(body.ugly.double_bogeys, 1)
  assert.equal(body.ugly.triple_plus, 2)
  assert.equal(body.ugly.three_putts, 2)
  assert.equal(body.ugly.putts_tracked, 18)
  assert.equal(body.ugly.penalty_strokes, 2)
  assert.equal(body.ugly.penalties_tracked, 1)
})

test('a par 3 hole in one counts once: not also an eagle', async () => {
  await addRound('2026-10-01', holes({ 7: { strokes: 1 } }, { 7: 3 }))
  const { body } = await getStats()
  assert.equal(body.totals.hole_in_ones, 1)
  assert.equal(body.totals.eagles, 0)
  assert.equal(body.milestones.hole_in_one.hole_number, 7)
  assert.equal(body.milestones.eagle, null)
})

test('a par 4 hole in one counts once: not also an albatross', async () => {
  await addRound('2026-10-01', holes({ 9: { strokes: 1 } }))
  const { body } = await getStats()
  assert.equal(body.totals.hole_in_ones, 1)
  assert.equal(body.totals.albatrosses, 0)
  assert.equal(body.milestones.albatross, null)
})

test('an albatross is a 2 on a par 5', async () => {
  await addRound('2026-10-01', holes({ 12: { strokes: 2 } }, { 12: 5 }))
  const { body } = await getStats()
  assert.equal(body.totals.albatrosses, 1)
  assert.equal(body.totals.eagles, 0)
  assert.equal(body.milestones.albatross.hole_number, 12)
})

test('firsts are the earliest by date, then hole, regardless of entry order', async () => {
  // Logged out of order: the later round goes in first.
  await addRound('2026-10-10', holes({ 2: { strokes: 3 } }), user, 'Later Course')
  const earlyId = await addRound('2026-10-01', holes({ 15: { strokes: 3 }, 8: { strokes: 3 } }), user, 'Early Course')

  const { birdie } = (await getStats()).body.milestones
  assert.deepEqual(birdie, {
    round_id: earlyId,
    date_played: '2026-10-01',
    course_name: 'Early Course',
    hole_number: 8,
  })
})

test('lowest score: 18-hole rounds only, quick-log included', async () => {
  const quick = await request(app).post('/api/rounds').set('Authorization', user.auth)
    .send({ course_name: 'Quick Course', date_played: '2026-09-15', total_score: 70 })
  await request(app).post('/api/rounds').set('Authorization', user.auth)
    .send({ course_name: 'Nine', date_played: '2026-09-20', total_score: 38, holes_played: 9 })
  await addRound('2026-10-01', holes()) // 72

  const { lowest_score } = (await getStats()).body.milestones
  assert.deepEqual(lowest_score, {
    round_id: quick.body.id,
    total_score: 70,
    date_played: '2026-09-15',
    course_name: 'Quick Course',
  }, 'the quick-log 70 beats the 72; the 9-hole 38 is ignored')
})

test("stats only include the caller's own rounds", async () => {
  const rival = await createUser(app, 'rival')
  await addRound('2026-10-01', holes({ 1: { strokes: 1 } }, { 1: 3 }), rival)

  const { body } = await getStats()
  assert.equal(body.holes_tracked, 0)
  assert.equal(body.milestones.hole_in_one, null)
})

test('requires a token', async () => {
  const res = await request(app).get('/api/profiles/me/stats')
  assert.equal(res.status, 401)
})
