import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Standalone Vitest config — deliberately SEPARATE from vite.config.ts so the
// production build (`vite build`) never imports anything vitest-related; Vitest
// loads this file directly. The React plugin gives test files the same TSX/JSX
// transform the app uses. We keep `globals: false` and import { describe, it,
// expect } explicitly in each test (no ambient globals to wire into tsconfig).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
