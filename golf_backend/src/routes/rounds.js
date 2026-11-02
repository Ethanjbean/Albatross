import express from 'express'
import pool from '../db/index.js'
import { verifyToken } from './middleware/auth.js'
import { adjustedScore, scoreDifferential, recalcHandicap } from '../utils/handicap.js'

const router = express.Router()
router.use(verifyToken)

const toInt = v => (v === '' || v == null ? null : Number.parseInt(v, 10))
const toNum = v => (v === '' || v == null ? null : Number(v))
const sumOrNull = (list, pick) => {
  const vals = list.map(pick).filter(v => v != null)
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null
}

/**
 * Turns a request body into a clean round + holes, or throws a 400.
 *
 * Two shapes are accepted:
 *  - Hole-by-hole: body.holes = [{ hole_number, par, strokes, putts?, fairway_hit?, gir?, penalties? }]
 *    Totals are computed here from the holes; anything sent in totals is ignored.
 *  - Quick log: no holes, send total_score (+ optional total_putts, fairways_hit, etc).
 */
function parseRound(body) {
  const bad = msg => Object.assign(new Error(msg), { status: 400 })

  const course_name = (body.course_name ?? '').toString().trim()
  if (!course_name) throw bad('course_name is required')
  if (!body.date_played) throw bad('date_played is required')

  const round = {
    course_id: toInt(body.course_id),
    course_name,
    tee_name: body.tee_name || null,
    course_rating: toNum(body.course_rating),
    slope_rating: toInt(body.slope_rating),
    date_played: body.date_played,
    notes: body.notes || null,
  }

  const holes = Array.isArray(body.holes) ? body.holes : []

  if (holes.length) {
    if (holes.length !== 9 && holes.length !== 18) {
      throw bad(`Enter all 9 or 18 holes (got ${holes.length})`)
    }
    const clean = holes.map(h => ({
      hole_number: toInt(h.hole_number),
      par: toInt(h.par),
      strokes: toInt(h.strokes),
      putts: toInt(h.putts),
      // fairways don't exist on par 3s
      fairway_hit: toInt(h.par) === 3 ? null : (h.fairway_hit ?? null),
      gir: h.gir ?? null,
      penalties: toInt(h.penalties),
    }))
    if (clean.some(h => !h.hole_number || !h.par || !h.strokes)) {
      throw bad('Every hole needs hole_number, par and strokes')
    }

    const fairwayHoles = clean.filter(h => h.fairway_hit != null)
    Object.assign(round, {
      holes_played: clean.length,
      course_par: sumOrNull(clean, h => h.par),
      total_score: sumOrNull(clean, h => h.strokes),
      total_putts: sumOrNull(clean, h => h.putts),
      fairways_hit: fairwayHoles.length ? fairwayHoles.filter(h => h.fairway_hit).length : null,
      fairways_possible: fairwayHoles.length || null,
      greens_in_reg: clean.some(h => h.gir != null) ? clean.filter(h => h.gir).length : null,
      penalties: sumOrNull(clean, h => h.penalties),
    })
    round.holes = clean
  } else {
    const total_score = toInt(body.total_score)
    if (!total_score) throw bad('total_score is required')
    Object.assign(round, {
      holes_played: toInt(body.holes_played) ?? 18,
      course_par: toInt(body.course_par),
      total_score,
      total_putts: toInt(body.total_putts),
      fairways_hit: toInt(body.fairways_hit),
      fairways_possible: toInt(body.fairways_possible),
      greens_in_reg: toInt(body.greens_in_reg),
      penalties: toInt(body.penalties),
    })
    round.holes = []
  }

  round.score_differential = scoreDifferential({
    adjusted: adjustedScore(round.total_score, round.holes),
    courseRating: round.course_rating,
    slopeRating: round.slope_rating,
    holesPlayed: round.holes_played,
  })

  return round
}

const ROUND_COLS = [
  'course_id', 'course_name', 'tee_name', 'course_rating', 'slope_rating', 'course_par',
  'holes_played', 'date_played', 'total_score', 'total_putts', 'fairways_hit',
  'fairways_possible', 'greens_in_reg', 'penalties', 'score_differential', 'notes',
]

async function insertHoles(client, roundId, holes) {
  for (const h of holes) {
    await client.query(
      `INSERT INTO round_holes (round_id, hole_number, par, strokes, putts, fairway_hit, gir, penalties)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [roundId, h.hole_number, h.par, h.strokes, h.putts, h.fairway_hit, h.gir, h.penalties]
    )
  }
}

// Runs fn inside BEGIN/COMMIT, rolls back on any error.
async function withTransaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

function sendError(res, err) {
  if (err.status === 400) return res.status(400).json({ error: err.message })
  if (err.code === '23514') return res.status(400).json({ error: 'A value is out of range' }) // CHECK violation
  if (err.code === '23503') return res.status(400).json({ error: 'Unknown course_id' }) // FK violation
  console.error(err)
  res.status(500).json({ error: 'Server error' })
}

// ---------------------------------------------------------------------------
// Reads. Fixed paths (/stats, /lim8, ...) must stay above /:id.
// ---------------------------------------------------------------------------

// All rounds, newest first. has_holes tells the history table which rows
// have a hole-by-hole scorecard (quick-log rounds don't).
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*,
              EXISTS (SELECT 1 FROM round_holes h WHERE h.round_id = r.id) AS has_holes
         FROM rounds r
        WHERE r.user_id = $1
        ORDER BY r.date_played DESC, r.id DESC`,
      [req.user.id]
    )
    res.json(result.rows)
  } catch (err) { sendError(res, err) }
})

router.get('/all', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM rounds WHERE user_id = $1 ORDER BY date_played DESC, id DESC',
      [req.user.id]
    )
    res.json(result.rows)
  } catch (err) { sendError(res, err) }
})

// Most recent 8, returned oldest -> newest so it charts left to right.
// (The old query was ASC LIMIT 8, which grabbed your 8 OLDEST rounds.)
router.get('/lim8', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM (
         SELECT * FROM rounds WHERE user_id = $1 ORDER BY date_played DESC, id DESC LIMIT 8
       ) recent
       ORDER BY date_played ASC, id ASC`,
      [req.user.id]
    )
    res.json(result.rows)
  } catch (err) { sendError(res, err) }
})

router.get('/lim20', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM rounds WHERE user_id = $1 ORDER BY date_played DESC, id DESC LIMIT 20',
      [req.user.id]
    )
    res.json(result.rows)
  } catch (err) { sendError(res, err) }
})

// Summary numbers + par 3/4/5 scoring averages (from hole-by-hole rounds only)
router.get('/stats', async (req, res) => {
  try {
    const [summary, byPar, profile] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int                                                  AS rounds_played,
           MIN(total_score) FILTER (WHERE holes_played = 18)              AS best_score,
           ROUND(AVG(total_score) FILTER (WHERE holes_played = 18), 1)    AS avg_score,
           ROUND(AVG(total_putts) FILTER (WHERE holes_played = 18), 1)    AS avg_putts,
           ROUND(100.0 * SUM(fairways_hit) / NULLIF(SUM(fairways_possible), 0), 1) AS fairway_pct,
           ROUND(100.0 * SUM(greens_in_reg) / NULLIF(SUM(holes_played) FILTER (WHERE greens_in_reg IS NOT NULL), 0), 1) AS gir_pct
         FROM rounds
         WHERE user_id = $1`,
        [req.user.id]
      ),
      pool.query(
        `SELECT h.par, ROUND(AVG(h.strokes), 2) AS avg_strokes, COUNT(*)::int AS holes
           FROM round_holes h
           JOIN rounds r ON r.id = h.round_id
          WHERE r.user_id = $1
          GROUP BY h.par
          ORDER BY h.par`,
        [req.user.id]
      ),
      pool.query(
        'SELECT handicap_index, rounds_counted FROM profiles WHERE user_id = $1',
        [req.user.id]
      ),
    ])

    const parAvg = par => byPar.rows.find(r => r.par === par)?.avg_strokes ?? null
    res.json({
      ...summary.rows[0],
      par3_avg: parAvg(3),
      par4_avg: parAvg(4),
      par5_avg: parAvg(5),
      handicap_index: profile.rows[0]?.handicap_index ?? null,
    })
  } catch (err) { sendError(res, err) }
})

// One round with its holes (holes is [] for quick-log rounds).
// course_data is the cached ryzegolf course (yardages, hole handicaps, tee boxes),
// or null if the round isn't linked to a cached course.
router.get('/:id', async (req, res) => {
  const id = toInt(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid round id' })
  try {
    const round = await pool.query(
      `SELECT r.*, c.data AS course_data
         FROM rounds r
         LEFT JOIN courses c ON c.id = r.course_id
        WHERE r.id = $1 AND r.user_id = $2`,
      [id, req.user.id]
    )
    if (!round.rows[0]) return res.status(404).json({ error: 'Round not found' })
    const holes = await pool.query(
      'SELECT * FROM round_holes WHERE round_id = $1 ORDER BY hole_number',
      [id]
    )
    res.json({ ...round.rows[0], holes: holes.rows })
  } catch (err) { sendError(res, err) }
})

// ---------------------------------------------------------------------------
// Writes. Each one recalculates the handicap in the same transaction.
// ---------------------------------------------------------------------------

router.post('/', async (req, res) => {
  try {
    const round = parseRound(req.body)
    const saved = await withTransaction(async client => {
      const placeholders = ROUND_COLS.map((_, i) => `$${i + 2}`).join(', ')
      const result = await client.query(
        `INSERT INTO rounds (user_id, ${ROUND_COLS.join(', ')})
         VALUES ($1, ${placeholders}) RETURNING *`,
        [req.user.id, ...ROUND_COLS.map(c => round[c])]
      )
      const row = result.rows[0]
      await insertHoles(client, row.id, round.holes)
      const handicap_index = await recalcHandicap(req.user.id, client)
      return { ...row, holes: round.holes, handicap_index }
    })
    res.status(201).json(saved)
  } catch (err) { sendError(res, err) }
})

// Full replace: send the whole round again (holes included, if it has them)
router.put('/:id', async (req, res) => {
  const id = toInt(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid round id' })
  try {
    const round = parseRound(req.body)
    const saved = await withTransaction(async client => {
      const sets = ROUND_COLS.map((c, i) => `${c} = $${i + 1}`).join(', ')
      const n = ROUND_COLS.length
      const result = await client.query(
        `UPDATE rounds SET ${sets}
          WHERE id = $${n + 1} AND user_id = $${n + 2}
          RETURNING *`,
        [...ROUND_COLS.map(c => round[c]), id, req.user.id]
      )
      const row = result.rows[0]
      if (!row) return null
      await client.query('DELETE FROM round_holes WHERE round_id = $1', [id])
      await insertHoles(client, id, round.holes)
      const handicap_index = await recalcHandicap(req.user.id, client)
      return { ...row, holes: round.holes, handicap_index }
    })
    if (!saved) return res.status(404).json({ error: 'Round not found' })
    res.json(saved)
  } catch (err) { sendError(res, err) }
})

router.delete('/:id', async (req, res) => {
  const id = toInt(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid round id' })
  try {
    const deleted = await withTransaction(async client => {
      // round_holes rows go with it (ON DELETE CASCADE)
      const result = await client.query(
        'DELETE FROM rounds WHERE id = $1 AND user_id = $2',
        [id, req.user.id]
      )
      if (result.rowCount === 0) return false
      await recalcHandicap(req.user.id, client)
      return true
    })
    if (!deleted) return res.status(404).json({ error: 'Round not found' })
    res.json({ message: 'Round deleted' })
  } catch (err) { sendError(res, err) }
})

export default router
