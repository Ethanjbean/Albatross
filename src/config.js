// Where the frontend sends API requests.
//
// Leave VITE_API_URL unset (the normal case): requests go to /api on the same
// site. In dev, Vite's proxy (vite.config.js) forwards them to Express; in
// production, Express serves the frontend itself, so /api is already right.
//
// Only set VITE_API_URL if the frontend and backend live on different hosts,
// e.g. VITE_API_URL=https://albatross-api.onrender.com (no trailing slash).
// Vite bakes it in at build time, so set it before `npm run build`.
export const API_URL = import.meta.env.VITE_API_URL ?? ''
