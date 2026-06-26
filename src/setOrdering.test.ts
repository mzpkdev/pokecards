import { describe, it, expect } from 'vitest'
import { compareReleaseDesc, groupBySeries } from './setOrdering'
import type { SetInfo } from './data'

// Minimal SetInfo factory — only setcode/setName/series/releaseDate matter for
// ordering; the image/count fields are filled with throwaway values so the shape
// matches SetInfo exactly. releaseDate is fixed-width YYYY/MM/DD (or '' = unknown).
function makeSet(over: Partial<SetInfo> & { setcode: string }): SetInfo {
  return {
    setName: over.setName ?? `Set ${over.setcode}`,
    series: over.series ?? 'Series A',
    cardCount: over.cardCount ?? 0,
    releaseDate: over.releaseDate ?? '',
    logoUrl: over.logoUrl ?? `https://example.test/${over.setcode}/logo.png`,
    sampleImage: over.sampleImage ?? `https://example.test/${over.setcode}.png`,
    ...over,
  }
}

describe('compareReleaseDesc', () => {
  it('sorts a newer releaseDate FIRST (descending)', () => {
    const older = makeSet({ setcode: 'old', releaseDate: '2020/01/01' })
    const newer = makeSet({ setcode: 'new', releaseDate: '2024/12/31' })
    const sorted = [older, newer].sort(compareReleaseDesc)
    expect(sorted.map((s) => s.setcode)).toEqual(['new', 'old'])
  })

  it('tiebreaks equal dates by setcode ascending', () => {
    // Both share a date; input is reversed so the result proves it sorts by
    // setcode ascending (sm1 before smp) rather than preserving input order.
    const a = makeSet({ setcode: 'smp', releaseDate: '2017/02/03' })
    const b = makeSet({ setcode: 'sm1', releaseDate: '2017/02/03' })
    const sorted = [a, b].sort(compareReleaseDesc)
    expect(sorted.map((s) => s.setcode)).toEqual(['sm1', 'smp'])
  })

  it("sorts an '' (unknown) date LAST", () => {
    const unknown = makeSet({ setcode: 'unk', releaseDate: '' })
    const dated = makeSet({ setcode: 'dat', releaseDate: '2000/01/01' })
    // Even though the dated set is very old, '' sorts after it (last/oldest).
    const sorted = [unknown, dated].sort(compareReleaseDesc)
    expect(sorted.map((s) => s.setcode)).toEqual(['dat', 'unk'])
  })
})

describe('groupBySeries', () => {
  it('groups by series, orders sets newest-first within a series, and orders sections by each series’ newest set (desc)', () => {
    // Two series, unambiguous dates:
    //   "Sword & Shield": swsh1 (2020/02/07), swsh2 (2021/06/18)
    //   "Scarlet & Violet": sv1 (2023/03/31), sv2 (2024/01/26)
    // Newest set overall is sv2 (2024) → S&V section leads; within it sv2 then
    // sv1; the S&S section follows, swsh2 then swsh1. Input is shuffled so the
    // result is produced by the sort, not by incoming order.
    const sets: SetInfo[] = [
      makeSet({ setcode: 'swsh1', series: 'Sword & Shield', releaseDate: '2020/02/07' }),
      makeSet({ setcode: 'sv1', series: 'Scarlet & Violet', releaseDate: '2023/03/31' }),
      makeSet({ setcode: 'swsh2', series: 'Sword & Shield', releaseDate: '2021/06/18' }),
      makeSet({ setcode: 'sv2', series: 'Scarlet & Violet', releaseDate: '2024/01/26' }),
    ]

    const sections = groupBySeries(sets)

    expect(sections.map((s) => s.series)).toEqual([
      'Scarlet & Violet',
      'Sword & Shield',
    ])
    expect(sections[0].sets.map((s) => s.setcode)).toEqual(['sv2', 'sv1'])
    expect(sections[1].sets.map((s) => s.setcode)).toEqual(['swsh2', 'swsh1'])
  })

  it("orders a section whose newest set has an '' date LAST", () => {
    // "Dated" series newest set is 2015/01/01; "Unknown" series has only '' dates,
    // so its newest-date rank key is '' → it sorts last even though, set-for-set,
    // a real date should beat ''. Confirms the section ordering uses the '' rank.
    const sets: SetInfo[] = [
      makeSet({ setcode: 'unk1', series: 'Unknown', releaseDate: '' }),
      makeSet({ setcode: 'dat1', series: 'Dated', releaseDate: '2015/01/01' }),
    ]

    const sections = groupBySeries(sets)
    expect(sections.map((s) => s.series)).toEqual(['Dated', 'Unknown'])
  })
})
