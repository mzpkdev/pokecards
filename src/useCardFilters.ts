import { useMemo } from 'react'
import type { FilterableCard } from './data'

// ============================================================================
// useCardFilters — client-side search + faceted filtering for ONE category
// ----------------------------------------------------------------------------
// Filtering runs over the ALREADY-LOADED FilterableCard[] for the active tab
// only (never across categories). State lives entirely in the URL search params
// (react-router useSearchParams, which works inside HashRouter — the query is
// the part after `?` within the hash), so it survives refresh and is shareable.
//
// Faceted semantics:
//   • multiple values WITHIN one facet  → OR  (matches any selected value)
//   • across DIFFERENT facets           → AND (must pass every active facet)
//   • an empty / unset facet            → no constraint (matches everything)
//
// Facet options are derived DYNAMICALLY from the loaded data for this category
// (distinct values), so they stay correct per dataset and a facet that yields
// zero distinct values reports empty (the bar then hides it).
// ============================================================================

// URL param keys. Multi-value facets are comma-joined in a single param so the
// hash stays compact and shareable (e.g. ?type=Fire,Water&subtype=Stage%201).
export const PARAM = {
  q: 'q',
  type: 'type',
  subtype: 'subtype',
  set: 'set',
  series: 'series',
  role: 'role',
} as const

// The distinct option lists available for the active category. Each facet list
// is sorted for stable display; an empty list means the bar hides that facet
// (e.g. types on poketools, roles on specials).
export type FacetOptions = {
  types: string[]
  subtypes: string[]
  sets: string[]
  series: string[]
  roles: string[]
}

// The parsed, normalized filter state read out of the URL. Arrays are the
// selected values per facet (empty = unset).
export type CardFilters = {
  q: string
  types: string[]
  subtypes: string[]
  sets: string[]
  series: string[]
  roles: string[]
}

// Splits a comma-joined multi-value param into a clean string[] (trimmed,
// empties dropped). Order is preserved as authored in the URL.
function parseList(raw: string | null): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

// Case-insensitive OR membership: does any of the card's values match any of
// the selected values? An empty `selected` is "no constraint" → always true.
function matchesFacet(cardValues: string[], selectedLower: string[]): boolean {
  if (selectedLower.length === 0) return true
  for (const v of cardValues) {
    if (selectedLower.includes(v.toLowerCase())) return true
  }
  return false
}

// Reads the normalized CardFilters out of the URLSearchParams.
export function parseFilters(params: URLSearchParams): CardFilters {
  return {
    q: (params.get(PARAM.q) ?? '').trim(),
    types: parseList(params.get(PARAM.type)),
    subtypes: parseList(params.get(PARAM.subtype)),
    sets: parseList(params.get(PARAM.set)),
    series: parseList(params.get(PARAM.series)),
    roles: parseList(params.get(PARAM.role)),
  }
}

// How many facets are actively constraining the result set (for the "N active"
// badge + whether to show "clear all"). Each non-empty facet counts once; the
// text query counts once.
export function countActive(filters: CardFilters): number {
  let n = 0
  if (filters.q) n += 1
  if (filters.types.length) n += 1
  if (filters.subtypes.length) n += 1
  if (filters.sets.length) n += 1
  if (filters.series.length) n += 1
  if (filters.roles.length) n += 1
  return n
}

type UseCardFiltersResult = {
  // The filtered tiles to feed VirtuosoGrid (a shorter FilterableCard[]).
  filtered: FilterableCard[]
  // Distinct facet option lists derived from this category's data.
  options: FacetOptions
  // The parsed filter state (so the bar can render current selections).
  filters: CardFilters
  // Count of active facets (text + each non-empty facet) for the badge.
  activeCount: number
}

/**
 * Derives the facet option lists + the filtered tile array for the active
 * category. Options are memoized on `cards` (recomputed only when the loaded
 * dataset changes — i.e. per category), and the filtered array is memoized on
 * `cards` + the parsed filters, so typing/facet changes recompute only the
 * filter pass, not the option derivation.
 */
export function useCardFilters(
  cards: FilterableCard[],
  params: URLSearchParams,
): UseCardFiltersResult {
  // --- Derive distinct facet options from the loaded data --------------------
  const options = useMemo<FacetOptions>(() => {
    const types = new Set<string>()
    const subtypes = new Set<string>()
    const sets = new Set<string>()
    const series = new Set<string>()
    const roles = new Set<string>()

    for (const card of cards) {
      for (const t of card.types) types.add(t)
      for (const s of card.subtypes) subtypes.add(s)
      for (const s of card.sets) sets.add(s)
      for (const s of card.series) series.add(s)
      for (const r of card.roles) roles.add(r)
    }

    const sortAlpha = (a: string, b: string) => a.localeCompare(b)
    return {
      types: [...types].sort(sortAlpha),
      subtypes: [...subtypes].sort(sortAlpha),
      sets: [...sets].sort(sortAlpha),
      series: [...series].sort(sortAlpha),
      roles: [...roles].sort(sortAlpha),
    }
  }, [cards])

  // Parse the URL → normalized filters. Memoize on the serialized query STRING
  // (a primitive) so the parse re-runs only when the actual params change, never
  // on an unrelated re-render that hands us an equal-but-new params reference.
  const search = params.toString()
  const filters = useMemo(() => parseFilters(new URLSearchParams(search)), [search])

  // --- Apply the filter pass (substring query + AND-of-OR facets) ------------
  const filtered = useMemo(() => {
    const { q } = filters
    const query = q.toLowerCase()
    // Lowercase the selected facet values once (matching is case-insensitive).
    const typesLower = filters.types.map((v) => v.toLowerCase())
    const subtypesLower = filters.subtypes.map((v) => v.toLowerCase())
    const setsLower = filters.sets.map((v) => v.toLowerCase())
    const seriesLower = filters.series.map((v) => v.toLowerCase())
    const rolesLower = filters.roles.map((v) => v.toLowerCase())

    const noConstraints =
      !query &&
      typesLower.length === 0 &&
      subtypesLower.length === 0 &&
      setsLower.length === 0 &&
      seriesLower.length === 0 &&
      rolesLower.length === 0
    // Fast path: nothing selected → return the input array reference so
    // VirtuosoGrid sees an unchanged `data` prop (no needless re-render churn).
    if (noConstraints) return cards

    return cards.filter((card) => {
      if (query && !card.search.includes(query)) return false
      if (!matchesFacet(card.types, typesLower)) return false
      if (!matchesFacet(card.subtypes, subtypesLower)) return false
      if (!matchesFacet(card.sets, setsLower)) return false
      if (!matchesFacet(card.series, seriesLower)) return false
      if (!matchesFacet(card.roles, rolesLower)) return false
      return true
    })
  }, [cards, filters])

  return {
    filtered,
    options,
    filters,
    activeCount: countActive(filters),
  }
}
