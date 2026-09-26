import netlify from '@netlify/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Netlify plugin runs netlify/functions locally under `npm run dev`,
// so /api/app-store works the same in dev as in production.
export default defineConfig({
  plugins: [react(), netlify()],
})
