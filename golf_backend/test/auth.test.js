// Registration, login, tokens, and that users can't reach each other's data.

import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { pool, request, resetDb, buildApp, createUser } from './helpers.js'

let app
before(async () => { app = await buildApp() })
beforeEach(resetDb)
after(() => pool.end())

const register = (username, password) =>
  request(app).post('/api/auth/register').send({ username, password })
const login = (username, password) =>
  request(app).post('/api/auth/login').send({ username, password })

// --- Register --------------------------------------------------------------

test('register creates the user, default targets and a profile', async () => {
  const res = await register('ethan', 'pa55word')
  assert.equal(res.status, 200)
  assert.equal(res.body.username, 'ethan')
  assert.equal(res.body.password, undefined, 'never send the password hash back')

  const targets = await pool.query('SELECT * FROM targets WHERE user_id = $1', [res.body.id])
  assert.deepEqual(
    [targets.rows[0].score_goal, targets.rows[0].putt_goal, targets.rows[0].fairway_goal, targets.rows[0].green_goal],
    [90, 36, 9, 9]
  )
  const profile = await pool.query('SELECT * FROM profiles WHERE user_id = $1', [res.body.id])
  assert.equal(profile.rows.length, 1)
})

test('passwords are stored hashed, not in plain text', async () => {
  await register('ethan', 'pa55word')
  const { rows } = await pool.query("SELECT password FROM users WHERE username = 'ethan'")
  assert.notEqual(rows[0].password, 'pa55word')
  assert.match(rows[0].password, /^\$2[aby]\$/, 'should be a bcrypt hash')
})

test('registering a taken username fails', async () => {
  await register('ethan', 'pa55word')
  const res = await register('ethan', 'different')
  assert.equal(res.status, 400)
  assert.match(res.body.error, /already exists/)
})

// --- Login -----------------------------------------------------------------

test('login with the right password returns a token that lasts 7 days', async () => {
  const { body: user } = await register('ethan', 'pa55word')
  const res = await login('ethan', 'pa55word')

  assert.equal(res.status, 200)
  assert.equal(res.body.username, 'ethan')
  const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET)
  assert.equal(decoded.id, user.id)
  assert.equal(decoded.exp - decoded.iat, 7 * 24 * 60 * 60)
})

test('wrong password and unknown user get the same 401', async () => {
  await register('ethan', 'pa55word')
  const wrongPassword = await login('ethan', 'nope')
  const unknownUser = await login('nobody', 'pa55word')

  assert.equal(wrongPassword.status, 401)
  assert.equal(unknownUser.status, 401)
  // Same message for both, so attackers can't use login to find real usernames.
  assert.equal(wrongPassword.body.error, unknownUser.body.error)
  assert.equal(wrongPassword.body.token, undefined)
})

// --- Tokens on protected routes ---------------------------------------------

test('a valid token gets into protected routes', async () => {
  const user = await createUser(app, 'ethan')
  const res = await request(app).get('/api/profiles/me').set('Authorization', user.auth)
  assert.equal(res.status, 200)
  assert.equal(res.body.username, 'ethan')
})

test('protected routes reject missing, garbage, forged and expired tokens', async () => {
  const user = await createUser(app, 'ethan')
  const forged = jwt.sign({ id: user.id }, 'not-the-real-secret')
  const expired = jwt.sign(
    { id: user.id, iat: Math.floor(Date.now() / 1000) - 8 * 86400 },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )

  const noToken = await request(app).get('/api/profiles/me')
  assert.equal(noToken.status, 401, 'no token')

  for (const [label, token] of [['garbage', 'not.a.token'], ['forged', forged], ['expired', expired]]) {
    const res = await request(app).get('/api/profiles/me').set('Authorization', `Bearer ${token}`)
    assert.equal(res.status, 401, label)
  }
})

test("a user can't read, edit or delete someone else's round", async () => {
  const ethan = await createUser(app, 'ethan')
  const rival = await createUser(app, 'rival')

  const created = await request(app).post('/api/rounds').set('Authorization', ethan.auth)
    .send({ course_name: 'Home Course', date_played: '2026-10-01', total_score: 85 })
  const roundId = created.body.id

  const read = await request(app).get(`/api/rounds/${roundId}`).set('Authorization', rival.auth)
  const edit = await request(app).put(`/api/rounds/${roundId}`).set('Authorization', rival.auth)
    .send({ course_name: 'Hacked', date_played: '2026-10-01', total_score: 60 })
  const del = await request(app).delete(`/api/rounds/${roundId}`).set('Authorization', rival.auth)

  assert.equal(read.status, 404)
  assert.equal(edit.status, 404)
  assert.equal(del.status, 404)

  const { rows } = await pool.query('SELECT course_name, total_score FROM rounds WHERE id = $1', [roundId])
  assert.deepEqual(rows[0], { course_name: 'Home Course', total_score: 85 }, 'round untouched')
})
