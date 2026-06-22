import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Tabs from './Tabs'
import type { LoadState } from './CardGrid'
import { loadSetIndex } from '../data'
import type { SetInfo } from '../data'

// ============================================================================
// SetGalleryView — the standalone "Sets" tab: a browsable gallery of every
// expansion's banner logo, grouped under its series as a section header.
// ----------------------------------------------------------------------------
// A TOP-LEVEL tabbed route (#/sets). Like GridLayout it renders the shared
// <Tabs/> itself (the tab bar is NOT in a shared shell — each tabbed page draws
// it) and then supplies its OWN scroll container, because it sits inside
// RouteFade's full-height flex column (flex min-h-0 flex-1 flex-col): the root
// must claim the leftover height with the min-h-0 + flex-1 idiom and scroll its
// own <main>, or the gallery won't scroll.
//
// Data comes from loadSetIndex() — a flat SetInfo[] (module-memoized in data.ts,
// so revisiting the tab reuses the load). Each SetInfo carries an exact
// `releaseDate` (fixed-width YYYY/MM/DD). We group by `series` and order BOTH the
// sets within a section and the sections themselves chronologically newest-first
// off that date: sets descend by releaseDate (tiebroken by setcode for a stable
// order when two share a date), and the sections descend by each series' newest
// set's releaseDate. A '' date (unknown setcode) sorts last/oldest. Plain string
// comparison is chronological — no Date parsing.
//
// Each banner LINKS to #/set/<setName> (RelatedGridView's 'set' mode filters by
// set NAME, not setcode), while the logo image uses s.logoUrl (setcode-based).
// SetInfo carries both, so we read the right field for each use.
// ============================================================================

// Newest-first comparator for sets within a series: by exact releaseDate string
// descending (fixed-width YYYY/MM/DD, so lexicographic = chronological), then
// tiebroken by setcode ascending so sets sharing a date (White Flare/Black Bolt
// both 2025/07/18; smp/sm1 both 2017/02/03) keep a stable, deterministic order.
function compareReleaseDesc(a: SetInfo, b: SetInfo): number {
  if (a.releaseDate !== b.releaseDate)
    return a.releaseDate < b.releaseDate ? 1 : -1
  return a.setcode.localeCompare(b.setcode)
}

type SeriesSection = { series: string; sets: SetInfo[] }

// Group the flat SetInfo[] into ordered series sections. Within each series the
// sets are sorted newest-first by compareReleaseDesc (we sort explicitly by
// releaseDate — we do NOT rely on the incoming data.ts array order). The SECTIONS
// are then ordered newest-first by each series' NEWEST set's releaseDate (the max
// releaseDate among its sets), descending — so the series with the most recent
// release leads. Ties broken by series name for stability.
function groupBySeries(sets: SetInfo[]): SeriesSection[] {
  const bySeries = new Map<string, SetInfo[]>()
  for (const s of sets) {
    const bucket = bySeries.get(s.series)
    if (bucket) bucket.push(s)
    else bySeries.set(s.series, [s])
  }

  return [...bySeries.entries()]
    .map(([series, setsInSeries]) => {
      const sorted = [...setsInSeries].sort(compareReleaseDesc)
      // Newest set's date = the first after a newest-first sort = this series'
      // rank key for ordering the sections.
      const newestDate = sorted[0]?.releaseDate ?? ''
      return { series, sets: sorted, newestDate }
    })
    .sort((a, b) => {
      // Sections newest-first by each series' newest release date; ties (none
      // expected across series) fall back to series name for a stable order.
      if (a.newestDate !== b.newestDate)
        return a.newestDate < b.newestDate ? 1 : -1
      return a.series.localeCompare(b.series)
    })
    .map(({ series, sets: setsInSeries }) => ({ series, sets: setsInSeries }))
}

export default function SetGalleryView() {
  const [sets, setSets] = useState<SetInfo[]>([])
  const [state, setState] = useState<LoadState>('loading')

  // Lazily fetch the set index once on mount. Mirrors the async-load lifecycle
  // in GridLayout/RelatedGridView (active flag guards a late resolve after
  // unmount). loadSetIndex is module-memoized, so revisiting the tab is cheap.
  useEffect(() => {
    let active = true
    loadSetIndex()
      .then((loaded) => {
        if (!active) return
        setSets(loaded)
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

  const sections = useMemo(() => groupBySeries(sets), [sets])

  return (
    <>
      <Tabs />
      {/* Own scroll container: this page sits in RouteFade's full-height flex
          column, so it claims the leftover height (min-h-0 + flex-1) and scrolls
          its own content — there is no shared scroll <main> for tabbed pages. */}
      <main className="set-gallery min-h-0 flex-1 overflow-y-auto">
        {state === 'loading' && (
          <div className="grid-status" role="status" aria-live="polite">
            <span className="grid-status-spinner" aria-hidden="true" />
            <span className="grid-status-text">Loading sets…</span>
          </div>
        )}

        {state === 'error' && (
          <div className="grid-status" role="alert">
            <span className="grid-status-icon" aria-hidden="true">
              ⚠
            </span>
            <span className="grid-status-text">
              Couldn’t load sets. Please try again.
            </span>
          </div>
        )}

        {state === 'ready' &&
          sections.map(({ series, sets: setsInSeries }) => (
            <section key={series} className="set-series">
              <h2 className="set-series-header">{series}</h2>
              {/* Reuse the app's responsive grid container verbatim (CardGrid's
                  list grid) so banners lay out identically to card tiles. */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 px-4 pb-4">
                {setsInSeries.map((s) => (
                  <Link
                    key={s.setcode}
                    // Route filters by set NAME, not code (RelatedGridView 'set'
                    // mode), so the target uses s.setName; encoded because set
                    // names contain spaces & "&".
                    to={`/set/${encodeURIComponent(s.setName)}`}
                    aria-label={`Cards in set ${s.setName}`}
                    className="set-banner"
                  >
                    <div className="set-banner-art">
                      <img
                        // The logo URL is setcode-based (s.logoUrl); the link
                        // above uses the set NAME. SetInfo carries both.
                        src={s.logoUrl}
                        alt={s.setName}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        // A few of the newest sets have no logo anywhere
                        // (pokemontcg.io 404s, scrydex serves only a shared
                        // placeholder), so we fall back in two stages, keyed off
                        // data-stage to prevent any loop:
                        //   1. logo failed → swap in the set's representative
                        //      card image (s.sampleImage, always a real image)
                        //      and tag data-stage="card" so the CSS fills the
                        //      frame as set art rather than letterboxing it.
                        //   2. card image ALSO failed → hide the img and let the
                        //      always-rendered caption show through (last resort).
                        onError={(e) => {
                          const img = e.currentTarget
                          if (img.dataset.stage === 'card') {
                            img.style.display = 'none'
                            return
                          }
                          img.dataset.stage = 'card'
                          img.src = s.sampleImage
                        }}
                      />
                    </div>
                    <div className="set-banner-caption">
                      <span className="set-banner-name">{s.setName}</span>
                      <span className="set-banner-count">{s.cardCount} cards</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
      </main>
    </>
  )
}
