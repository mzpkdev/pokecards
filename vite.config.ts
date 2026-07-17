import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// base is '/' — this deploys to Cloudflare Pages, served at the domain root
// (e.g. https://pokecards.pages.dev/). Assets and the static database JSON are
// fetched via import.meta.env.BASE_URL, so they resolve correctly at root.
export default defineConfig({
  base: '/',
  plugins: [react()],
})
