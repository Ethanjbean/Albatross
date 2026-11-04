// The shared, read-only demo account behind the "Try the demo" button.
//
// Anyone can get a demo token without a password. The token carries
// demo: true, and verifyToken rejects every write request made with it,
// so visitors can look around but never change the demo data.

import bcrypt from 'bcrypt'
import { randomBytes } from 'node:crypto'
import pool from '../db/index.js'
import { seedDemoRounds } from './demoRounds.js'

export const DEMO_USERNAME = process.env.DEMO_USERNAME || 'demo'

// Demo sessions are short; the button gets a fresh token any time.
export const DEMO_TOKEN_TTL = '1h'

export const DEMO_READ_ONLY_MESSAGE =
  'The demo is read-only. Create an account to save your own rounds.'

// Case-insensitive, so nobody can register "Demo" and pass as the demo account.
export const isDemoUsername = (name) =>
  typeof name === 'string' && name.trim().toLowerCase() === DEMO_USERNAME.toLowerCase()

// Any fixed number works; it just has to be the same for every caller.
const DEMO_SETUP_LOCK = 31_100_131

// Returns the demo user's id, creating the account (with default targets, a
// profile and sample rounds) the first time it's needed. If the account
// exists but has no rounds (made before seeding existed, or wiped by hand),
// it gets refilled. The password is random and thrown away: the demo account
// can only be entered through /demo.
export async function ensureDemoUser() {
  // Fast path for every click after the first: one query, no transaction.
  const existing = await pool.query(
    `SELECT u.id, EXISTS (SELECT 1 FROM rounds r WHERE r.user_id = u.id) AS has_rounds
       FROM users u WHERE u.username = $1`,
    [DEMO_USERNAME]
  )
  if (existing.rows[0]?.has_rounds) return existing.rows[0].id

  const hashed = await bcrypt.hash(randomBytes(32).toString('hex'), 10)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Two visitors clicking at the same moment both land here. The lock makes
    // the second one wait, then see the first one's finished account, so the
    // demo never ends up with 40 rounds. It releases itself at COMMIT/ROLLBACK.
    await client.query('SELECT pg_advisory_xact_lock($1)', [DEMO_SETUP_LOCK])

    let id = (await client.query('SELECT id FROM users WHERE username = $1', [DEMO_USERNAME])).rows[0]?.id
    if (!id) {
      id = (await client.query(
        'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id',
        [DEMO_USERNAME, hashed]
      )).rows[0].id
      await client.query(
        `INSERT INTO targets (user_id, score_goal, putt_goal, fairway_goal, green_goal)
         VALUES ($1, 90, 36, 9, 9)`,
        [id]
      )
    }
    // Upsert: an older demo account may be missing its profile row.
    await client.query(
      `INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET display_name = COALESCE(profiles.display_name, EXCLUDED.display_name)`,
      [id, 'Demo Golfer']
    )

    const hasRounds = (await client.query('SELECT 1 FROM rounds WHERE user_id = $1 LIMIT 1', [id])).rows.length
    if (!hasRounds) await seedDemoRounds(client, id)

    await client.query('COMMIT')
    return id
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
