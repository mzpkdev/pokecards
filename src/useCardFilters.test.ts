import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { FilterableCard } from './data'
import {
  parseList,
  matchesFacet,
  parseFilters,
  countActive,
  useCardFilters,
  type CardFilters,
} from './useCardFilters'

// --- Test fixtures ---------------------------------------------------------
// A minimal FilterableCard builder. Only the facet/search fields are exercised
// by the filter logic; `tile` is a heavyweight PokemonCard we never read here,
// so we cast a stub through unknown to keep the fixture small.
function makeCard(overrides: Partial<FilterableCard> & { search?: string }): FilterableCard {
  return {
    tile: { id: overrides.search ?? 'stub' } as unknown as FilterableCard['tile'],
    subtypes: [],
    roles: [],
    types: [],
    sets: [],
    series: [],
    cardClass: [],
    generations: [],
    search: '',
    ...overrides,
  }
}

// Build a CardFilters with all facets empty, overriding selectively.
function makeFilters(overrides: Partial<CardFilters> = {}): CardFilters {
  return {
    q: '',
    types: [],
    subtypes: [],
    sets: [],
    series: [],
    roles: [],
    cardClasses: [],
    generations: [],
    ...overrides,
  }
}

// ===========================================================================
// A) parseList
// ===========================================================================
describe('parseList', () => {
  it('returns [] for null', () => {
    expect(parseList(null)).toEqual([])
  })

  it('returns [] for an empty string', () => {
    expect(parseList('')).toEqual([])
  })

  it('splits, trims, and drops empties while preserving order', () => {
    expect(parseList('a,b , c')).toEqual(['a', 'b', 'c'])
  })

  it('drops empty segments from consecutive commas', () => {
    expect(parseList('a,,b')).toEqual(['a', 'b'])
  })

  it('preserves authored order', () => {
    expect(parseList('c,a,b')).toEqual(['c', 'a', 'b'])
  })
})

// ===========================================================================
// B) parseFilters
// ===========================================================================
describe('parseFilters', () => {
  it('parses q + multi-value facets, leaving other facets empty', () => {
    const params = new URLSearchParams('q=pika&type=Fire,Water&gen=Gen+1&role=attacker')
    expect(parseFilters(params)).toEqual({
      q: 'pika',
      types: ['Fire', 'Water'],
      generations: ['Gen 1'],
      roles: ['attacker'],
      subtypes: [],
      sets: [],
      series: [],
      cardClasses: [],
    })
  })

  it('trims the q query', () => {
    const params = new URLSearchParams('q=%20pika%20')
    expect(parseFilters(params).q).toBe('pika')
  })

  it('returns all-empty filters with q:"" for empty params', () => {
    expect(parseFilters(new URLSearchParams())).toEqual(makeFilters())
  })
})

// ===========================================================================
// C) matchesFacet
// ===========================================================================
describe('matchesFacet', () => {
  it('returns true when no facet values are selected (no constraint)', () => {
    expect(matchesFacet(['Fire'], [])).toBe(true)
    expect(matchesFacet([], [])).toBe(true)
  })

  it('matches case-insensitively (selected assumed lowercased, cardValues lowercased inside)', () => {
    expect(matchesFacet(['Fire'], ['fire'])).toBe(true)
  })

  it('returns true on OR membership when any card value matches', () => {
    expect(matchesFacet(['Fire', 'Flying'], ['water', 'flying'])).toBe(true)
  })

  it('returns false when there is no overlap', () => {
    expect(matchesFacet(['Fire'], ['water'])).toBe(false)
  })

  it('returns false for empty cardValues against a non-empty selection', () => {
    expect(matchesFacet([], ['fire'])).toBe(false)
  })
})

// ===========================================================================
// D) countActive
// ===========================================================================
describe('countActive', () => {
  it('returns 0 for all-empty filters', () => {
    expect(countActive(makeFilters())).toBe(0)
  })

  it('counts only q when only q is set', () => {
    expect(countActive(makeFilters({ q: 'pika' }))).toBe(1)
  })

  it('counts q + two non-empty facets as 3', () => {
    expect(
      countActive(makeFilters({ q: 'pika', types: ['Fire'], generations: ['Gen 1'] })),
    ).toBe(3)
  })

  it('counts each non-empty facet exactly once (regardless of value count)', () => {
    expect(countActive(makeFilters({ types: ['Fire', 'Water', 'Grass'] }))).toBe(1)
  })

  it('counts every facet when all are set', () => {
    expect(
      countActive(
        makeFilters({
          q: 'x',
          types: ['Fire'],
          subtypes: ['Basic'],
          sets: ['Base'],
          series: ['Base'],
          roles: ['attacker'],
          cardClasses: ['ex'],
          generations: ['Gen 1'],
        }),
      ),
    ).toBe(8)
  })
})

// ===========================================================================
// E) useCardFilters hook integration
// ===========================================================================
describe('useCardFilters', () => {
  const cards: FilterableCard[] = [
    makeCard({
      search: 'pikachu electric',
      types: ['Lightning'],
      generations: ['Gen 1'],
      roles: ['attacker'],
    }),
    makeCard({
      search: 'charizard fire',
      types: ['Fire'],
      generations: ['Gen 1'],
      roles: ['attacker'],
    }),
    makeCard({
      search: 'blastoise water',
      types: ['Water'],
      generations: ['Gen 1'],
      roles: ['defender'],
    }),
    makeCard({
      search: 'lugia psychic',
      types: ['Psychic'],
      generations: ['Gen 2'],
      roles: ['attacker'],
    }),
  ]

  it('ANDs across facets and ORs within a facet', () => {
    // gen=Gen 1 (AND) with type in {Fire,Water} (OR within type) →
    // charizard (Fire/Gen1) + blastoise (Water/Gen1); pikachu (Gen1 Lightning)
    // and lugia (Gen2 Psychic) excluded.
    const params = new URLSearchParams('type=Fire,Water&gen=Gen+1')
    const { result } = renderHook(() => useCardFilters(cards, params))
    expect(result.current.filtered.map((c) => c.search)).toEqual([
      'charizard fire',
      'blastoise water',
    ])
  })

  it('matches q against the lowercased search blob as a substring', () => {
    const params = new URLSearchParams('q=fire')
    const { result } = renderHook(() => useCardFilters(cards, params))
    // "fire" appears in charizard's blob; matching lowercases the query.
    expect(result.current.filtered.map((c) => c.search)).toEqual(['charizard fire'])
  })

  it('matches q case-insensitively (query lowercased before substring test)', () => {
    const params = new URLSearchParams('q=PIKA')
    const { result } = renderHook(() => useCardFilters(cards, params))
    expect(result.current.filtered.map((c) => c.search)).toEqual(['pikachu electric'])
  })

  it('FAST PATH: returns the SAME array reference when no filters are set', () => {
    const params = new URLSearchParams()
    const { result } = renderHook(() => useCardFilters(cards, params))
    expect(result.current.filtered).toBe(cards)
  })

  it('derives distinct sorted facet options, with generations sorted numerically and Unknown last', () => {
    const genCards: FilterableCard[] = [
      makeCard({ types: ['Water'], generations: ['Gen 10'] }),
      makeCard({ types: ['Fire'], generations: ['Gen 2'] }),
      makeCard({ types: ['Fire'], generations: ['Unknown'] }),
    ]
    const { result } = renderHook(() => useCardFilters(genCards, new URLSearchParams()))
    // types alpha-sorted + deduped
    expect(result.current.options.types).toEqual(['Fire', 'Water'])
    // generations numeric sort with Unknown pinned last (NOT alpha: Gen 10 < Gen 2 alpha)
    expect(result.current.options.generations).toEqual(['Gen 2', 'Gen 10', 'Unknown'])
  })

  it('reports the active count and parsed filters', () => {
    const params = new URLSearchParams('q=fire&type=Fire')
    const { result } = renderHook(() => useCardFilters(cards, params))
    expect(result.current.activeCount).toBe(2)
    expect(result.current.filters.q).toBe('fire')
    expect(result.current.filters.types).toEqual(['Fire'])
  })
})
