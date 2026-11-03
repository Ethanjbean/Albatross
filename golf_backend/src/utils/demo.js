// The shared, read-only demo account behind the "Try the demo" button.
//
// Anyone can get a demo token without a password. The token carries
// demo: true, and verifyToken rejects every write request made with it,
// so visitors can look around but never change the demo data.

import bcrypt from 'bcrypt'
import { randomBytes } from 'node:crypto'
import pool from '../db/index.js'

export const DEMO_USERNAME = process.env.DEMO_USERNAME || 'demo'

// Demo sessions are short; the button gets a fresh token any time.
export const DEMO_TOKEN_TTL = '1h'

export const DEMO_READ_ONLY_MESSAGE =
  'The demo is read-only. Create an account to save your own rounds.'

// Case-insensitive, so nobody can register "Demo" and pass as the demo account.
export const isDemoUsername = (name) =>
  typeof name === 'string' && name.trim().toLowerCase() === DEMO_USERNAME.toLowerCase()

// Returns the demo user's id, creating the account (with default targets and
// a profile, same as /register) the first time it's needed. The password is
// random and thrown away: the demo account can only be entered through /demo.
export async function ensureDemoUser() {
  const existing = await pool.query('SELECT id FROM users WHERE username = $1', [DEMO_USERNAME])
  if (existing.rows[0]) return existing.rows[0].id

  const hashed = await bcrypt.hash(randomBytes(32).toString('hex'), 10)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // ON CONFLICT: two visitors clicking at the same moment both land here.
    const inserted = await client.query(
      `INSERT INTO users (username, password) VALUES ($1, $2)
       ON CONFLICT (username) DO NOTHING
       RETURNING id`,
      [DEMO_USERNAME, hashed]
    )
    if (!inserted.rows[0]) {
      await client.query('ROLLBACK')
      const again = await pool.query('SELECT id FROM users WHERE username = $1', [DEMO_USERNAME])
      return again.rows[0].id
    }
    const id = inserted.rows[0].id
    await client.query(
      `INSERT INTO targets (user_id, score_goal, putt_goal, fairway_goal, green_goal)
       VALUES ($1, 90, 36, 9, 9)`,
      [id]
    )
    await client.query(
      'INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)',
      [id, 'Demo Golfer']
    )
    await client.query('COMMIT')
    return id
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
