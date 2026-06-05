import { useMemo } from 'react'
import type { FilterableCard } from './data'
import { isSwordShieldEnabled, SWORD_SHIELD_SERIES } from './featureFlags'

// ----------------------------------------------------------------------------
// Sword & Shield gating (UI layer). When the S&S feature flag is OFF we hide
// S&S content WITHOUT touching the data layer:
//   • PURELY-S&S cards (every entry of series[] is "Sword & Shield") are dropped
//     from both the filtered results and facet-option derivation.
//   • CROSS-SERIES cards (S&S plus ≥1 other series) are KEPT — they remain
//     reachable via their non-S&S printings — so only purely-S&S cards vanish.
//   • "Sword & Shield" is removed from the Series facet options (it would still
//     leak in via the kept cross-series cards' series[]), and S&S-only set names
//     are removed from the Set facet options.
// All of this is derived from the card-level series[]/sets[] already on
// FilterableCard plus the shared seriesOf classification — no data.ts edits.
// ----------------------------------------------------------------------------

// A card is "purely Sword & Shield" when it has at least one S&S printing AND
// every series it spans is S&S. Such cards are hidden while the flag is off;
// cross-series cards (this returns false for them) are kept.
function isPurelySwordShield(card: FilterableCard): boolean {
  return (
    card.series.includes(SWORD_SHIELD_SERIES) &&
    card.series.every((s) => s === SWORD_SHIELD_SERIES)
  )
}

// The set names that belong exclusively to the Sword & Shield series, derived
// purely from the data: the union of every set name carried by a purely-S&S
// card. Because S&S set names never appear on a non-S&S printing (each set lives
// in exactly one series), this union is exactly the S&S-only set list — so it's
// safe to remove these from the Set facet options without dropping any set that
// a surviving (non-S&S) printing legitimately uses. Cross-series cards still
// list their S&S set names in sets[], so this denylist is what removes those.
function swordShieldOnlySets(cards: FilterableCard[]): Set<string> {
  const out = new Set<string>()
  for (const card of cards) {
    if (isPurelySwordShield(card)) {
      for (const set of card.sets) out.add(set)
    }
  }
  return out
}

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
  // Effective S&S flag, read PER-RENDER (window override → hardcoded default).
  // Captured here and threaded through every memo's dependency list so a console
  // flip of `window.IS_SWORD_N_SHIELD_ENABLED` followed by a re-render/navigation
  // recomputes the visible cards/options/filtered pass with no rebuild.
  const ssEnabled = isSwordShieldEnabled()

  // The card universe the rest of the hook sees. With the flag OFF, purely-S&S
  // cards are dropped up front so they're absent from BOTH the filtered results
  // and the facet-option derivation; cross-series cards are retained. With the
  // flag ON this is the original array reference (no filtering, no churn).
  const visibleCards = useMemo<FilterableCard[]>(() => {
    if (ssEnabled) return cards
    return cards.filter((card) => !isPurelySwordShield(card))
  }, [cards, ssEnabled])

  // --- Derive distinct facet options from the (S&S-gated) data ---------------
  const options = useMemo<FacetOptions>(() => {
    const types = new Set<string>()
    const subtypes = new Set<string>()
    const sets = new Set<string>()
    const series = new Set<string>()
    const roles = new Set<string>()

    // With the flag off, suppress "Sword & Shield" from the Series facet (it
    // would otherwise leak in via the kept cross-series cards) and the S&S-only
    // set names from the Set facet (likewise carried by cross-series cards).
    const hideSet = ssEnabled ? new Set<string>() : swordShieldOnlySets(cards)

    for (const card of visibleCards) {
      for (const t of card.types) types.add(t)
      for (const s of card.subtypes) subtypes.add(s)
      for (const s of card.sets) {
        if (!hideSet.has(s)) sets.add(s)
      }
      for (const s of card.series) {
        if (!ssEnabled && s === SWORD_SHIELD_SERIES) continue
        series.add(s)
      }
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
  }, [cards, visibleCards, ssEnabled])

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
    // Fast path: nothing selected → return the (S&S-gated) array reference so
    // VirtuosoGrid sees an unchanged `data` prop (no needless re-render churn).
    if (noConstraints) return visibleCards

    return visibleCards.filter((card) => {
      if (query && !card.search.includes(query)) return false
      if (!matchesFacet(card.types, typesLower)) return false
      if (!matchesFacet(card.subtypes, subtypesLower)) return false
      if (!matchesFacet(card.sets, setsLower)) return false
      if (!matchesFacet(card.series, seriesLower)) return false
      if (!matchesFacet(card.roles, rolesLower)) return false
      return true
    })
  }, [visibleCards, filters])

  return {
    filtered,
    options,
    filters,
    activeCount: countActive(filters),
  }
}
