// Wipes the demo account's rounds and loads a fresh set of sample rounds.
// The /demo route already seeds an empty demo account on its own; this is for
// when you've changed the sample data and want the live demo to pick it up.
//
// Run from the project root:
//   node golf_backend/src/scripts/seed-demo.js          (20 rounds)
//   node golf_backend/src/scripts/seed-demo.js 30       (any count)
//
// Creates the demo account first if it doesn't exist yet.

import '../../loadEnv.js'
import pool from '../db/index.js'
import { DEMO_USERNAME, ensureDemoUser } from '../utils/demo.js'
import { seedDemoRounds, DEMO_ROUND_COUNT } from '../utils/demoRounds.js'

const count = Number.parseInt(process.argv[2], 10) || DEMO_ROUND_COUNT

async function main() {
  const id = await ensureDemoUser()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // round_holes rows go with their rounds (ON DELETE CASCADE)
    const { rowCount: removed } = await client.query('DELETE FROM rounds WHERE user_id = $1', [id])
    const added = await seedDemoRounds(client, id, count)
    await client.query('COMMIT')

    const { rows } = await pool.query(
      'SELECT handicap_index::float AS hcp, rounds_counted FROM profiles WHERE user_id = $1',
      [id]
    )
    console.log(`"${DEMO_USERNAME}" (user ${id}): removed ${removed} rounds, added ${added}.`)
    console.log(`Handicap index: ${rows[0]?.hcp ?? 'none'} from ${rows[0]?.rounds_counted ?? 0} rounds.`)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

main()
  .catch((err) => {
    console.error('Seeding failed:', err.message)
    process.exitCode = 1
  })
  .finally(() => pool.end())
