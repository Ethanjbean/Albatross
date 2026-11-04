// The "Try the demo" button: passwordless, read-only access to a shared account.

import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { pool, request, resetDb, buildApp, createUser } from './helpers.js'
import { DEMO_ROUND_COUNT, generateDemoRounds } from '../src/utils/demoRounds.js'

let app
before(async () => { app = await buildApp() })
beforeEach(resetDb)
after(() => pool.end())

const startDemo = () => request(app).post('/api/auth/demo')

async function demoAuth() {
  const res = await startDemo()
  return `Bearer ${res.body.token}`
}

test('demo returns a 1-hour, read-only token for the demo account', async () => {
  const res = await startDemo()
  assert.equal(res.status, 200)
  assert.equal(res.body.username, 'demo')
  assert.equal(res.body.demo, true)

  const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET)
  assert.equal(decoded.demo, true)
  assert.equal(decoded.username, 'demo')
  assert.equal(decoded.exp - decoded.iat, 60 * 60)
})

test('first demo creates the account with targets and a profile; later ones reuse it', async () => {
  const first = jwt.decode((await startDemo()).body.token)
  const second = jwt.decode((await startDemo()).body.token)
  assert.equal(first.id, second.id)

  const users = await pool.query("SELECT id FROM users WHERE username = 'demo'")
  assert.equal(users.rows.length, 1)
  const targets = await pool.query('SELECT * FROM targets WHERE user_id = $1', [first.id])
  assert.equal(targets.rows.length, 1)
  const profile = await pool.query('SELECT * FROM profiles WHERE user_id = $1', [first.id])
  assert.equal(profile.rows.length, 1)
})

test('simultaneous first clicks still create only one demo account', async () => {
  const results = await Promise.all(Array.from({ length: 5 }, startDemo))
  for (const r of results) assert.equal(r.status, 200)
  const ids = new Set(results.map((r) => jwt.decode(r.body.token).id))
  assert.equal(ids.size, 1)
})

test('demo can read', async () => {
  const auth = await demoAuth()
  for (const path of ['/api/rounds', '/api/rounds/stats', '/api/targets', '/api/profiles/me', '/api/profiles/leaderboard']) {
    const res = await request(app).get(path).set('Authorization', auth)
    assert.equal(res.status, 200, path)
  }
})

test('demo cannot write anything', async () => {
  const auth = await demoAuth()
  const round = { course_name: 'Home Course', date_played: '2026-10-01', total_score: 85 }

  const attempts = [
    request(app).post('/api/rounds').send(round),
    request(app).put('/api/rounds/1').send(round),
    request(app).delete('/api/rounds/1'),
    request(app).put('/api/targets').send({ score_goal: 70, putt_goal: 25, fairway_goal: 14, green_goal: 18 }),
    request(app).put('/api/profiles/me').send({ display_name: 'Hacked' }),
  ]
  for (const req of attempts) {
    const res = await req.set('Authorization', auth)
    assert.equal(res.status, 403, `${res.req.method} ${res.req.path}`)
    assert.match(res.body.error, /read-only/)
  }

  // Round 1 is one of the demo's own sample rounds, so the PUT/DELETE above
  // were aimed at a real row. Still exactly the seeded set, untouched.
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM rounds')
  assert.equal(rows[0].n, DEMO_ROUND_COUNT, 'nothing was saved or deleted')
  const r1 = await pool.query("SELECT course_name FROM rounds WHERE id = 1")
  assert.notEqual(r1.rows[0].course_name, 'Home Course', 'round 1 not overwritten')
  const t = await pool.query("SELECT t.score_goal FROM targets t JOIN users u ON u.id = t.user_id WHERE u.username = 'demo'")
  assert.equal(t.rows[0].score_goal, 90, 'targets untouched')
})

test('demo cannot touch real users', async () => {
  const ethan = await createUser(app, 'ethan')
  const created = await request(app).post('/api/rounds').set('Authorization', ethan.auth)
    .send({ course_name: 'Home Course', date_played: '2026-10-01', total_score: 85 })

  const auth = await demoAuth()
  const read = await request(app).get(`/api/rounds/${created.body.id}`).set('Authorization', auth)
  const del = await request(app).delete(`/api/rounds/${created.body.id}`).set('Authorization', auth)
  assert.equal(read.status, 404)
  assert.equal(del.status, 403)
})

test('nobody can register the demo username, in any case', async () => {
  for (const name of ['demo', 'Demo', ' DEMO ']) {
    const res = await request(app).post('/api/auth/register').send({ username: name, password: 'pa55word' })
    assert.equal(res.status, 400, name)
  }
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM users')
  assert.equal(rows[0].n, 0)
})

test('normal accounts are unaffected and can still write', async () => {
  const ethan = await createUser(app, 'ethan')
  assert.equal(jwt.decode(ethan.token).demo, undefined)
  const res = await request(app).put('/api/targets').set('Authorization', ethan.auth)
    .send({ score_goal: 80, putt_goal: 32, fairway_goal: 10, green_goal: 10 })
  assert.equal(res.status, 200)
})

// ---------------------------------------------------------------------------
// Sample rounds
// ---------------------------------------------------------------------------

const demoId = async () => jwt.decode((await startDemo()).body.token).id

test('the demo account comes with 20 hole-by-hole rounds and a handicap', async () => {
  const id = await demoId()

  const rounds = await pool.query('SELECT * FROM rounds WHERE user_id = $1', [id])
  assert.equal(rounds.rows.length, DEMO_ROUND_COUNT)
  for (const r of rounds.rows) {
    assert.equal(r.holes_played, 18)
    assert.notEqual(r.score_differential, null, 'every round counts toward the handicap')
  }

  const holes = await pool.query(
    'SELECT COUNT(*)::int AS n FROM round_holes h JOIN rounds r ON r.id = h.round_id WHERE r.user_id = $1',
    [id]
  )
  assert.equal(holes.rows[0].n, DEMO_ROUND_COUNT * 18)

  const profile = await pool.query('SELECT handicap_index, rounds_counted FROM profiles WHERE user_id = $1', [id])
  assert.notEqual(profile.rows[0].handicap_index, null)
  assert.equal(profile.rows[0].rounds_counted, DEMO_ROUND_COUNT)
})

test('the demo dashboard and profile page have something to show', async () => {
  const auth = await demoAuth()

  const stats = (await request(app).get('/api/rounds/stats').set('Authorization', auth)).body
  assert.equal(stats.rounds_played, DEMO_ROUND_COUNT)
  for (const k of ['best_score', 'avg_score', 'avg_putts', 'fairway_pct', 'gir_pct', 'par3_avg', 'par4_avg', 'par5_avg', 'handicap_index']) {
    assert.notEqual(stats[k], null, k)
  }

  const card = (await request(app).get('/api/profiles/me/stats').set('Authorization', auth)).body
  assert.notEqual(card.milestones.birdie, null)
  assert.notEqual(card.milestones.eagle, null)
  assert.equal(card.milestones.hole_in_one, null, 'left empty on purpose')
  assert.ok(card.ugly.three_putts > 0)
})

test('simultaneous first clicks seed the demo only once', async () => {
  const results = await Promise.all(Array.from({ length: 5 }, startDemo))
  for (const r of results) assert.equal(r.status, 200)
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM rounds')
  assert.equal(rows[0].n, DEMO_ROUND_COUNT)
})

test('an existing demo account with no rounds gets refilled; one with rounds is left alone', async () => {
  const id = await demoId()
  await pool.query('DELETE FROM rounds WHERE user_id = $1', [id])

  assert.equal(await demoId(), id, 'same account, not a new one')
  const count = async () => (await pool.query('SELECT COUNT(*)::int AS n FROM rounds WHERE user_id = $1', [id])).rows[0].n
  assert.equal(await count(), DEMO_ROUND_COUNT)

  await startDemo()
  assert.equal(await count(), DEMO_ROUND_COUNT, 'no double seeding')
})

test('sample rounds are internally consistent', () => {
  const rounds = generateDemoRounds()
  assert.deepEqual(rounds.map((r) => r.total_score), generateDemoRounds().map((r) => r.total_score), 'same golfer every time')

  for (const r of rounds) {
    assert.equal(r.total_score, r.holes.reduce((s, h) => s + h.strokes, 0))
    assert.equal(r.total_putts, r.holes.reduce((s, h) => s + h.putts, 0))
    assert.equal(r.greens_in_reg, r.holes.filter((h) => h.gir).length)
    for (const h of r.holes) {
      assert.ok(h.putts < h.strokes, 'at least one non-putt per hole')
      assert.equal(h.gir, h.strokes - h.putts <= h.par - 2)
      if (h.par === 3) assert.equal(h.fairway_hit, null)
    }
  }
  assert.ok(rounds[0].date_played < rounds.at(-1).date_played, 'oldest first')

  // The golfer gets better: last five average lower than the first five.
  const avg = (list) => list.reduce((s, r) => s + r.total_score, 0) / list.length
  assert.ok(avg(rounds.slice(-5)) < avg(rounds.slice(0, 5)))
})
