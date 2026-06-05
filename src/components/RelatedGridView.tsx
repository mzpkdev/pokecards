import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import FilterableGrid from './FilterableGrid'
import type { LoadState } from './CardGrid'
import { loadAllFilterableCards } from '../data'
import type { FilterableCard } from '../data'
import { formatRoleLabel } from '../roleLabel'

// ============================================================================
// RelatedGridView — the deep-linkable "intermediate grid" reached by clicking a
// role, evolution name, type, set, or series on the card detail page.
// ----------------------------------------------------------------------------
// Backs ALL these routes (one component, switched by `mode`):
//   • #/role/:role       → every card (across ALL categories) whose roles include
//                          :role  (mode 'role')
//   • #/related/:name    → every card (across ALL categories) whose NAME matches
//                          :name, case-insensitive exact match  (mode 'related')
//   • #/type/:type       → every card whose TYPES include :type  (mode 'type')
//   • #/set/:set         → every card with a printing in SET :set  (mode 'set')
//   • #/series/:series   → every card with a printing in SERIES :series
//                          (mode 'series')
//
// It loads the GLOBAL merged FilterableCard[] (loadAllFilterableCards, which
// reuses the per-category fetch + projection caches), applies the route's BASE
// CONSTRAINT to that set, then hands the constrained subset to the SAME
// FilterableGrid the tabs use. So the user can further search/filter WITHIN the
// constrained set, and the existing ?q=&type=&… URL filter state composes as AND
// on top of the base constraint (FilterableGrid → useCardFilters derives its
// facets from exactly the constrained subset). State is URL-driven, so these
// views are shareable and survive refresh / cold deep-link.
//
// The type/set/series base constraints match the SAME way useCardFilters matches
// those facets (case-insensitive membership in the card's types / sets / series
// arrays — the latter two derived from printings, series via seriesOf), so a
// drill-down lands on exactly the cards that facet would select.
//
// The route param is URL-encoded by the linker (CardDetailPage) and decoded here
// via useParams (react-router decodes path params for us).
// ============================================================================

type RelatedGridViewProps = {
  // 'role'    → base constraint = roles include the param.
  // 'related' → base constraint = name === the param (case-insensitive).
  // 'type'    → base constraint = types include the param.
  // 'set'     → base constraint = sets include the param (a printing in that set).
  // 'series'  → base constraint = series include the param (a printing in that series).
  mode: 'role' | 'related' | 'type' | 'set' | 'series'
}

// Loads the global merged set once per mount and exposes the load lifecycle.
// (Module-memoized in data.ts, so a remount / second related view reuses it.)
function useAllFilterableCards(): { cards: FilterableCard[]; state: LoadState } {
  const [cards, setCards] = useState<FilterableCard[]>([])
  const [state, setState] = useState<LoadState>('loading')

  useEffect(() => {
    let active = true
    loadAllFilterableCards()
      .then((loaded) => {
        if (!active) return
        setCards(loaded)
        setState('ready')
      })
      .catch(() => {
        if (!active) return
        setState('error')
      })
    return () => {
      active = false
    }
  }, [])

  return { cards, state }
}

export default function RelatedGridView({ mode }: RelatedGridViewProps) {
  // react-router decodes the path param, so each is the human-readable value
  // (e.g. "disruption", "Donphan", "Fire", "Base Set", "swsh"). Exactly one of
  // these is populated per route (the others stay ''); `value` below selects the
  // active one by mode. Default to '' so a malformed/empty route renders an empty
  // (not crashing) view.
  const {
    role = '',
    name = '',
    type = '',
    set = '',
    series = '',
  } = useParams<{
    role: string
    name: string
    type: string
    set: string
    series: string
  }>()
  const navigate = useNavigate()
  const { cards, state } = useAllFilterableCards()

  // The raw value driving the base constraint + heading, per mode.
  const value =
    mode === 'role'
      ? role
      : mode === 'type'
        ? type
        : mode === 'set'
          ? set
          : mode === 'series'
            ? series
            : name

  // BASE CONSTRAINT: narrow the global set to the route's match BEFORE the user's
  // own search/filters run. Memoized on the loaded set + mode + value so it
  // recomputes only when one changes (not on unrelated re-renders). This subset
  // is what FilterableGrid treats as its universe, so facet options + the
  // ?q=&type=… filters are all scoped to it (composed as AND on top). The
  // type/set/series matches mirror useCardFilters' facet matching exactly
  // (case-insensitive membership in the card's corresponding array).
  const constrained = useMemo<FilterableCard[]>(() => {
    if (!value) return []
    const needle = value.toLowerCase()
    switch (mode) {
      case 'role':
        return cards.filter((c) => c.roles.some((r) => r.toLowerCase() === needle))
      case 'type':
        return cards.filter((c) => c.types.some((t) => t.toLowerCase() === needle))
      case 'set':
        return cards.filter((c) => c.sets.some((s) => s.toLowerCase() === needle))
      case 'series':
        return cards.filter((c) => c.series.some((s) => s.toLowerCase() === needle))
      default:
        // 'related': case-insensitive EXACT name match.
        return cards.filter((c) => c.tile.name.toLowerCase() === needle)
    }
  }, [cards, mode, value])

  // Back = history.back(), falling back to the grid when there's no history
  // (e.g. a cold deep-link straight to #/role/… in a fresh tab). Mirrors the
  // detail page's back behavior so the affordance is consistent.
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/pokemon')
    }
  }

  // Once the global set is loaded, surface how many cards matched the base
  // constraint (before the user's own filters). FilterableGrid's own "N of M"
  // count then reflects filtering WITHIN this subset.
  const matchCount = constrained.length

  return (
    // Mirrors the detail page's full-height flex member so the grid below can
    // claim the leftover height (FilterableGrid's <main> is min-h-0 + flex-1).
    // The header chrome is flex-shrink-0 so VirtuosoGrid stays measurable.
    <div className="related-view flex min-h-0 flex-1 flex-col">
      {/* Compact topbar: the back button sits INLINE on the same row as the
          title + match count (it no longer occupies its own full-height row). */}
      <div className="related-head flex-shrink-0">
        <button type="button" className="detail-back related-back" onClick={handleBack}>
          <span aria-hidden="true">←</span> Back
        </button>
        <div className="related-head-text">
          <h2 className="related-title">
            {mode === 'role' ? (
              <>
                Cards with role:{' '}
                {/* Display the role Capitalized; `value` itself stays raw so the
                    base constraint still matches the data case-insensitively. */}
                <span className="related-title-value related-title-value--role">
                  {formatRoleLabel(value)}
                </span>
              </>
            ) : mode === 'type' ? (
              <>
                Type:{' '}
                <span className="related-title-value">{value}</span>
              </>
            ) : mode === 'set' ? (
              <>
                Set: <span className="related-title-value">{value}</span>
              </>
            ) : mode === 'series' ? (
              <>
                Series:{' '}
                {/* `value` (e.g. "Scarlet & Violet") is already a display-ready
                    series label — seriesOf maps setcodes to these labels — so no
                    extra formatting is needed; it matches the data as-is. */}
                <span className="related-title-value">{value}</span>
              </>
            ) : (
              <>
                Related to{' '}
                <span className="related-title-value">{value}</span>
              </>
            )}
          </h2>
          {state === 'ready' && (
            <p className="related-subtitle" aria-live="polite">
              {matchCount.toLocaleString()}{' '}
              {matchCount === 1 ? 'card' : 'cards'} across all categories
            </p>
          )}
        </div>
      </div>

      {/* The constrained subset feeds the SAME filter bar + grid the tabs use,
          so search/facets work within it. categoryHint is a harmless 'pokemon'
          hint for CardGrid's no-data copy — the only empty state these views can
          reach is the category-agnostic "No matches" (when a user's filters
          exclude everything) or a genuinely empty base match (no card with that
          role/name), which renders the same tasteful empty state. */}
      <FilterableGrid cards={constrained} state={state} categoryHint="pokemon" />
    </div>
  )
}
