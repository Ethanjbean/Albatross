import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // In dev, forward /api/* to Express so the frontend can use relative
    // URLs everywhere (see src/config.js).
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
