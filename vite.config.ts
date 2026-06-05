import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// base is '/pokecards/' because this deploys to a GitHub Pages *project* page
// served at https://mzpkdev.github.io/pokecards/
export default defineConfig({
  base: '/pokecards/',
  plugins: [react()],
})
