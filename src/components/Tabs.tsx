import { NavLink } from 'react-router-dom'

// The category tab bar. Rendered by GridLayout (inside <Routes>), so it appears
// only on the three category grid routes and never on the /card/:id detail view.
const TABS = [
  { to: '/pokemon', label: 'Pokémon' },
  { to: '/poketools', label: 'Poketools' },
  { to: '/specials', label: 'Specials' },
]

export default function Tabs() {
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
    </nav>
  )
}
