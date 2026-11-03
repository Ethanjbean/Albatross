import express from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import pool from '../db/index.js'
import { demoLogin } from './middleware/rateLimit.js'
import { DEMO_USERNAME, DEMO_TOKEN_TTL, isDemoUsername, ensureDemoUser } from '../utils/demo.js'

const router = express.Router()

// Register
router.post('/register', async (req, res) => {
  const { username, password } = req.body
  // The demo account's name is reserved, or someone could register it and
  // everyone clicking "Try the demo" would land in their account.
  if (isDemoUsername(username)) {
    return res.status(400).json({ error: 'Username already exists' })
  }
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

    // Belt and braces: even a password login to the demo account stays read-only.
    const demo = isDemoUsername(user.username)
    const token = jwt.sign(
      demo ? { id: user.id, username: user.username, demo: true } : { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: demo ? DEMO_TOKEN_TTL : '7d' }
    )
    res.json({ token, username: user.username, ...(demo && { demo: true }) })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// Demo: no password. Returns a short-lived, read-only token for the shared
// demo account (created on first use).
router.post('/demo', demoLogin, async (req, res) => {
  try {
    const id = await ensureDemoUser()
    const token = jwt.sign(
      { id, username: DEMO_USERNAME, demo: true },
      process.env.JWT_SECRET,
      { expiresIn: DEMO_TOKEN_TTL }
    )
    res.json({ token, username: DEMO_USERNAME, demo: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Demo is unavailable right now' })
  }
})

export default router
