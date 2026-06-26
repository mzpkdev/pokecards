import { describe, it, expect } from 'vitest'
import { formatRoleLabel } from './roleLabel'

// Smoke test for the test harness AND real coverage of the (tiny, pure) role
// label formatter. The raw role value must stay untouched everywhere it drives
// logic; this only verifies the DISPLAY transform.
describe('formatRoleLabel', () => {
  it('capitalizes a single word', () => {
    expect(formatRoleLabel('attacker')).toBe('Attacker')
  })

  it('capitalizes each hyphen-separated word', () => {
    expect(formatRoleLabel('energy-accel')).toBe('Energy-Accel')
  })

  it('leaves already-capitalized input stable', () => {
    expect(formatRoleLabel('Attacker')).toBe('Attacker')
  })

  it('handles empty + empty segments without throwing', () => {
    expect(formatRoleLabel('')).toBe('')
    expect(formatRoleLabel('a--b')).toBe('A--B')
  })
})
