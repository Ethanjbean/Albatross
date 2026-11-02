// Loads golf_backend/.env no matter which folder the server is started from
// (`npm start` runs from the project root, where plain dotenv wouldn't find it).
// On a host there's no .env file; the dashboard's env vars are used instead.
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: fileURLToPath(new URL('./.env', import.meta.url)), quiet: true })
