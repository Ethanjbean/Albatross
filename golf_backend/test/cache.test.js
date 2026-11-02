// The course lookup cache: GET /api/courses/lookup?osm_id=...
// ryzegolf is faked, so these tests count exactly how much quota each path spends.

import { test, before, beforeEach, afterEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { pool, resetDb, buildApp, createUser, fakeRyze, ryzeCourse, lookup, osmCourses } from './helpers.js'
import normalizeName from '../src/utils/normalizeName.js'

const wordCount = c => normalizeName(c.name, { stripSuffixes: true }).split(' ').length

// Real courses from public/courses-search.json, picked by shape rather than by name
const oneWord = osmCourses.find(c => wordCount(c) === 1)             // e.g. "Anchorage Golf Course"
const twoWord = osmCourses.find(c => wordCount(c) === 2 && c.city)   // for the looser-retry test
const longName = osmCourses.find(c => wordCount(c) >= 4)            // more retries than the cap allows
const another = osmCourses.find(c => c !== oneWord && wordCount(c) === 1)

let app, user, ryze
before(async () => { app = await buildApp() })
beforeEach(async () => {
  await resetDb()
  user = await createUser(app)
})
afterEach(() => ryze?.restore())
after(() => pool.end())

const count = async table => (await pool.query(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n

// --- Basic hit / miss ----------------------------------------------------------

test('first lookup asks ryzegolf and saves it; second is served from the cache', async () => {
  ryze = fakeRyze(() => [ryzeCourse('r1', oneWord.name)])

  const first = await lookup(app, user, oneWord.id)
  assert.equal(first.status, 200)
  assert.equal(first.body.cached, false)
  assert.equal(first.body.match, 'exact')
  assert.equal(first.body.course.name, oneWord.name)
  assert.equal(ryze.calls.length, 1)

  const second = await lookup(app, user, oneWord.id)
  assert.equal(second.status, 200)
  assert.equal(second.body.cached, true)
  assert.equal(second.body.course_id, first.body.course_id)
  assert.deepEqual(second.body.course, first.body.course, 'cached data matches what was fetched')
  assert.equal(ryze.calls.length, 1, 'cache hit must not call ryzegolf')
})

test('the cache is shared: a different user hits it too', async () => {
  ryze = fakeRyze(() => [ryzeCourse('r1', oneWord.name)])
  await lookup(app, user, oneWord.id)

  const other = await createUser(app, 'someone-else')
  const res = await lookup(app, other, oneWord.id)
  assert.equal(res.body.cached, true)
  assert.equal(ryze.calls.length, 1)
})

test('two OSM entries that resolve to the same ryzegolf course share one cached row', async () => {
  ryze = fakeRyze(() => [ryzeCourse('same-ryze-id', oneWord.name)])

  const a = await lookup(app, user, oneWord.id)
  const b = await lookup(app, user, another.id)

  assert.equal(a.body.course_id, b.body.course_id)
  assert.equal(await count('courses'), 1)
  assert.equal(await count('course_lookups'), 2)
})

// --- Not found -------------------------------------------------------------------

test('"ryzegolf does not have it" is cached too, so repeat misses cost nothing', async () => {
  ryze = fakeRyze(() => [])

  const first = await lookup(app, user, oneWord.id)
  assert.equal(first.status, 200)
  assert.equal(first.body.course, null)
  assert.equal(first.body.cached, false)
  const callsAfterFirst = ryze.calls.length

  const second = await lookup(app, user, oneWord.id)
  assert.equal(second.body.course, null)
  assert.equal(second.body.cached, true)
  assert.equal(ryze.calls.length, callsAfterFirst, 'no new ryzegolf calls')
})

test('a cached "not found" is retried after 7 days', async () => {
  ryze = fakeRyze(() => [])
  await lookup(app, user, oneWord.id)
  await pool.query("UPDATE course_lookups SET looked_up_at = now() - interval '8 days'")

  ryze.restore()
  ryze = fakeRyze(() => [ryzeCourse('r1', oneWord.name)])
  const res = await lookup(app, user, oneWord.id)

  assert.equal(res.body.cached, false)
  assert.equal(res.body.course.name, oneWord.name, 'ryzegolf added it since; we pick it up')
  assert.equal(ryze.calls.length, 1)
})

// --- Staleness ----------------------------------------------------------------------

test('a course older than 180 days is refreshed in place (same row, new data)', async () => {
  ryze = fakeRyze(() => [ryzeCourse('r1', oneWord.name, { version: 'old' })])
  const first = await lookup(app, user, oneWord.id)
  await pool.query("UPDATE courses SET fetched_at = now() - interval '181 days'")

  ryze.restore()
  ryze = fakeRyze(() => [ryzeCourse('r1', oneWord.name, { version: 'new' })])
  const refreshed = await lookup(app, user, oneWord.id)

  assert.equal(refreshed.body.cached, false)
  assert.equal(refreshed.body.course_id, first.body.course_id, 'updated, not duplicated')
  assert.equal(refreshed.body.course.version, 'new')
  assert.equal(await count('courses'), 1)

  const again = await lookup(app, user, oneWord.id)
  assert.equal(again.body.cached, true)
  assert.equal(again.body.course.version, 'new')
})

test('a course under 180 days old is still served from cache', async () => {
  ryze = fakeRyze(() => [ryzeCourse('r1', oneWord.name)])
  await lookup(app, user, oneWord.id)
  await pool.query("UPDATE courses SET fetched_at = now() - interval '179 days'")

  const res = await lookup(app, user, oneWord.id)
  assert.equal(res.body.cached, true)
  assert.equal(ryze.calls.length, 1)
})

// --- Errors ----------------------------------------------------------------------------

test('ryzegolf errors are NOT cached, so the next lookup tries again', async () => {
  ryze = fakeRyze(() => ({ status: 500 }))
  const failed = await lookup(app, user, oneWord.id)
  assert.equal(failed.status, 502)
  assert.equal(await count('course_lookups'), 0, 'nothing saved for an error')

  ryze.restore()
  ryze = fakeRyze(() => [ryzeCourse('r1', oneWord.name)])
  const retry = await lookup(app, user, oneWord.id)
  assert.equal(retry.status, 200)
  assert.equal(retry.body.cached, false)
})

test('an unknown course id is a 404 and costs no quota', async () => {
  ryze = fakeRyze(() => [ryzeCourse('r1', 'Whatever')])
  const res = await lookup(app, user, 'way/does-not-exist')
  assert.equal(res.status, 404)
  assert.equal(ryze.calls.length, 0)
})

// --- Fuzzy matching --------------------------------------------------------------------

test('when the full name finds nothing, a looser name is tried', async () => {
  const stored = normalizeName(twoWord.name, { stripSuffixes: true }) + ' CC'  // ryzegolf's version of the name
  ryze = fakeRyze(name => (name.split(' ').length === 1 ? [ryzeCourse('r1', stored)] : []))

  const res = await lookup(app, user, twoWord.id)
  assert.equal(res.status, 200)
  assert.equal(res.body.course.name, stored)
  assert.equal(res.body.match, 'loose')
  assert.equal(ryze.calls.length, 2, 'two-word name, then one word')
})

test('retries stop at 3 calls, even for long names', async () => {
  ryze = fakeRyze(() => [])
  await lookup(app, user, longName.id)
  assert.equal(ryze.calls.length, 3)
})

test('same-named courses are told apart by city', async () => {
  ryze = fakeRyze(() => [
    ryzeCourse('wrong', twoWord.name, { city: 'Somewhere Else' }),
    ryzeCourse('right', twoWord.name, { city: twoWord.city }),
  ])
  const res = await lookup(app, user, twoWord.id)
  assert.equal(res.body.course._id, 'right')
})
