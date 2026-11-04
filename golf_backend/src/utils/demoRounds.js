// Sample rounds for the shared demo account, so "Try the demo" shows a real
// dashboard instead of an empty one.
//
// Every round is hole-by-hole, because the profile page (milestones, career
// totals, ugly stats) and the par 3/4/5 averages only read round_holes.
// Every round has a rating and slope, so they all count toward a handicap.
//
// The numbers come from a fixed-seed RNG: same golfer every time, only the
// dates move (they're counted back from today, so the demo never looks stale).
// The golfer drifts from ~93 to ~85 over the 20 rounds so the trend chart
// actually trends.

import { adjustedScore, scoreDifferential, recalcHandicap } from './handicap.js'

export const DEMO_ROUND_COUNT = 20

// Made-up courses. pars is the hole-by-hole layout; rating/slope are for the
// tee the demo golfer plays.
const COURSES = [
  {
    name: 'Cedar Ridge Golf Club', tee: 'White', rating: 70.6, slope: 126,
    pars: [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5],
  },
  {
    name: 'Riverbend Municipal', tee: 'White', rating: 68.9, slope: 118,
    pars: [4, 5, 4, 3, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4],
  },
  {
    name: 'Hawk Hollow Country Club', tee: 'Blue', rating: 72.3, slope: 133,
    pars: [5, 4, 4, 3, 4, 5, 4, 3, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4],
  },
  {
    name: 'Lakeside Links', tee: 'White', rating: 69.4, slope: 121,
    pars: [4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 4, 5, 3, 4, 4, 3, 5, 4],
  },
]

const NOTES = [
  'Driver was a disaster, irons saved me.',
  'Three-putted way too much. Unacceptable.',
  'Windy on the back nine.',
  'Best ball-striking day in a while.',
  'Chipping finally clicked.',
  'Lost two balls on the same hole. Character building.',
  'Early tee time, greens were quick.',
  'Hit it great, putted like a stranger.',
]

// Small seeded RNG (mulberry32): repeatable "random" numbers.
function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Weighted pick from [[value, weight], ...]
function weighted(rand, options) {
  const total = options.reduce((s, [, w]) => s + w, 0)
  let r = rand() * total
  for (const [value, w] of options) {
    if ((r -= w) < 0) return value
  }
  return options[options.length - 1][0]
}

const lerp = (a, b, t) => a + (b - a) * t

// 'YYYY-MM-DD' in local time (toISOString would use UTC and can slip a day).
function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const pad = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Per-hole randomness alone is too noisy to show a trend over 20 rounds, so
// each round gets a target score first, then holes are nudged to hit it.
function generateHoles(rand, pars, progress, target, forceEagleOn) {
  // Score vs par per hole. Better golfer later = more pars, fewer doubles.
  const over = pars.map((_, i) => i === forceEagleOn ? -2 : weighted(rand, [
    [-1, lerp(0.03, 0.07, progress)],
    [0, lerp(0.25, 0.40, progress)],
    [1, lerp(0.38, 0.35, progress)],
    [2, lerp(0.24, 0.14, progress)],
    [3, lerp(0.10, 0.04, progress)],
  ]))

  // Nudge random holes one stroke at a time until the card adds up to target.
  // The forced eagle is never touched, and holes stay between birdie and +4.
  const par = pars.reduce((s, p) => s + p, 0)
  const pickHole = (ok) => {
    const options = over.map((o, i) => i).filter((i) => i !== forceEagleOn && ok(over[i]))
    return options[Math.floor(rand() * options.length)]
  }
  let total = par + over.reduce((s, o) => s + o, 0)
  while (total > target) { over[pickHole((o) => o > -1)]--; total-- }
  while (total < target) { over[pickHole((o) => o < 4)]++; total++ }

  return pars.map((par, i) => {
    const overPar = over[i]
    const strokes = par + overPar

    // Putts: mostly two, the odd one-putt or three-putt. Never more putts
    // than strokes - 1 (something has to get it onto the green).
    let putts = weighted(rand, [[1, 0.17], [2, 0.63], [3, 0.18], [4, 0.02]])
    putts = Math.max(1, Math.min(putts, strokes - 1))

    // On in regulation = reached the green in par - 2 or fewer.
    const gir = strokes - putts <= par - 2

    // Fairways don't exist on par 3s. Better holes are likelier to start in the short grass.
    const fairway_hit = par === 3 ? null : rand() < lerp(0.38, 0.55, progress) + (overPar <= 0 ? 0.15 : 0)

    // Blow-up holes sometimes come with a penalty stroke.
    const penalties = overPar >= 2 && rand() < 0.45 ? 1 : 0

    return { hole_number: i + 1, par, strokes, putts, fairway_hit, gir, penalties }
  })
}

// Builds the rounds in memory, oldest first. Exported for tests.
export function generateDemoRounds(count = DEMO_ROUND_COUNT, seed = 1931) {
  const rand = seededRandom(seed)
  const rounds = []

  for (let i = 0; i < count; i++) {
    const progress = count > 1 ? i / (count - 1) : 1
    const course = COURSES[Math.floor(rand() * COURSES.length)]

    // One eagle around two-thirds of the way in, on the first par 5, so the
    // milestones page has something to brag about. No hole in one: leaving
    // it empty shows what an unearned milestone looks like.
    const eagleRound = Math.floor(count * 0.65)
    const forceEagleOn = i === eagleRound ? course.pars.indexOf(5) : -1

    // ~93 at the start, ~85 by the end, with a bad day or a good one mixed in.
    const target = Math.round(lerp(93, 85, progress) + (rand() - 0.5) * 6)
    const holes = generateHoles(rand, course.pars, progress, target, forceEagleOn)
    const sum = (pick) => holes.reduce((s, h) => s + pick(h), 0)
    const fairwayHoles = holes.filter((h) => h.fairway_hit != null)
    const total_score = sum((h) => h.strokes)

    rounds.push({
      course_name: course.name,
      tee_name: course.tee,
      course_rating: course.rating,
      slope_rating: course.slope,
      course_par: sum((h) => h.par),
      holes_played: 18,
      // ~one round every 9 days, oldest about 6 months back
      date_played: daysAgo((count - 1 - i) * 9 + Math.floor(rand() * 4)),
      total_score,
      total_putts: sum((h) => h.putts),
      fairways_hit: fairwayHoles.filter((h) => h.fairway_hit).length,
      fairways_possible: fairwayHoles.length,
      greens_in_reg: holes.filter((h) => h.gir).length,
      penalties: sum((h) => h.penalties),
      score_differential: scoreDifferential({
        adjusted: adjustedScore(total_score, holes),
        courseRating: course.rating,
        slopeRating: course.slope,
        holesPlayed: 18,
      }),
      notes: rand() < 0.4 ? NOTES[Math.floor(rand() * NOTES.length)] : null,
      holes,
    })
  }
  return rounds
}

const ROUND_COLS = [
  'course_name', 'tee_name', 'course_rating', 'slope_rating', 'course_par',
  'holes_played', 'date_played', 'total_score', 'total_putts', 'fairways_hit',
  'fairways_possible', 'greens_in_reg', 'penalties', 'score_differential', 'notes',
]

// Inserts the rounds (and their holes) for userId, then refreshes the cached
// handicap. Pass a client that's inside a transaction so it's all-or-nothing.
export async function seedDemoRounds(client, userId, count = DEMO_ROUND_COUNT) {
  const rounds = generateDemoRounds(count)
  const placeholders = ROUND_COLS.map((_, i) => `$${i + 2}`).join(', ')

  for (const round of rounds) {
    const { rows } = await client.query(
      `INSERT INTO rounds (user_id, ${ROUND_COLS.join(', ')})
       VALUES ($1, ${placeholders}) RETURNING id`,
      [userId, ...ROUND_COLS.map((c) => round[c])]
    )
    const roundId = rows[0].id

    // All 18 holes in one statement instead of 18 round trips.
    const values = []
    const tuples = round.holes.map((h, i) => {
      values.push(roundId, h.hole_number, h.par, h.strokes, h.putts, h.fairway_hit, h.gir, h.penalties)
      const b = i * 8
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8})`
    })
    await client.query(
      `INSERT INTO round_holes (round_id, hole_number, par, strokes, putts, fairway_hit, gir, penalties)
       VALUES ${tuples.join(', ')}`,
      values
    )
  }

  await recalcHandicap(userId, client)
  return rounds.length
}
