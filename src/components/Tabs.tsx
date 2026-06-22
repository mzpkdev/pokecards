import { useRef, type KeyboardEvent } from 'react'
import { NavLink } from 'react-router-dom'
import { useCollection } from '../useCollection'

// The category tab bar. Rendered by GridLayout (inside <Routes>) for the three
// category grids AND by CollectionView for the collection grid, so it appears on
// those four tabbed routes and never on the /card/:id detail view or the
// related drill-downs.
const TABS = [
  { to: '/pokemon', label: 'Pokémon' },
  { to: '/poketools', label: 'Poketools' },
  { to: '/specials', label: 'Specials' },
  { to: '/sets', label: 'Sets' },
  // The collection tab carries a live count badge (total quantity collected),
  // so it's rendered separately below — it reads the reactive store.
  { to: '/collection', label: 'Your Collection', collection: true as const },
]

// --- Ark UI evaluation (why this is NOT Ark <Tabs>) ----------------------------
// Per ARK_MIGRATION.md, the candidate primitive was Ark `Tabs` (Root/List/Trigger
// asChild={NavLink}, controlled by route, no Content). We deliberately did NOT
// adopt it, because the router — not Ark — owns selection AND renders the panels:
//
//   - Ark's `Tabs.Trigger` sets `aria-controls` to a generated tabpanel id ONLY on
//     the selected tab (see @zag-js/tabs connect). The matching `tabpanel` is the
//     routed <main>, which lives in FilterableGrid.tsx / CollectionView.tsx — files
//     this conversion is forbidden to touch. So `aria-controls` would dangle at an
//     id that exists in no DOM node: broken ARIA, the exact failure the inventory
//     flagged as the main risk.
//   - It also layers role="tab" + aria-selected onto each NavLink, which already
//     conveys selection via aria-current="page" — contradictory/redundant semantics.
//
// The only behavior Ark would have ADDED over plain NavLinks is roving-tabindex +
// arrow-key/Home/End focus movement within the list. That is self-contained and is
// implemented below, so we keep the NavLinks (router stays the single source of
// truth for navigation + the is-active class + the badge) and give the bar
// role="tablist" — a tab strip that doesn't lie about panels it doesn't control.
export default function Tabs() {
  // Total quantity collected, reactive across the app: adding/removing anywhere
  // re-renders this badge live. We badge the TOTAL count (sum of quantities) so
  // it reads like a deck-list size (e.g. "Charizard x2" counts as 2).
  const { totalCount } = useCollection()

  const linksRef = useRef<Array<HTMLAnchorElement | null>>([])

  // Roving-focus keyboard nav matching a tablist (what Ark Tabs would supply):
  // Left/Up → previous, Right/Down → next (both wrap), Home/End → first/last.
  // Focus only MOVES focus between tabs; it does not navigate (Enter/Space on the
  // focused NavLink still does that, preserving the click/keyboard nav contract).
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']
    if (!keys.includes(event.key)) return

    const links = linksRef.current.filter((el): el is HTMLAnchorElement => el != null)
    if (links.length === 0) return
    const current = links.indexOf(document.activeElement as HTMLAnchorElement)
    if (current === -1) return

    event.preventDefault()
    let next = current
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (current - 1 + links.length) % links.length
        break
      case 'ArrowRight':
      case 'ArrowDown':
        next = (current + 1) % links.length
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = links.length - 1
        break
    }
    links[next]?.focus()
  }

  return (
    <nav
      className="tabbar flex flex-shrink-0 gap-3 px-6"
      role="tablist"
      aria-label="Card categories"
      onKeyDown={onKeyDown}
    >
      {TABS.map(({ to, label, collection }, i) => (
        <NavLink
          key={to}
          to={to}
          ref={(el) => {
            linksRef.current[i] = el
          }}
          // role="tab" without a real tabpanel would dangle aria-controls; the
          // NavLink keeps its native link role + aria-current="page" for the
          // active route, which conveys selection honestly.
          className={({ isActive }) =>
            [
              collection ? 'tab tab--collection px-4 py-1.5 text-sm' : 'tab px-4 py-1.5 text-sm',
              isActive ? 'is-active' : '',
            ].join(' ')
          }
        >
          {label}
          {collection && totalCount > 0 && (
            <span className="tab-badge" aria-label={`${totalCount} cards collected`}>
              {totalCount}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
