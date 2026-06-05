import type { ReactNode } from 'react'
import { VirtuosoGrid } from 'react-virtuoso'
import type { CardCategory, PokemonCard as PokemonCardData } from '../types'
import PokemonCard from './PokemonCard'

// Fetch lifecycle for one category's tiles. Owned by GridLayout (which loads +
// filters); CardGrid just renders the right state for what it's handed.
export type LoadState = 'loading' | 'ready' | 'error'

type CardGridProps = {
  category: CardCategory
  // The tiles to render — ALREADY filtered by GridLayout. VirtuosoGrid simply
  // receives a (possibly shorter) array, so virtualization is unaffected.
  cards: PokemonCardData[]
  state: LoadState
  // True when the category loaded ≥1 card but the active filters match none —
  // a DISTINCT empty state from the "no cards yet / coming soon" no-data case.
  filteredEmpty: boolean
  // OPTIONAL per-tile overlay (additive; defaults to none). When supplied, each
  // grid item wraps the tile in a positioned container and renders this node on
  // top — used by the collection view to lay quantity steppers + a remove
  // control over each card WITHOUT changing the tile component itself. The
  // category grids pass nothing, so their items render exactly as before.
  renderOverlay?: (card: PokemonCardData) => ReactNode
  // Optional empty-state override copy for the no-data case (e.g. the collection
  // view's "your collection is empty" message). Defaults to the category copy.
  emptyState?: ReactNode
}

// Top spacer rendered as VirtuosoGrid's Header. We can't use padding-top on the
// list element (listClassName) for this gap: react-virtuoso writes inline
// padding/transform on that list node every frame to position the virtualization
// window, which clobbers any class-supplied padding-top. The Header, by contrast,
// is rendered by Virtuoso inside the scroller ABOVE the items and scrolls with the
// content, so a fixed-height spacer here is a deterministic, un-clobbered gap that
// also keeps scrollHeight stable (no re-measure churn).
const GridHeader = () => <div style={{ height: '2rem' }} aria-hidden="true" />

const gridComponents = { Header: GridHeader }

export default function CardGrid({
  category,
  cards,
  state,
  filteredEmpty,
  renderOverlay,
  emptyState,
}: CardGridProps) {
  // Loading — themed spinner (reuses the detail page's spinner styling).
  if (state === 'loading') {
    return (
      <div className="grid-status" role="status" aria-live="polite">
        <span className="grid-status-spinner" aria-hidden="true" />
        <span className="grid-status-text">Loading cards…</span>
      </div>
    )
  }

  // Error — graceful message, no crash.
  if (state === 'error') {
    return (
      <div className="grid-status" role="alert">
        <span className="grid-status-icon" aria-hidden="true">
          ⚠
        </span>
        <span className="grid-status-text">
          Couldn’t load cards. Please try again.
        </span>
      </div>
    )
  }

  // No matches — the category HAS cards, but the current search/filters exclude
  // them all. Distinct from the "coming soon" no-data state below: this prompts
  // the user to relax their filters rather than implying the catalog is empty.
  if (filteredEmpty) {
    return (
      <div className="grid-status grid-status--empty" role="status">
        <span className="grid-status-emoji" aria-hidden="true">
          ⌕
        </span>
        <span className="grid-status-title">No matches</span>
        <span className="grid-status-text">
          No cards match your search and filters. Try clearing some.
        </span>
      </div>
    )
  }

  // Empty — e.g. the Specials tab before specials.json exists, OR a caller-
  // supplied empty state (the collection view's "nothing collected yet" copy).
  // Tasteful, themed, not an error.
  if (cards.length === 0) {
    if (emptyState) return <>{emptyState}</>
    return (
      <div className="grid-status grid-status--empty" role="status">
        <span className="grid-status-emoji" aria-hidden="true">
          ✦
        </span>
        <span className="grid-status-title">No cards yet</span>
        <span className="grid-status-text">
          {category === 'special'
            ? 'Special cards are coming soon.'
            : 'Nothing to show here yet.'}
        </span>
      </div>
    )
  }

  return (
    <VirtuosoGrid
      // Fill the area left under the header in App's full-height flex layout.
      style={{ height: '100%' }}
      // Mobile height-floor guarantee. `style.height:100%` resolves against the
      // <main class="min-h-0 flex-1"> parent, which is correct on desktop. But on
      // a short/narrow viewport the header + tab bar + (wrapping) filter bar can
      // eat almost all the column, so the flex-1 leftover — and therefore this
      // scroller — collapses toward 0 and barely any tiles render. `className` is
      // applied by Virtuoso to its OUTER scroller node (alongside its own inline
      // height/transform, which it does NOT clobber), so .card-grid-scroller's
      // `min-height` (see index.css) floors that scroller and keeps a usable,
      // scrollable area on mobile. The floor is < the desktop leftover, so it
      // never engages on larger viewports (layout there is unchanged).
      className="card-grid-scroller"
      // Render rows a little before they enter the viewport so freshly scrolled-in
      // tiles are already mounted/decoded — kills the edge-of-screen pop-in.
      increaseViewportBy={{ top: 300, bottom: 600 }}
      data={cards}
      // Top breathing room from the tab bar comes from the Header spacer (see
      // gridComponents) rather than padding-top on this list — Virtuoso owns the
      // list element's inline styles and would clobber a class padding-top.
      components={gridComponents}
      // The list wrapper is what we turn into a responsive CSS grid. litewind
      // ships the responsive grid-cols variants, so we lean on utility classes.
      listClassName="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 px-4 pb-4"
      itemContent={(_index, card) =>
        renderOverlay ? (
          // Positioned wrapper so the overlay (steppers/remove) layers over the
          // tile. The tile keeps its own <Link> + holo geometry untouched; the
          // overlay is a sibling on top. flex-col so the wrapper hugs the tile.
          <div className="pc-cell">
            <PokemonCard card={card} />
            {renderOverlay(card)}
          </div>
        ) : (
          <PokemonCard card={card} />
        )
      }
    />
  )
}
