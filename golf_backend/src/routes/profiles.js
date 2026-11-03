import express from 'express'
import pool from '../db/index.js'
import { verifyToken } from './middleware/auth.js'

const router = express.Router()
router.use(verifyToken)

// GET /api/profiles/me
router.get('/me', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.username, p.display_name, p.handicap_index, p.rounds_counted, p.handicap_updated
         FROM users u
         LEFT JOIN profiles p ON p.user_id = u.id
        WHERE u.id = $1`,
      [req.user.id]
    )
    res.json(result.rows[0] ?? null)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/profiles/me/stats
// Player card: milestones (firsts + lowest score), career totals, ugly stats.
// Everything except lowest score comes from round_holes, so only hole-by-hole
// rounds count. A hole in one is only ever a hole in one: never also an eagle
// (par 3) or an albatross (par 4).
// Dates come back as 'YYYY-MM-DD' text so the browser can't shift them a day
// across time zones.
router.get('/me/stats', async (req, res) => {
  const userId = req.user.id
  try {
    const [counts, firsts, lowest] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int                                                  AS holes_tracked,
                COUNT(*) FILTER (WHERE h.strokes = 1)::int                     AS hole_in_ones,
                COUNT(*) FILTER (WHERE h.strokes = h.par - 3 AND h.strokes > 1)::int AS albatrosses,
                COUNT(*) FILTER (WHERE h.strokes = h.par - 2 AND h.strokes > 1)::int AS eagles,
                COUNT(*) FILTER (WHERE h.strokes = h.par - 1)::int             AS birdies,
                COUNT(*) FILTER (WHERE h.strokes = h.par)::int                 AS pars,
                COUNT(*) FILTER (WHERE h.strokes = h.par + 1)::int             AS bogeys,
                COUNT(*) FILTER (WHERE h.strokes = h.par + 2)::int             AS double_bogeys,
                COUNT(*) FILTER (WHERE h.strokes >= h.par + 3)::int            AS triple_plus,
                COUNT(*) FILTER (WHERE h.putts >= 3)::int                      AS three_putts,
                COUNT(h.putts)::int                                            AS putts_tracked,
                COALESCE(SUM(h.penalties), 0)::int                             AS penalty_strokes,
                COUNT(h.penalties)::int                                        AS penalties_tracked
           FROM round_holes h
           JOIN rounds r ON r.id = h.round_id
          WHERE r.user_id = $1`,
        [userId]
      ),
      // Earliest hole of each kind. CASE checks hole in one first, so a hole
      // in one never shows up as an eagle or albatross too.
      pool.query(
        `SELECT DISTINCT ON (kind) kind, round_id, date_played, course_name, hole_number
           FROM (
             SELECT CASE
                      WHEN h.strokes = 1         THEN 'hole_in_one'
                      WHEN h.strokes = h.par - 3 THEN 'albatross'
                      WHEN h.strokes = h.par - 2 THEN 'eagle'
                      WHEN h.strokes = h.par - 1 THEN 'birdie'
                    END AS kind,
                    r.id AS round_id, r.date_played::text AS date_played,
                    r.course_name, h.hole_number
               FROM round_holes h
               JOIN rounds r ON r.id = h.round_id
              WHERE r.user_id = $1
           ) x
          WHERE kind IS NOT NULL
          ORDER BY kind, date_played, round_id, hole_number`,
        [userId]
      ),
      // Any 18-hole round counts here, quick-log included. Ties: the first one.
      pool.query(
        `SELECT id AS round_id, total_score, date_played::text AS date_played, course_name
           FROM rounds
          WHERE user_id = $1 AND holes_played = 18
          ORDER BY total_score, date_played, id
          LIMIT 1`,
        [userId]
      ),
    ])

    const c = counts.rows[0]
    const first = kind => {
      const row = firsts.rows.find(f => f.kind === kind)
      if (!row) return null
      const { kind: _kind, ...rest } = row
      return rest
    }

    res.json({
      holes_tracked: c.holes_tracked,
      milestones: {
        hole_in_one: first('hole_in_one'),
        albatross: first('albatross'),
        eagle: first('eagle'),
        birdie: first('birdie'),
        lowest_score: lowest.rows[0] ?? null,
      },
      totals: {
        hole_in_ones: c.hole_in_ones,
        albatrosses: c.albatrosses,
        eagles: c.eagles,
        birdies: c.birdies,
        pars: c.pars,
      },
      ugly: {
        bogeys: c.bogeys,
        double_bogeys: c.double_bogeys,
        triple_plus: c.triple_plus,
        three_putts: c.three_putts,
        putts_tracked: c.putts_tracked,
        penalty_strokes: c.penalty_strokes,
        penalties_tracked: c.penalties_tracked,
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// PUT /api/profiles/me  { display_name }
router.put('/me', async (req, res) => {
  const display_name = (req.body.display_name ?? '').toString().trim().slice(0, 40) || null
  try {
    const result = await pool.query(
      `UPDATE profiles SET display_name = $1 WHERE user_id = $2
       RETURNING display_name, handicap_index, rounds_counted`,
      [display_name, req.user.id]
    )
    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/profiles/leaderboard?sort=handicap|rounds
// handicap: lowest cached index first (ties -> more rounds). No index yet = unranked.
// rounds:   most rounds logged first (ties -> lower index). Everyone is ranked.
// Ties share a rank (1, 2, 2, 4). `me` is the caller's id so the UI can highlight them.
router.get('/leaderboard', async (req, res) => {
  const sort = req.query.sort === 'rounds' ? 'rounds' : 'handicap'
  const orderBy = sort === 'rounds'
    ? 'rounds_played DESC, p.handicap_index ASC NULLS LAST, name'
    : 'p.handicap_index ASC NULLS LAST, rounds_played DESC, name'

  try {
    const result = await pool.query(
      `SELECT u.id AS user_id,
              COALESCE(p.display_name, u.username) AS name,
              p.handicap_index::float AS handicap_index,
              COALESCE(p.rounds_counted, 0)::int AS rounds_counted,
              COUNT(r.id)::int AS rounds_played
         FROM users u
         LEFT JOIN profiles p ON p.user_id = u.id
         LEFT JOIN rounds r ON r.user_id = u.id
        GROUP BY u.id, u.username, p.display_name, p.handicap_index, p.rounds_counted
        ORDER BY ${orderBy}
        LIMIT 100`
    )

    const key = sort === 'rounds' ? 'rounds_played' : 'handicap_index'
    let prev = null
    const players = result.rows.map((p, i) => {
      let rank = null
      if (p[key] != null) {
        rank = prev && prev[key] === p[key] ? prev.rank : i + 1
      }
      const row = { ...p, rank }
      prev = row
      return row
    })

    res.json({ sort, me: req.user.id, players })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
