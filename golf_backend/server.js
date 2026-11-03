// Must be the first import: ES module imports run before any code in this file,
// so the old dotenv.config() call ran AFTER the route files had already loaded.
import './loadEnv.js'
import express from 'express'
import cors from 'cors'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import authRoutes from './src/routes/auth.js'
import roundRoutes from './src/routes/rounds.js'
import targetRoutes from './src/routes/targets.js'
import coursesRouter from './src/routes/courses.js'
import profileRoutes from './src/routes/profiles.js'

// Fail fast on a missing secret instead of crashing on the first login.
const required = ['JWT_SECRET', 'RAPIDAPI_KEY', 'RYZE_URL', 'RYZE_HOST']
const missing = required.filter((k) => !process.env[k])
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(', ')}. See golf_backend/.env.example`)
  process.exit(1)
}

const app = express()

// Railway (like most hosts) sits behind one proxy. Trusting it makes req.ip
// the visitor's real IP, which the per-IP demo rate limit depends on.
app.set('trust proxy', 1)

// CORS_ORIGIN: comma-separated sites allowed to call the API, e.g.
// https://albatross.onrender.com. Unset = any origin (fine locally, and not
// needed at all once Express serves the frontend from the same site).
const origins = process.env.CORS_ORIGIN?.split(',').map((s) => s.trim())
app.use(cors(origins ? { origin: origins } : undefined))
app.use(express.json())

app.use('/api/auth', authRoutes)
// One mount covers /api/rounds/stats, /lim8, /all, etc. — the router handles sub-paths.
app.use('/api/rounds', roundRoutes)
app.use('/api/targets', targetRoutes)
app.use('/api/courses', coursesRouter)
app.use('/api/profiles', profileRoutes)

// Unknown /api paths get a JSON 404 instead of falling through to the React app.
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }))

// Serve the built React app (created by `npm run build`) from the same server.
// Only kicks in when dist/ exists, so local dev with Vite is unaffected.
const distDir = fileURLToPath(new URL('../dist', import.meta.url))
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  // react-router handles /stats, /rounds/12, etc. in the browser, so any other
  // GET returns index.html. Without this, refreshing on a nested page 404s.
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next()
    res.sendFile('index.html', { root: distDir })
  })
}

// Hosts assign the port through PORT; 3000 is the local default.
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})