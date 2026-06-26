// Registers @testing-library/jest-dom's custom matchers (e.g. toBeInTheDocument)
// on Vitest's `expect`. Loaded via vitest.config.ts `setupFiles`. Pure
// side-effect import — no exports.
import '@testing-library/jest-dom/vitest'
