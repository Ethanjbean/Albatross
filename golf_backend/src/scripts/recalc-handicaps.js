// Recomputes score_differential for every round, then every user's cached
// handicap_index on profiles. Use after inserting/editing rounds by hand in SQL,
// since only the API routes keep those values up to date.
//
// Run from the golf_backend folder:   node src/scripts/recalc-handicaps.js
//
// Prints each round and why it does or doesn't count toward a handicap.

import pool from '../db/index.js'
import { adjustedScore, scoreDifferential, recalcHandicap } from '../utils/handicap.js'

function whyNot(r) {
  if (r.holes_played !== 18) return `${r.holes_played}-hole round`
  if (r.course_rating == null) return 'no course_rating'
  if (!r.slope_rating) return 'no slope_rating'
  return null
}

async function main() {
  // Make sure every user has a profile row, or recalcHandicap has nothing to show.
  await pool.query(
    `INSERT INTO profiles (user_id) SELECT id FROM users ON CONFLICT (user_id) DO NOTHING`
  )

  const { rows: rounds } = await pool.query(
    `SELECT r.id, r.user_id, u.username, r.course_name, r.tee_name, r.date_played,
            r.holes_played, r.total_score, r.course_rating::float AS course_rating,
            r.slope_rating, r.score_differential::float AS old_diff
       FROM rounds r JOIN users u ON u.id = r.user_id
      ORDER BY u.username, r.date_played, r.id`
  )

  const report = []
  for (const r of rounds) {
    const { rows: holes } = await pool.query(
      'SELECT strokes, par FROM round_holes WHERE round_id = $1',
      [r.id]
    )
    const diff = scoreDifferential({
      adjusted: adjustedScore(r.total_score, holes),
      courseRating: r.course_rating,
      slopeRating: r.slope_rating,
      holesPlayed: r.holes_played,
    })
    if (diff !== r.old_diff) {
      await pool.query('UPDATE rounds SET score_differential = $1 WHERE id = $2', [diff, r.id])
    }
    report.push({
      user: r.username,
      round: r.id,
      date: r.date_played?.toISOString?.().slice(0, 10) ?? r.date_played,
      course: r.course_name.slice(0, 28),
      tee: r.tee_name,
      holes: r.holes_played,
      score: r.total_score,
      rating: r.course_rating,
      slope: r.slope_rating,
      diff,
      counts: diff == null ? `NO (${whyNot(r)})` : 'yes',
    })
  }
  console.table(report)

  const { rows: users } = await pool.query('SELECT id, username FROM users ORDER BY username')
  const summary = []
  for (const u of users) {
    const index = await recalcHandicap(u.id)
    const eligible = report.filter(x => x.user === u.username && x.diff != null).length
    summary.push({ user: u.username, eligible_rounds: eligible, handicap_index: index })
  }
  console.table(summary)
}

main()
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => pool.end())
