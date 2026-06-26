import { describe, it, expect } from 'vitest'
import type { Printing } from './types'
import { isSpecialPrinting, sortPrintings, seriesOf, genOf, UNKNOWN_GEN, thumbnailUrl } from './data'

// Small helper to build a Printing with only the fields under test mattering.
// `set` and `image` never affect classification, so they default to dummies.
const makePrinting = (id: string, number: string): Printing => ({
  id,
  set: 'Test Set',
  number,
  image: 'https://example.test/img.png',
})

describe('isSpecialPrinting', () => {
  it('returns true when the id is in the curated full-art allow-list (overrides the numeric heuristic)', () => {
    // swsh1-213 is curated; its number "213" is a PLAIN numeric (no letter
    // prefix) and the id has no alt-art suffix — so only rule (a) can flag it.
    expect(isSpecialPrinting(makePrinting('swsh1-213', '213'))).toBe(true)
  })

  it('returns true when the number has a 2+ letter prefix', () => {
    expect(isSpecialPrinting(makePrinting('swsh4-SV001', 'SV001'))).toBe(true)
    expect(isSpecialPrinting(makePrinting('swsh9-TG12', 'TG12'))).toBe(true)
    expect(isSpecialPrinting(makePrinting('swsh7-GG30', 'GG30'))).toBe(true)
  })

  it('returns true when the id ends in an alt-art suffix', () => {
    expect(isSpecialPrinting(makePrinting('cel25c-4_A', '4'))).toBe(true)
    expect(isSpecialPrinting(makePrinting('cel25c-15_A3', '15'))).toBe(true)
  })

  it('returns false for a plain normal printing', () => {
    expect(isSpecialPrinting(makePrinting('sv1-1', '1'))).toBe(false)
  })
})

describe('sortPrintings', () => {
  it('puts all normals before all specials', () => {
    const normal = makePrinting('sv1-1', '1')
    const special = makePrinting('swsh9-TG12', 'TG12')
    const sorted = sortPrintings([special, normal])
    expect(sorted).toEqual([normal, special])
  })

  it('preserves input order within each group (stable partition)', () => {
    const n1 = makePrinting('sv1-1', '1')
    const s1 = makePrinting('swsh9-TG12', 'TG12')
    const n2 = makePrinting('sv1-2', '2')
    const s2 = makePrinting('cel25c-4_A', '4')
    // Interleaved input: normal, special, normal, special.
    const sorted = sortPrintings([n1, s1, n2, s2])
    // Normals keep n1-before-n2; specials keep s1-before-s2.
    expect(sorted).toEqual([n1, n2, s1, s2])
  })

  it('returns a new array and does not mutate the input', () => {
    const n1 = makePrinting('sv1-1', '1')
    const s1 = makePrinting('swsh9-TG12', 'TG12')
    const input = [n1, s1]
    const inputRef = input
    const sorted = sortPrintings(input)
    // New array reference.
    expect(sorted).not.toBe(input)
    // Input reference + contents unchanged (order and elements).
    expect(input).toBe(inputRef)
    expect(input).toEqual([n1, s1])
    expect(input[0]).toBe(n1)
    expect(input[1]).toBe(s1)
  })

  it('returns [] for empty input', () => {
    expect(sortPrintings([])).toEqual([])
  })
})

describe('seriesOf', () => {
  it('maps the sv / rsv / zsv families to "Scarlet & Violet"', () => {
    expect(seriesOf('sv1-1')).toBe('Scarlet & Violet')
    expect(seriesOf('rsv10pt5-81')).toBe('Scarlet & Violet')
    expect(seriesOf('zsv10pt5-82')).toBe('Scarlet & Violet')
  })

  it('maps the swsh family to "Sword & Shield"', () => {
    expect(seriesOf('swsh1-22')).toBe('Sword & Shield')
  })

  it('maps the cel family to "Celebrations" (with alt-art suffix)', () => {
    expect(seriesOf('cel25c-4_A')).toBe('Celebrations')
  })

  it('maps the pgo family to "Pokémon GO"', () => {
    expect(seriesOf('pgo-1')).toBe('Pokémon GO')
  })

  it('maps the me family to "Mega Evolution"', () => {
    expect(seriesOf('me2-85')).toBe('Mega Evolution')
  })

  it('maps the sm / smp / sma families to "Sun & Moon"', () => {
    expect(seriesOf('sm1-1')).toBe('Sun & Moon')
    expect(seriesOf('smp-SM01')).toBe('Sun & Moon')
    expect(seriesOf('sma-SV1')).toBe('Sun & Moon')
  })

  it('strips digits/suffix from the setcode to reach the alpha family', () => {
    // sv6pt5 → "sv" → Scarlet & Violet.
    expect(seriesOf('sv6pt5-54')).toBe('Scarlet & Violet')
  })

  it('falls back to "Other" for an unknown family', () => {
    expect(seriesOf('xy1-1')).toBe('Other')
  })

  it('does not throw on a malformed id and returns "Other"', () => {
    expect(seriesOf('')).toBe('Other')
  })
})

describe('genOf', () => {
  it('maps numbers to their generation at the range boundaries', () => {
    expect(genOf(1)).toBe('Gen 1')
    expect(genOf(151)).toBe('Gen 1')
    expect(genOf(152)).toBe('Gen 2')
    expect(genOf(905)).toBe('Gen 8')
    expect(genOf(906)).toBe('Gen 9')
    expect(genOf(1025)).toBe('Gen 9')
  })

  it('returns UNKNOWN_GEN for 0, NaN, and out-of-range numbers', () => {
    expect(genOf(0)).toBe(UNKNOWN_GEN)
    expect(genOf(NaN)).toBe(UNKNOWN_GEN)
    expect(genOf(9999)).toBe(UNKNOWN_GEN)
  })
})

describe('thumbnailUrl', () => {
  it('rewrites a pokemontcg.io _hires.png URL to its smaller .png variant', () => {
    expect(thumbnailUrl('https://images.pokemontcg.io/sv1/1_hires.png')).toBe(
      'https://images.pokemontcg.io/sv1/1.png',
    )
  })

  it('rewrites a scrydex /large URL to its /medium variant', () => {
    expect(
      thumbnailUrl('https://images.scrydex.com/pokemon/me2pt5-129/large'),
    ).toBe('https://images.scrydex.com/pokemon/me2pt5-129/medium')
  })

  it('returns an empty string unchanged', () => {
    expect(thumbnailUrl('')).toBe('')
  })

  it('returns a non-matching local asset path unchanged', () => {
    expect(thumbnailUrl('/pokecards/assets/pikachu.png')).toBe(
      '/pokecards/assets/pikachu.png',
    )
  })

  it('leaves a URL that merely contains "large" mid-path unchanged (end-anchored)', () => {
    // "large" appears mid-path but the URL does not END in /large, so the
    // scrydex rewrite must not fire — it's returned verbatim.
    const url = 'https://images.scrydex.com/pokemon/large-set-1/medium'
    expect(thumbnailUrl(url)).toBe(url)
  })
})
