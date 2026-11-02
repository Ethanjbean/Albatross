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
