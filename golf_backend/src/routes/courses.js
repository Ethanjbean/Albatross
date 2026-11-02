import express from 'express'
import pool from '../db/index.js'
import { verifyToken } from './middleware/auth.js'
import { perUser, globalDaily } from './middleware/rateLimit.js'
import normalizeName from '../utils/normalizeName.js'
import { getOsmCourse } from '../utils/osmCourses.js'

const router = express.Router()
router.use(verifyToken)

// How long cached answers are trusted before we ask ryzegolf again.
const COURSE_MAX_AGE_DAYS = 180   // slope/rating rarely change; rounds snapshot them anyway
const NOT_FOUND_RETRY_DAYS = 7    // "ryzegolf doesn't have it" might change

// ryzegolf may return an array or wrap it ({ courses: [...] } etc.). Dig until we find the array.
function extractCourses(data, depth = 0) {
  if (!data || depth > 3) return []
  if (Array.isArray(data)) return data
  if (typeof data !== 'object') return []
  for (const key of ['results', 'courses', 'data']) {
    if (key in data) return extractCourses(data[key], depth + 1)
  }
  return Object.values(data).find(Array.isArray) ?? []
}

const getName = c => c?.name ?? c?.course_name ?? c?.courseName ?? ''
const getRyzeId = c => c?._id ?? c?.id ?? null

// ryzegolf's name search is a substring match on ITS stored name, so
// "Starmount Forest Country Club" misses if they store "Starmount Forest CC".
// Build progressively looser queries:
//   "Starmount Forest Country Club" -> "starmount forest" -> "starmount"
// Capped at 3 attempts because every call (even empty/errored) burns quota.
const MAX_ATTEMPTS = 3

function buildQueries(courseName) {
  const queries = []
  const stripped = normalizeName(courseName, { stripSuffixes: true })
  queries.push(stripped)

  // Drop words from the end, but never below one word.
  const words = stripped.split(' ')
  for (let n = words.length - 1; n >= 1; n--) {
    queries.push(words.slice(0, n).join(' '))
  }

  // De-dupe case-insensitively, keep order.
  const seen = new Set()
  return queries
    .filter(q => {
      const key = normalizeName(q)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, MAX_ATTEMPTS)
}

async function searchRyze(name) {
  const upstream = await fetch(
    `${process.env.RYZE_URL}?name=${encodeURIComponent(name)}`,
    {
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': process.env.RYZE_HOST,
      },
      signal: AbortSignal.timeout(8000),
    }
  )

  if (!upstream.ok) {
    const err = new Error(`course service error (${upstream.status})`)
    err.status = upstream.status
    throw err
  }

  return extractCourses(await upstream.json())
}

// Pick the result that is actually the OSM course the user chose.
// (This used to live in Loground.jsx; it moved here because the choice now gets cached.)
//   exact   - normalized names equal
//   loose   - equal once suffixes like "Country Club" are stripped
//   closest - nothing matched, took the first result. Worth reviewing by hand.
function pickCourse(results, osm) {
  if (results.length === 0) return null

  let match = 'exact'
  const target = normalizeName(osm.name)
  let matches = results.filter(c => normalizeName(getName(c)) === target)

  if (matches.length === 0) {
    match = 'loose'
    const loose = normalizeName(osm.name, { stripSuffixes: true })
    matches = results.filter(c => normalizeName(getName(c), { stripSuffixes: true }) === loose)
  }

  if (matches.length === 0) return { course: results[0], match: 'closest' }

  // Same name in several places: break the tie with city, then state.
  const byCity = osm.city && matches.find(c => normalizeName(c.city ?? '') === normalizeName(osm.city))
  const byState = osm.state && matches.find(c => normalizeName(c.state ?? '') === normalizeName(osm.state))
  return { course: byCity ?? byState ?? matches[0], match }
}

// Ask ryzegolf, trying looser names until something comes back.
async function fetchFromRyze(osm) {
  for (const q of buildQueries(osm.name)) {
    const results = await searchRyze(q)
    console.log(`ryzegolf "${q}" -> ${results.length} result(s)`)
    if (results.length > 0) return pickCourse(results, osm)
  }
  return null
}

const daysSince = date => (Date.now() - new Date(date).getTime()) / 86_400_000

// GET /api/courses/lookup?osm_id=way/29357224
// -> { osm: { id, name, city, state }, course_id, course, match, cached }
// course is ryzegolf's course object (scorecard, teeBoxes, ...) or null if ryzegolf doesn't have it.
//
// Runs as a chain: lookupCached -> perUser -> globalDaily -> lookupFresh.
// Cache hits answer in lookupCached and never reach the rate limiters,
// so only requests that would actually spend ryzegolf quota get counted.

// 1. Validate the course and check the cache. Hit: answer now. Miss: pass it on.
async function lookupCached(req, res, next) {
  const osmId = (req.query.osm_id ?? '').toString().trim()
  const osm = getOsmCourse(osmId)
  if (!osm) return res.status(404).json({ error: 'Unknown course' })

  try {
    const { rows } = await pool.query(
      `SELECT l.course_id, l.looked_up_at, c.data, c.match_quality, c.fetched_at
         FROM course_lookups l
         LEFT JOIN courses c ON c.id = l.course_id
        WHERE l.osm_id = $1`,
      [osm.id]
    )
    const hit = rows[0]

    if (hit?.course_id && daysSince(hit.fetched_at) < COURSE_MAX_AGE_DAYS) {
      return res.json({ osm, course_id: hit.course_id, course: hit.data, match: hit.match_quality, cached: true })
    }
    if (hit && !hit.course_id && daysSince(hit.looked_up_at) < NOT_FOUND_RETRY_DAYS) {
      return res.json({ osm, course_id: null, course: null, match: null, cached: true })
    }

    // Miss (or stale): hand osm + hit to the next steps.
    res.locals.osm = osm
    res.locals.hit = hit
    next()
  } catch (err) {
    console.error('course cache check failed:', err)
    res.status(500).json({ error: 'Server error' })
  }
}

// 2. Rate limits passed: ask ryzegolf and cache the answer.
async function lookupFresh(req, res) {
  const { osm, hit } = res.locals

  try {
    const picked = await fetchFromRyze(osm)

    // 3. Save the answer, found or not
    const client = await pool.connect()
    let courseId = null
    try {
      await client.query('BEGIN')

      if (picked) {
        const ryzeId = getRyzeId(picked.course)
        const vals = [
          getName(picked.course) || osm.name,
          picked.course.city ?? osm.city,
          picked.course.state ?? osm.state,
          picked.course,
          picked.match,
        ]

        if (hit?.course_id) {
          // Refreshing a stale course: update the row we already have.
          await client.query(
            `UPDATE courses SET name = $1, city = $2, state = $3, data = $4, match_quality = $5,
                    ryze_id = COALESCE($6, ryze_id), fetched_at = now()
              WHERE id = $7`,
            [...vals, ryzeId, hit.course_id]
          )
          courseId = hit.course_id
        } else {
          // Another OSM entry may already have cached this same ryzegolf course.
          const { rows: saved } = await client.query(
            `INSERT INTO courses (name, city, state, data, match_quality, ryze_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (ryze_id) DO UPDATE
               SET data = EXCLUDED.data, fetched_at = now()
             RETURNING id`,
            [...vals, ryzeId]
          )
          courseId = saved[0].id
        }
      }

      await client.query(
        `INSERT INTO course_lookups (osm_id, osm_name, course_id, looked_up_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (osm_id) DO UPDATE
           SET osm_name = EXCLUDED.osm_name, course_id = EXCLUDED.course_id, looked_up_at = now()`,
        [osm.id, osm.name, courseId]
      )

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    res.json({
      osm,
      course_id: courseId,
      course: picked?.course ?? null,
      match: picked?.match ?? null,
      cached: false,
    })
  } catch (err) {
    // ryzegolf errors are not cached: they're usually temporary.
    if (err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'Course service timed out' })
    }
    if (err.status) {
      console.error(`ryzegolf responded ${err.status} for "${osm.name}"`)
      return res.status(502).json({ error: err.message })
    }
    console.error('course lookup failed:', err)
    res.status(500).json({ error: 'Server error' })
  }
}

router.get('/lookup', lookupCached, perUser, globalDaily, lookupFresh)

export default router
