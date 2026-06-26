import { describe, it, expect } from 'vitest'
import { buildExportText } from './collectionExport'

describe('buildExportText', () => {
  it('renders one "<name> x<qty>" line per entry, sorted by name (not by key/qty)', () => {
    // Keys are deliberately ordered so that key order, qty order, and name order
    // all differ: by key it'd be [k1=Zapdos, k2=Articuno, k3=Mew]; by qty it'd
    // be [Articuno(5), Zapdos(2), Mew(1)]; the ONLY correct output is by name.
    const entries: [string, number][] = [
      ['k1', 2],
      ['k2', 5],
      ['k3', 1],
    ]
    const nameByKey = new Map<string, string>([
      ['k1', 'Zapdos'],
      ['k2', 'Articuno'],
      ['k3', 'Mew'],
    ])
    expect(buildExportText(entries, nameByKey)).toBe(
      'Articuno x5\nMew x1\nZapdos x2',
    )
  })

  it('skips a key absent from nameByKey (it contributes no line)', () => {
    const entries: [string, number][] = [
      ['known', 3],
      ['ghost', 9],
    ]
    const nameByKey = new Map<string, string>([['known', 'Pikachu']])
    // 'ghost' has no resolved name → dropped entirely; only the one line remains.
    expect(buildExportText(entries, nameByKey)).toBe('Pikachu x3')
  })

  it('returns an empty string for empty entries', () => {
    expect(buildExportText([], new Map())).toBe('')
  })

  it('sorts case-insensitively / locale-aware ("apple" before "Banana")', () => {
    // A plain ASCII codepoint sort would put uppercase "Banana" (B=66) before
    // lowercase "apple" (a=97); localeCompare puts "apple" first.
    const entries: [string, number][] = [
      ['b', 1],
      ['a', 1],
    ]
    const nameByKey = new Map<string, string>([
      ['b', 'Banana'],
      ['a', 'apple'],
    ])
    expect(buildExportText(entries, nameByKey)).toBe('apple x1\nBanana x1')
  })
})
