import express from 'express'
import jwt from 'jsonwebtoken'
import pool from '../db/index.js'

const router = express.Router()

const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']
  if (!token) return res.status(401).json({ error: 'No token provided' })
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' })
  }
}

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