import { Navigate, Route, Routes } from 'react-router-dom'
import AppHeader from './components/AppHeader'
import GridLayout from './components/GridLayout'
import CardDetailPage from './components/CardDetailPage'
import RelatedGridView from './components/RelatedGridView'
import RouteFade from './components/RouteFade'

export default function App() {
  return (
    <div className="app-bg flex h-full flex-col">
      {/* Brand header is shared by every view (grid + detail) for consistency;
          the wordmark is a home link. The TAB BAR is NOT here — it lives inside
          GridLayout so it shows only on the category routes, never on /card/:id. */}
      <AppHeader />
      {/* RouteFade plays a short ease-out fade-in on each route change. It MUST
          carry the same flex/min-h-0/flex-1 column behavior the routed views
          expect, because it now sits between .app-bg (the full-height flex
          column) and the route content: GridLayout/CardDetailPage/RelatedGridView
          all rely on being able to claim the leftover height (their grid/scroll
          area is min-h-0 + flex-1). So this wrapper is flex-col + min-h-0 + flex-1
          and preserves the critical VirtuosoGrid height chain; the fade is a pure
          opacity keyframe (no layout/transform) so it can't disturb measurement
          or scroll. RouteFade never remounts its children (see RouteFade.tsx). */}
      <RouteFade>
        <Routes>
          {/* The three tabbed grid views. GridLayout supplies the tab bar + the
              min-h-0/flex-1 height chain VirtuosoGrid needs to virtualize. */}
          <Route path="/" element={<Navigate to="/pokemon" replace />} />
          <Route path="/pokemon" element={<GridLayout category="pokemon" />} />
          <Route path="/poketools" element={<GridLayout category="poketool" />} />
          <Route path="/specials" element={<GridLayout category="special" />} />
          {/* Standalone detail view: its OWN page (no tab bar). HashRouter handles
              #/card/:id on GitHub Pages with no server rewrite. */}
          <Route path="/card/:id" element={<CardDetailPage />} />
          {/* Intermediate "related grid" drill-downs reached from the detail page.
              All load the GLOBAL merged set and render a search/filterable grid of
              the constrained cards (no tab bar — their own page, like detail).
              Deep-linkable + shareable on GitHub Pages via HashRouter. RelatedGridView
              switches its base constraint on `mode`: role / related (name) /
              type / set / series. The type/set/series drill-downs mirror the
              role/evolution pattern and constrain on exactly the same facet
              useCardFilters matches (so the in-view search/filters compose on top). */}
          <Route path="/role/:role" element={<RelatedGridView mode="role" />} />
          <Route
            path="/related/:name"
            element={<RelatedGridView mode="related" />}
          />
          <Route path="/type/:type" element={<RelatedGridView mode="type" />} />
          <Route path="/set/:set" element={<RelatedGridView mode="set" />} />
          <Route
            path="/series/:series"
            element={<RelatedGridView mode="series" />}
          />
          <Route path="*" element={<Navigate to="/pokemon" replace />} />
        </Routes>
      </RouteFade>
    </div>
  )
}
