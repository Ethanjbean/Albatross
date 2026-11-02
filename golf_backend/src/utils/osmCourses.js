import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// The same OpenStreetMap course list the search bar uses (public/courses-search.json).
// Loaded once at startup so the backend decides what name/city/state to search
// ryzegolf with. Never trust those from the client: the result gets cached for everyone.
const FILE = fileURLToPath(new URL('../../../public/courses-search.json', import.meta.url))

const byId = new Map()
for (const c of JSON.parse(readFileSync(FILE, 'utf8'))) {
  byId.set(c.id, { id: c.id, name: c.name, city: c.city ?? null, state: c.state ?? null })
}

// 'way/29357224' -> { id, name, city, state } or undefined
export const getOsmCourse = id => byId.get(id)
