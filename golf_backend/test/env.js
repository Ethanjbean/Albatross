// Loaded before anything touches the database. Points the backend at a
// separate TEST database so tests never see (or wipe) your real data.
//
// Uses your normal golf_backend/.env for host/user/password, but swaps the
// database name. Override with TEST_DB_NAME if you want a different one.

import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true })

process.env.DB_NAME = process.env.TEST_DB_NAME || 'golf_backend_test'
// db/index.js prefers DATABASE_URL over DB_*; drop it so tests can't hit a hosted DB.
delete process.env.DATABASE_URL

// Safety catch: tests TRUNCATE every table. Never let that hit the real DB.
if (!process.env.DB_NAME.endsWith('_test')) {
  throw new Error(`Refusing to run tests against "${process.env.DB_NAME}": the name must end in _test`)
}

// Fixed values so tests don't depend on your real secrets or ryzegolf account.
process.env.JWT_SECRET = 'test-secret'
process.env.RAPIDAPI_KEY = 'test-key'
process.env.RYZE_URL = 'https://ryze.test/search'
process.env.RYZE_HOST = 'ryze.test'

// High limits by default; the rate-limit tests lower these before loading the app.
process.env.LOOKUP_LIMIT_PER_USER = '1000'
process.env.LOOKUP_LIMIT_GLOBAL_DAILY = '1000'
process.env.DEMO_LIMIT_PER_IP = '1000'
delete process.env.DEMO_USERNAME // tests assume the default "demo"
