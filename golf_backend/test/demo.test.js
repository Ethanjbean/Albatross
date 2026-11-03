// The "Try the demo" button: passwordless, read-only access to a shared account.

import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { pool, request, resetDb, buildApp, createUser } from './helpers.js'

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

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM rounds')
  assert.equal(rows[0].n, 0, 'nothing was saved')
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
