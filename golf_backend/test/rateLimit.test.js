// Rate limits on the course lookup, tested through the real route.
// Limits are lowered for this file: 2 per user, 5 total.
//
// The limiters keep their counts in memory for the whole file, so these tests
// run in order and build on each other. The database is only reset once.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { pool, resetDb, buildApp, createUser, fakeRyze, ryzeCourse, lookup, osmCourses } from './helpers.js'

process.env.LOOKUP_LIMIT_PER_USER = '2'
process.env.LOOKUP_LIMIT_GLOBAL_DAILY = '5'

// Six different real courses; each first lookup is a cache miss.
const [A, B, C, D, E, F] = osmCourses.slice(0, 6)

let app, ryze
before(async () => {
  await resetDb()
  app = await buildApp() // loads the limiters with the limits above
  ryze = fakeRyze(name => [ryzeCourse(`r-${name}`, name)])
})
after(async () => {
  ryze.restore()
  await pool.end()
})

let ethan
test('cache hits are never rate limited', async () => {
  ethan = await createUser(app, 'ethan')

  assert.equal((await lookup(app, ethan, A.id)).status, 200) // miss: counts (user 1/2, global 1/5)
  for (let i = 0; i < 10; i++) {
    const hit = await lookup(app, ethan, A.id)
    assert.equal(hit.status, 200)
    assert.equal(hit.body.cached, true)
  }
})

test('cache misses count, and the next one past the limit gets a 429', async () => {
  assert.equal((await lookup(app, ethan, B.id)).status, 200) // user 2/2, global 2/5

  const callsBefore = ryze.calls.length
  const blocked = await lookup(app, ethan, C.id)
  assert.equal(blocked.status, 429)
  assert.match(blocked.body.error, /Too many course lookups/)
  assert.ok(blocked.headers['ratelimit'], 'tells the client its limit status')
  assert.equal(ryze.calls.length, callsBefore, 'blocked request never reached ryzegolf')
})

test('a blocked user can still open courses that are already cached', async () => {
  const hit = await lookup(app, ethan, A.id)
  assert.equal(hit.status, 200)
  assert.equal(hit.body.cached, true)
})

test("one user's limit doesn't block anyone else", async () => {
  const rival = await createUser(app, 'rival')
  assert.equal((await lookup(app, rival, C.id)).status, 200) // global 3/5
})

test('the global daily cap blocks everyone once it is used up', async () => {
  const u3 = await createUser(app, 'u3')
  const u4 = await createUser(app, 'u4')
  const u5 = await createUser(app, 'u5')

  assert.equal((await lookup(app, u3, D.id)).status, 200) // global 4/5
  assert.equal((await lookup(app, u4, E.id)).status, 200) // global 5/5

  const blocked = await lookup(app, u5, F.id) // brand-new user, first lookup
  assert.equal(blocked.status, 429)
  assert.match(blocked.body.error, /daily limit/)
})
