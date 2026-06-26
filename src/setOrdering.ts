import type { SetInfo } from './data'

// Newest-first comparator for sets within a series: by exact releaseDate string
// descending (fixed-width YYYY/MM/DD, so lexicographic = chronological), then
// tiebroken by setcode ascending so sets sharing a date (White Flare/Black Bolt
// both 2025/07/18; smp/sm1 both 2017/02/03) keep a stable, deterministic order.
export function compareReleaseDesc(a: SetInfo, b: SetInfo): number {
  if (a.releaseDate !== b.releaseDate)
    return a.releaseDate < b.releaseDate ? 1 : -1
  return a.setcode.localeCompare(b.setcode)
}

export type SeriesSection = { series: string; sets: SetInfo[] }

// Group the flat SetInfo[] into ordered series sections. Within each series the
// sets are sorted newest-first by compareReleaseDesc (we sort explicitly by
// releaseDate — we do NOT rely on the incoming data.ts array order). The SECTIONS
// are then ordered newest-first by each series' NEWEST set's releaseDate (the max
// releaseDate among its sets), descending — so the series with the most recent
// release leads. Ties broken by series name for stability.
export function groupBySeries(sets: SetInfo[]): SeriesSection[] {
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
