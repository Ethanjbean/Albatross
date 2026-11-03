import express from 'express'
import pool from '../db/index.js'
// Shared middleware (was a local copy here), so targets get the demo
// read-only check too.
import { verifyToken } from './middleware/auth.js'

const router = express.Router()

// GET targets for logged in user
router.get('/', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM targets WHERE user_id = $1',
      [req.user.id]
    )
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// UPDATE targets for logged in user
router.put('/', verifyToken, async (req, res) => {
  const { score_goal, putt_goal, fairway_goal, green_goal } = req.body
  try {
    const result = await pool.query(
      `UPDATE targets 
       SET score_goal = $1, putt_goal = $2, fairway_goal = $3, green_goal = $4
       WHERE user_id = $5
       RETURNING *`,
      [score_goal, putt_goal, fairway_goal, green_goal, req.user.id]
    )
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

export default router