import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config({ quiet: true })

// Hosted Postgres (Render, Railway, Neon, Supabase...) hands you one
// DATABASE_URL. Locally you can keep using the separate DB_* vars.
// Set DB_SSL=true if your host requires SSL (most do for external connections).
const ssl = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false

const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl })
  : new pg.Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl,
    })

export default pool