// Shared test setup: database reset, the Express app, fake ryzegolf, users.

import './env.js' // must stay first: sets the test DB before db/index.js loads
import express from 'express'
import request from 'supertest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pool from '../src/db/index.js'

export { pool, request }

const SCHEMA = readFileSync(fileURLToPath(new URL('../src/db/schema.sql', import.meta.url)), 'utf8')

// The same course list the app searches. Tests look courses up by real OSM ids.
export const osmCourses = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../public/courses-search.json', import.meta.url)), 'utf8')
)

// Build tables if missing, then empty every one of them.
// (users CASCADE also clears targets, profiles, rounds and round_holes.)
export async function resetDb() {
  await pool.query(SCHEMA)
  await pool.query('TRUNCATE users, courses, course_lookups RESTART IDENTITY CASCADE')
}

// The app wired up the same way server.js does it, minus app.listen().
// Routes load lazily so a test file can change env vars (rate limits) first.
let app
export async function buildApp() {
  if (app) return app
  const [auth, rounds, targets, courses, profiles] = await Promise.all([
    import('../src/routes/auth.js'),
    import('../src/routes/rounds.js'),
    import('../src/routes/targets.js'),
    import('../src/routes/courses.js'),
    import('../src/routes/profiles.js'),
  ])
  app = express()
  app.use(express.json())
  app.use('/api/auth', auth.default)
  app.use('/api/rounds', rounds.default)
  app.use('/api/targets', targets.default)
  app.use('/api/courses', courses.default)
  app.use('/api/profiles', profiles.default)
  return app
}

// Registers + logs in a user. Returns { id, username, token, auth } where
// auth is the ready-to-use Authorization header value.
export async function createUser(app, username = 'ethan', password = 'pa55word') {
  const reg = await request(app).post('/api/auth/register').send({ username, password })
  if (reg.status !== 200) throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body)}`)
  const login = await request(app).post('/api/auth/login').send({ username, password })
  return { id: reg.body.id, username, token: login.body.token, auth: `Bearer ${login.body.token}` }
}

// Stands in for ryzegolf. respond(name) gets the search name and returns either
// an array of courses, or { status } to simulate an error.
// Every call is recorded in .calls so tests can count quota spent.
export function fakeRyze(respond) {
  const realFetch = globalThis.fetch
  const fake = {
    calls: [],
    restore: () => { globalThis.fetch = realFetch },
  }
  globalThis.fetch = async url => {
    const name = new URL(url).searchParams.get('name')
    fake.calls.push(name)
    const result = await respond(name)
    if (result && !Array.isArray(result) && result.status) {
      return { ok: false, status: result.status, json: async () => ({}) }
    }
    return { ok: true, status: 200, json: async () => result }
  }
  return fake
}

// A ryzegolf-shaped course object.
export const ryzeCourse = (id, name, extra = {}) => ({
  _id: id,
  name,
  city: null,
  state: null,
  scorecard: [{ Hole: 1, Par: 4 }],
  ...extra,
})

export const lookup = (app, user, osmId) =>
  request(app).get('/api/courses/lookup').query({ osm_id: osmId }).set('Authorization', user.auth)
