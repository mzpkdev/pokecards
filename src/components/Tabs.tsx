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
  // The collection tab carries a live count badge (total quantity collected),
  // so it's defined separately below — it reads the reactive store.
]

export default function Tabs() {
  // Total quantity collected, reactive across the app: adding/removing anywhere
  // re-renders this badge live. We badge the TOTAL count (sum of quantities) so
  // it reads like a deck-list size (e.g. "Charizard x2" counts as 2).
  const { totalCount } = useCollection()

  return (
    <nav className="tabbar flex flex-shrink-0 gap-3 px-6">
      {TABS.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            ['tab px-4 py-1.5 text-sm', isActive ? 'is-active' : ''].join(' ')
          }
        >
          {label}
        </NavLink>
      ))}
      <NavLink
        to="/collection"
        className={({ isActive }) =>
          [
            'tab tab--collection px-4 py-1.5 text-sm',
            isActive ? 'is-active' : '',
          ].join(' ')
        }
      >
        Your Collection
        {totalCount > 0 && (
          <span className="tab-badge" aria-label={`${totalCount} cards collected`}>
            {totalCount}
          </span>
        )}
      </NavLink>
    </nav>
  )
}
