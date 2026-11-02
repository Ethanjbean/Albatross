import pool from '../db/index.js'

// Approximation of the World Handicap System. Not official:
//  - Hole-by-hole rounds cap each hole at par + 5 (the WHS rule for players
//    without an index). Real WHS uses net double bogey once you have one.
//  - Quick-log rounds can't be capped at all, so blowup holes count in full.
//  - 9-hole rounds don't count (WHS combines them with an expected score;
//    not worth building yet).
// Label it "est." in the UI.

const round1 = n => Math.round(n * 10) / 10

// WHS table: how many of your lowest differentials count, plus an adjustment,
// based on how many rounds you have (up to the last 20).
function lowestToUse(count) {
  if (count < 3) return null
  if (count === 3) return { use: 1, adj: -2.0 }
  if (count === 4) return { use: 1, adj: -1.0 }
  if (count === 5) return { use: 1, adj: 0 }
  if (count === 6) return { use: 2, adj: -1.0 }
  if (count <= 8) return { use: 2, adj: 0 }
  if (count <= 11) return { use: 3, adj: 0 }
  if (count <= 14) return { use: 4, adj: 0 }
  if (count <= 16) return { use: 5, adj: 0 }
  if (count <= 18) return { use: 6, adj: 0 }
  if (count === 19) return { use: 7, adj: 0 }
  return { use: 8, adj: 0 }
}

// Score used for the differential. With hole data, cap each hole at par + 5.
export function adjustedScore(totalScore, holes) {
  if (!holes?.length) return totalScore
  return holes.reduce((sum, h) => sum + Math.min(h.strokes, h.par + 5), 0)
}

// (113 / slope) x (adjusted score - course rating). Null when it can't count.
export function scoreDifferential({ adjusted, courseRating, slopeRating, holesPlayed }) {
  if (holesPlayed !== 18 || courseRating == null || !slopeRating) return null
  return round1((113 / slopeRating) * (adjusted - courseRating))
}

// Recompute and cache a user's index on profiles. Pass the transaction client
// so it lands in the same transaction as the round change.
export async function recalcHandicap(userId, client = pool) {
  const { rows } = await client.query(
    `SELECT score_differential::float AS diff
       FROM rounds
      WHERE user_id = $1 AND score_differential IS NOT NULL
      ORDER BY date_played DESC, id DESC
      LIMIT 20`,
    [userId]
  )

  const diffs = rows.map(r => r.diff)
  const rule = lowestToUse(diffs.length)

  let index = null
  if (rule) {
    const best = [...diffs].sort((a, b) => a - b).slice(0, rule.use)
    const avg = best.reduce((s, d) => s + d, 0) / best.length
    index = Math.min(round1(avg + rule.adj), 54.0)
  }

  await client.query(
    `INSERT INTO profiles (user_id, handicap_index, rounds_counted, handicap_updated)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id) DO UPDATE
       SET handicap_index = EXCLUDED.handicap_index,
           rounds_counted = EXCLUDED.rounds_counted,
           handicap_updated = EXCLUDED.handicap_updated`,
    [userId, index, diffs.length]
  )

  return index
}
