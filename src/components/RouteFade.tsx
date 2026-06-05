import { useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

// ============================================================================
// RouteFade — a short, non-linear fade-in on route change (round-2 #4).
// ----------------------------------------------------------------------------
// Wraps the app's <Routes>. On every ROUTE change it re-triggers a brief
// (~200ms) ease-out opacity fade-in, so navigating between views (tab → tab,
// grid → detail, detail → related, …) reads as a gentle settle rather than a
// hard cut. Fade-OUT is intentionally omitted (a route swap is synchronous in
// React, so there's no old tree to fade out without extra machinery) — a clean
// fade-IN is the requested, low-risk effect.
//
// WHY restart the animation imperatively instead of keying a wrapper:
//   Keying a wrapper by location would REMOUNT the routed subtree on every
//   navigation. That would discard GridLayout's per-category cache/state on tab
//   switches (it is deliberately NOT remounted across the three category routes)
//   and disturb the virtualized grid. So this component never remounts its
//   children — it only restarts its OWN CSS animation (the canonical
//   "animation:none → reflow → clear" trick) on the wrapper element. The routed
//   tree underneath is untouched, so HashRouter routing, the VirtuosoGrid mount
//   lifecycle, and scroll position all behave exactly as before; we add only an
//   opacity keyframe (no layout/transform → no scroll impact).
//
// We key the restart on location.pathname (the route identity), NOT on
// location.search — so the fade fires on real navigations but NOT on every
// filter/search keystroke (which only mutates the query string in place).
//
// prefers-reduced-motion: the .route-fade keyframe is disabled in index.css
// under the reduce query, so there the wrapper is simply a static, fully-opaque
// container (the imperative restart still runs but animates nothing).
// ============================================================================

export default function RouteFade({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()

  // Restart the fade-in whenever the route (pathname) changes. useLayoutEffect
  // so the reset + restart happen before paint (no flash of the pre-animation
  // state). Touches only the wrapper's own inline animation — never the
  // children — so the routed subtree is not remounted.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // Cancel any in-flight run, force a reflow so the browser registers the
    // removal, then clear the override so the stylesheet's .route-fade animation
    // applies fresh (i.e. plays from the start).
    el.style.animation = 'none'
    // Reading offsetWidth forces the reflow that makes the restart take effect.
    void el.offsetWidth
    el.style.animation = ''
  }, [pathname])

  // The litewind flex utilities preserve the critical height chain: this wrapper
  // takes the leftover height under the header (flex-1 + min-h-0) and lays its
  // routed child out as a column, so the grid/detail/related views still claim
  // the height VirtuosoGrid needs. `route-fade` carries only the opacity keyframe.
  return (
    <div ref={ref} className="route-fade flex min-h-0 flex-1 flex-col">
      {children}
    </div>
  )
}
