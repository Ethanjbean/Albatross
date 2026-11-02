import express from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import pool from '../db/index.js'

const router = express.Router()

// Register
router.post('/register', async (req, res) => {
  const { username, password } = req.body
  const hashed = await bcrypt.hash(password, 10)
  try {
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, hashed]
    )
    const newUser = result.rows[0]
    await pool.query(
      `INSERT INTO targets (user_id, score_goal, putt_goal, fairway_goal, green_goal)
      VALUES($1, $2, $3, $4, $5)`,
      [newUser.id, 90, 36, 9, 9]
    )
    await pool.query('INSERT INTO profiles (user_id) VALUES ($1)', [newUser.id])
    res.json(result.rows[0])
  } catch (err) {
    res.status(400).json({ error: 'Username already exists' })
  }
})

// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username])
    const user = result.rows[0]
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })

    const match = await bcrypt.compare(password, user.password)
    if (!match) return res.status(401).json({ error: 'Invalid credentials' })

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )
    res.json({ token, username: user.username })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})



export default router  // ✅ make sure this is here