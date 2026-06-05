import { useEffect, useState } from 'react'
import type { LoadState } from './CardGrid'
import FilterableGrid from './FilterableGrid'
import Tabs from './Tabs'
import type { CardCategory } from '../types'
import { loadFilterableCards } from '../data'
import type { FilterableCard } from '../data'

type GridLayoutProps = {
  category: CardCategory
}

// The tabbed grid view: header (App shell) + tab bar + search/filter bar + the
// virtualized grid for one category. The tab bar lives HERE (inside the grid
// layout) rather than at the app shell, so it is shown ONLY on the three
// category routes and never on the standalone /card/:id detail view.
//
// GridLayout OWNS the per-category fetch lifecycle (the filterable tiles) and
// renders the tab bar; the search/filter + virtualized-grid block is delegated
// to the shared FilterableGrid (which the global "related" drill-down views also
// reuse — see RelatedGridView), so the filter wiring lives in exactly one place.
//
// Critical height chain (do not regress: keeps VirtuosoGrid measurable). The
// outer fills #root's 100% height; the tab bar + filter bar are flex-shrink-0,
// and FilterableGrid's <main> takes the leftover with min-h-0 + flex-1 so
// VirtuosoGrid's height:100% can measure and virtualize.
export default function GridLayout({ category }: GridLayoutProps) {
  const [cards, setCards] = useState<FilterableCard[]>([])
  const [state, setState] = useState<LoadState>('loading')

  // Lazily fetch + project the dataset for THIS category. loadFilterableCards
  // caches per category in module scope, so switching tabs and coming back
  // reuses the cached projection (fetch + blob/facet derivation happen only the
  // first time a category is opened). Re-runs when the category changes.
  useEffect(() => {
    let active = true
    // Reset to the loading state on a category change before the async fetch
    // resolves. This component is NOT remounted across the three category routes
    // (same element type/position), so the reset must happen here. The
    // set-state-in-effect rule flags the sync setter, but this is the intended
    // async-load reset (mirrors the original CardGrid lifecycle) — not a
    // cascading render bug.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState('loading')
    loadFilterableCards(category)
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
  }, [category])

  return (
    <>
      <Tabs />
      {/* The search/filter bar + virtualized grid for this category's loaded
          tiles. Same block the global related views use, so filtering behaves
          identically everywhere. */}
      <FilterableGrid cards={cards} state={state} categoryHint={category} />
    </>
  )
}
