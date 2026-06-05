import { useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import CardGrid from './CardGrid'
import type { LoadState } from './CardGrid'
import SearchFilterBar from './SearchFilterBar'
import type { CardCategory, PokemonCard } from '../types'
import type { FilterableCard } from '../data'
import { useCardFilters } from '../useCardFilters'

// ============================================================================
// FilterableGrid — the SearchFilterBar + URL-driven filtering + CardGrid block.
// ----------------------------------------------------------------------------
// Extracted from GridLayout so BOTH the per-category tab grids and the global
// "related" drill-down views (RelatedGridView) reuse the exact same filter
// wiring with zero duplication. It is purely the "given some already-loaded
// FilterableCard[], let the user search/filter within them" concern — it does
// NOT own the fetch or know about tabs/categories/headings; its parent supplies
// the loaded `cards` + `state` and any surrounding chrome.
//
// State (search/facets) lives entirely in the URL via useSearchParams (works in
// HashRouter — the query is the part after `?` within the hash), so it survives
// refresh and is shareable. replace:true keeps typing/toggling out of history so
// Back exits the view rather than stepping through every keystroke.
//
// `cards` here are ALREADY scoped to whatever the parent wants the universe to
// be: the full category for a tab, or the base-constrained subset (role match /
// name match) for a related view. useCardFilters derives its facet options + HP
// bounds from exactly these cards, so the facets reflect the scoped set and the
// URL `?q=&type=…` filters AND on top of that scope — which is precisely the
// "filter within the constrained set" behavior the related views need.
//
// Height: this renders the filter bar (flex-shrink-0) + a <main class="min-h-0
// flex-1"> wrapper so VirtuosoGrid's height:100% can measure (same chain the tab
// layout always had).
// ============================================================================

type FilterableGridProps = {
  // The universe of cards to search/filter within (already loaded + scoped).
  cards: FilterableCard[]
  // Fetch lifecycle for `cards`, owned by the parent (loading/ready/error).
  state: LoadState
  // Only feeds CardGrid's no-data empty-state copy ("Special cards are coming
  // soon" vs the generic line). Filtering itself is category-agnostic. The
  // global related views pass 'pokemon' as a harmless hint — their set is large,
  // so the no-data branch never shows; a filtered-to-zero set shows the
  // category-agnostic "No matches" instead.
  categoryHint: CardCategory
  // OPTIONAL per-tile overlay, forwarded to CardGrid (additive — defaults to
  // none). The collection view uses it to lay quantity steppers + a remove
  // control over each card. Tabs/related views omit it and render unchanged.
  renderOverlay?: (card: PokemonCard) => ReactNode
  // OPTIONAL no-data empty-state override, forwarded to CardGrid (e.g. the
  // collection view's "your collection is empty" state).
  emptyState?: ReactNode
}

export default function FilterableGrid({
  cards,
  state,
  categoryHint,
  renderOverlay,
  emptyState,
}: FilterableGridProps) {
  // URL-driven filter state (see header). replace:true so typing/toggling
  // doesn't spam the history stack.
  const [searchParams, setSearchParams] = useSearchParams()
  const onFiltersChange = useCallback(
    (next: URLSearchParams) => setSearchParams(next, { replace: true }),
    [setSearchParams],
  )

  const { filtered, options, filters, activeCount } = useCardFilters(
    cards,
    searchParams,
  )

  // Map the filtered FilterableCards back to the plain tiles VirtuosoGrid needs.
  // Memoized so the grid's `data` prop is referentially stable between renders
  // that don't change the filtered set (avoids needless Virtuoso churn).
  const tiles = useMemo<PokemonCard[]>(
    () => filtered.map((c) => c.tile),
    [filtered],
  )

  // The filter bar is meaningful only once data has loaded with ≥1 card. Hiding
  // it during loading/error/empty avoids rendering empty facet dropdowns.
  const showBar = state === 'ready' && cards.length > 0
  // "No matches" (distinct from "no data"): loaded with cards, but the active
  // filters exclude them all.
  const filteredEmpty = showBar && tiles.length === 0

  return (
    <>
      {showBar && (
        <SearchFilterBar
          options={options}
          filters={filters}
          total={cards.length}
          shown={tiles.length}
          activeCount={activeCount}
          params={searchParams}
          onChange={onFiltersChange}
        />
      )}
      <main className="min-h-0 flex-1">
        <CardGrid
          category={categoryHint}
          cards={tiles}
          state={state}
          filteredEmpty={filteredEmpty}
          renderOverlay={renderOverlay}
          emptyState={emptyState}
        />
      </main>
    </>
  )
}
