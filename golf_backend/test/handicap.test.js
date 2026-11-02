// Handicap math (pure functions) and the handicap kept up to date by the rounds API.

import { test, describe, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { pool, request, resetDb, buildApp, createUser } from './helpers.js'
import { adjustedScore, scoreDifferential } from '../src/utils/handicap.js'

// --- The math, no database --------------------------------------------------------

describe('adjustedScore', () => {
  test('quick-log rounds (no holes) use the total as-is', () => {
    assert.equal(adjustedScore(97, []), 97)
    assert.equal(adjustedScore(97, undefined), 97)
  })

  test('each hole is capped at par + 5', () => {
    const holes = [
      { par: 4, strokes: 12 }, // capped to 9
      { par: 3, strokes: 3 },
      { par: 5, strokes: 10 }, // exactly par + 5: not capped
    ]
    assert.equal(adjustedScore(25, holes), 9 + 3 + 10)
  })
})

describe('scoreDifferential', () => {
  test('is (113 / slope) x (adjusted score - course rating), to one decimal', () => {
    assert.equal(scoreDifferential({ adjusted: 85, courseRating: 72, slopeRating: 113, holesPlayed: 18 }), 13)
    // 113/130 x (90 - 71.5) = 16.08 -> 16.1
    assert.equal(scoreDifferential({ adjusted: 90, courseRating: 71.5, slopeRating: 130, holesPlayed: 18 }), 16.1)
  })

  test("doesn't count 9-hole rounds or rounds missing rating/slope", () => {
    const base = { adjusted: 85, courseRating: 72, slopeRating: 113, holesPlayed: 18 }
    assert.equal(scoreDifferential({ ...base, holesPlayed: 9 }), null)
    assert.equal(scoreDifferential({ ...base, courseRating: null }), null)
    assert.equal(scoreDifferential({ ...base, slopeRating: null }), null)
    assert.equal(scoreDifferential({ ...base, slopeRating: 0 }), null)
  })
})

// --- Through the API, with a real database -------------------------------------------

describe('handicap index via the rounds API', () => {
  let app, user
  before(async () => { app = await buildApp() })
  beforeEach(async () => {
    await resetDb()
    user = await createUser(app)
  })
  after(() => pool.end())

  // Rating 72 / slope 113 makes the differential simply score - 72.
  const addRound = (score, date = '2026-10-01', extra = {}) =>
    request(app).post('/api/rounds').set('Authorization', user.auth).send({
      course_name: 'Test Course', date_played: date, total_score: score,
      course_rating: 72, slope_rating: 113, ...extra,
    })

  const index = async () => {
    const res = await request(app).get('/api/profiles/me').set('Authorization', user.auth)
    return res.body.handicap_index == null ? null : Number(res.body.handicap_index)
  }

  // dates spaced a day apart, newest last
  const day = n => new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10)

  test('no index until 3 eligible rounds', async () => {
    await addRound(85, day(1))
    await addRound(90, day(2))
    assert.equal(await index(), null)

    const third = await addRound(82, day(3))
    assert.equal(third.status, 201)
    // 3 rounds: lowest 1 differential (10), minus 2.0
    assert.equal(Number(third.body.handicap_index), 8)
    assert.equal(await index(), 8)
  })

  test('with 20+ rounds it averages the best 8 of the most recent 20', async () => {
    // differentials 1..20
    for (let i = 1; i <= 20; i++) await addRound(72 + i, day(i + 10))
    assert.equal(await index(), 4.5) // average of 1..8

    // A great round from long ago is outside the last 20, so it doesn't count
    await addRound(60, day(0))
    assert.equal(await index(), 4.5)
  })

  test('9-hole rounds and rounds without rating/slope are logged but not counted', async () => {
    await addRound(80, day(1))
    await addRound(80, day(2))
    await addRound(40, day(3), { holes_played: 9 })
    await addRound(70, day(4), { course_rating: null, slope_rating: null })
    assert.equal(await index(), null)

    const me = await request(app).get('/api/profiles/me').set('Authorization', user.auth)
    assert.equal(me.body.rounds_counted, 2)
  })

  test('hole-by-hole rounds cap blowup holes at par + 5', async () => {
    const holes = Array.from({ length: 18 }, (_, i) => ({ hole_number: i + 1, par: 4, strokes: 4 }))
    holes[0].strokes = 15 // a 15 on a par 4 counts as 9

    const res = await request(app).post('/api/rounds').set('Authorization', user.auth).send({
      course_name: 'Test Course', date_played: day(1), course_rating: 72, slope_rating: 113, holes,
    })
    assert.equal(res.status, 201)
    assert.equal(res.body.total_score, 83, 'real score is kept')
    assert.equal(Number(res.body.score_differential), 77 - 72, 'differential uses the capped 77')
  })

  test('the index is capped at 54.0', async () => {
    for (let i = 1; i <= 3; i++) await addRound(200, day(i), { course_rating: 60, slope_rating: 55 })
    assert.equal(await index(), 54)
  })

  test('editing a round recalculates the index', async () => {
    await addRound(85, day(1))
    await addRound(90, day(2))
    const r = await addRound(82, day(3))
    assert.equal(await index(), 8)

    const edited = await request(app).put(`/api/rounds/${r.body.id}`).set('Authorization', user.auth)
      .send({ course_name: 'Test Course', date_played: day(3), total_score: 76, course_rating: 72, slope_rating: 113 })
    assert.equal(edited.status, 200)
    assert.equal(await index(), 2) // lowest is now 4, minus 2.0
  })

  test('deleting a round recalculates the index', async () => {
    await addRound(85, day(1))
    await addRound(90, day(2))
    const r = await addRound(82, day(3))
    assert.equal(await index(), 8)

    const del = await request(app).delete(`/api/rounds/${r.body.id}`).set('Authorization', user.auth)
    assert.equal(del.status, 200)
    assert.equal(await index(), null, 'back to 2 rounds')
  })

  test('the leaderboard ranks the lower handicap first', async () => {
    for (let i = 1; i <= 3; i++) await addRound(80, day(i))   // ethan: 8 - 2 = 6
    const rival = await createUser(app, 'rival')
    for (let i = 1; i <= 3; i++) {
      await request(app).post('/api/rounds').set('Authorization', rival.auth).send({
        course_name: 'Test Course', date_played: day(i), total_score: 76, course_rating: 72, slope_rating: 113,
      })                                                         // rival: 4 - 2 = 2
    }

    const res = await request(app).get('/api/profiles/leaderboard').set('Authorization', user.auth)
    const ranked = res.body.players.map(p => [p.name, p.handicap_index, p.rank])
    assert.deepEqual(ranked, [['rival', 2, 1], ['ethan', 6, 2]])
  })
})
