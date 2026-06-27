import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { collectionKeyForTile, collectionKeyForDetail } from './useCollection'
import type { CardDetail, PokemonCard, Printing } from './types'

// v2 (multi-collection) key + the v1 single-map key it migrates from.
const V2_KEY = 'pokecards.collections'
const LEGACY_KEY = 'pokecards.collection'

// A minimal CardDetail factory — only `printings` matters for key derivation;
// every other required field is filled with a benign default.
function makeDetail(printings: Printing[]): CardDetail {
  return {
    name: 'Test Card',
    subtypes: [],
    role: [],
    similar: [],
    printings,
  }
}

// ============================================================================
// CROWN-JEWEL INVARIANT: tile + detail keys agree on the representative NORMAL
// printing (sortPrintings(printings)[0].id), independent of source array order.
// These helpers are pure, so they're imported statically (no module isolation).
// (Unchanged across the multi-collection migration — keys stay global.)
// ============================================================================
describe('collection key parity (collectionKeyForTile vs collectionKeyForDetail)', () => {
  // printings[0] is a SPECIAL (alt-art `_A` suffix) so sortPrintings must
  // reorder it AFTER the normal `sv1-1`.
  const printings: Printing[] = [
    { id: 'cel25c-4_A', set: 'Celebrations', number: '4', image: '' },
    { id: 'sv1-1', set: 'Scarlet & Violet', number: '1', image: '' },
  ]

  it('collectionKeyForDetail returns the first NORMAL printing, not the array-first special', () => {
    const detail = makeDetail(printings)
    expect(collectionKeyForDetail(detail)).toBe('sv1-1')
  })

  it('a tile built from the same record keys on its representative id', () => {
    const tile: PokemonCard = { id: 'sv1-1', name: 'Test Card', imageUrl: '', category: 'pokemon' }
    expect(collectionKeyForTile(tile)).toBe('sv1-1')
  })

  it('tile and detail derive the SAME key for the same card (parity contract)', () => {
    const detail = makeDetail(printings)
    const tile: PokemonCard = { id: 'sv1-1', name: 'Test Card', imageUrl: '', category: 'pokemon' }
    expect(collectionKeyForDetail(detail)).toBe(collectionKeyForTile(tile))
  })

  it('is independent of input printing order (stable per-printing partition)', () => {
    const forward = collectionKeyForDetail(makeDetail(printings))
    const reversed = collectionKeyForDetail(makeDetail([...printings].reverse()))
    expect(forward).toBe('sv1-1')
    expect(reversed).toBe(forward)
  })

  it('returns the same key even with multiple specials shuffled around the normal', () => {
    const shuffled: Printing[] = [
      { id: 'swsh1-200_A', set: 'Sword & Shield', number: '200', image: '' },
      { id: 'cel25c-4_A', set: 'Celebrations', number: '4', image: '' },
      { id: 'sv1-1', set: 'Scarlet & Violet', number: '1', image: '' },
    ]
    expect(collectionKeyForDetail(makeDetail(shuffled))).toBe('sv1-1')
  })

  it('returns "" for a record with no printings', () => {
    expect(collectionKeyForDetail(makeDetail([]))).toBe('')
  })
})

// ============================================================================
// ACTIVE-COLLECTION CARD BEHAVIOR — the card-level API of useCollection always
// targets the ACTIVE collection. The store reads localStorage at IMPORT time, so
// each test clears storage and resets the module registry, then dynamically
// re-imports for a fresh store (which seeds one empty default collection).
// ============================================================================
describe('useCollection active-collection card behavior', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('seeds a single empty default collection on first run', async () => {
    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    expect(result.current.collections.list).toHaveLength(1)
    expect(result.current.collections.activeName).toBe('My Collection')
    expect(result.current.totalCount).toBe(0)
    expect(result.current.map).toEqual({})
  })

  it('addKey increments: add twice → quantity 2', async () => {
    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    act(() => {
      result.current.addKey('sv1-1')
    })
    expect(result.current.quantityOf('sv1-1')).toBe(1)

    act(() => {
      result.current.addKey('sv1-1')
    })
    expect(result.current.quantityOf('sv1-1')).toBe(2)
  })

  it('addKey ignores an empty key', async () => {
    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    act(() => {
      result.current.addKey('')
    })
    expect(result.current.distinctCount).toBe(0)
    expect(result.current.totalCount).toBe(0)
  })

  it('add(tile) resolves the key from the PokemonCard internally', async () => {
    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())
    const tile: PokemonCard = { id: 'sv1-1', name: 'Pikachu', imageUrl: '', category: 'pokemon' }

    act(() => {
      result.current.add(tile)
    })
    expect(result.current.quantityOf('sv1-1')).toBe(1)
    expect(result.current.has('sv1-1')).toBe(true)
  })

  it('setQuantity sets an exact value', async () => {
    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    act(() => {
      result.current.setQuantity('sv1-1', 5)
    })
    expect(result.current.quantityOf('sv1-1')).toBe(5)
  })

  it('setQuantity floors a fractional n (1.9 → 1)', async () => {
    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    act(() => {
      result.current.setQuantity('sv1-1', 1.9)
    })
    expect(result.current.quantityOf('sv1-1')).toBe(1)
  })

  it('setQuantity with n < 1 REMOVES the entry (qty 0, key absent)', async () => {
    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    act(() => {
      result.current.addKey('sv1-1')
    })
    expect(result.current.has('sv1-1')).toBe(true)

    act(() => {
      result.current.setQuantity('sv1-1', 0)
    })
    expect(result.current.quantityOf('sv1-1')).toBe(0)
    expect(result.current.has('sv1-1')).toBe(false)
    expect('sv1-1' in result.current.map).toBe(false)
  })

  it('remove deletes an existing entry', async () => {
    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    act(() => {
      result.current.addKey('sv1-1')
    })
    act(() => {
      result.current.remove('sv1-1')
    })
    expect(result.current.has('sv1-1')).toBe(false)
    expect(result.current.distinctCount).toBe(0)
  })

  it('remove is a no-op for an absent key', async () => {
    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    act(() => {
      result.current.addKey('sv1-1')
    })
    act(() => {
      result.current.remove('does-not-exist')
    })
    expect(result.current.quantityOf('sv1-1')).toBe(1)
    expect(result.current.distinctCount).toBe(1)
  })

  it('totalCount sums quantities; distinctCount counts entries', async () => {
    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    act(() => {
      result.current.setQuantity('sv1-1', 3)
    })
    act(() => {
      result.current.setQuantity('sv2-2', 2)
    })
    expect(result.current.totalCount).toBe(5)
    expect(result.current.distinctCount).toBe(2)
  })

  it('quantityOf is 0 and has is false for an unknown key', async () => {
    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    expect(result.current.quantityOf('nope')).toBe(0)
    expect(result.current.has('nope')).toBe(false)
  })

  it('persists writes to localStorage under the v2 key (nested shape)', async () => {
    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    act(() => {
      result.current.setQuantity('sv1-1', 4)
    })
    const raw = localStorage.getItem(V2_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw as string)
    expect(parsed.collections).toHaveLength(1)
    expect(parsed.collections[0].cards).toEqual({ 'sv1-1': 4 })
    expect(parsed.activeId).toBe(parsed.collections[0].id)
  })
})

// ============================================================================
// COLLECTION MANAGEMENT — create / switch / rename / delete, and that the
// card-level view follows whichever collection is active.
// ============================================================================
describe('useCollection management', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('create adds a collection, auto-activates it (empty), and returns its id', async () => {
    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    act(() => {
      result.current.addKey('a') // lands in the default
    })

    let newId = ''
    act(() => {
      newId = result.current.collections.create('Binder')
    })

    expect(typeof newId).toBe('string')
    expect(newId.length).toBeGreaterThan(0)
    expect(result.current.collections.list).toHaveLength(2)
    expect(result.current.collections.activeId).toBe(newId)
    expect(result.current.collections.activeName).toBe('Binder')
    // The new collection is empty and is now the active view.
    expect(result.current.totalCount).toBe(0)
    expect(result.current.has('a')).toBe(false)
  })

  it('create with a blank name falls back to a suggested name', async () => {
    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    act(() => {
      result.current.collections.create('   ')
    })
    expect(result.current.collections.activeName).toBe('Collection 2')
  })

  it('the card view follows the active collection (switch isolates cards)', async () => {
    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    const firstId = result.current.collections.activeId
    act(() => {
      result.current.addKey('a') // in the default collection
    })

    let bId = ''
    act(() => {
      bId = result.current.collections.create('B') // auto-active, empty
    })
    expect(result.current.has('a')).toBe(false)
    act(() => {
      result.current.addKey('c') // in B
    })

    // Switch back to the first: its cards are intact and B's are not visible.
    act(() => {
      result.current.collections.setActive(firstId)
    })
    expect(result.current.quantityOf('a')).toBe(1)
    expect(result.current.has('c')).toBe(false)

    // And back to B.
    act(() => {
      result.current.collections.setActive(bId)
    })
    expect(result.current.quantityOf('c')).toBe(1)
    expect(result.current.has('a')).toBe(false)
  })

  it('setActive is a no-op for an unknown id', async () => {
    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    const id = result.current.collections.activeId
    act(() => {
      result.current.collections.setActive('does-not-exist')
    })
    expect(result.current.collections.activeId).toBe(id)
  })

  it('rename changes the name; a blank rename is ignored', async () => {
    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    const id = result.current.collections.activeId
    act(() => {
      result.current.collections.rename(id, 'Shinies')
    })
    expect(result.current.collections.activeName).toBe('Shinies')

    act(() => {
      result.current.collections.rename(id, '   ')
    })
    expect(result.current.collections.activeName).toBe('Shinies')
  })

  it('list reports per-collection counts + the active flag', async () => {
    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    act(() => {
      result.current.addKey('a')
    })
    act(() => {
      result.current.addKey('a') // default: qty 2 of one card
    })
    act(() => {
      result.current.collections.create('B')
    })
    act(() => {
      result.current.addKey('c') // B: one card
    })

    const [def, b] = result.current.collections.list
    expect(def.totalCount).toBe(2)
    expect(def.distinctCount).toBe(1)
    expect(def.isActive).toBe(false)
    expect(b.totalCount).toBe(1)
    expect(b.distinctCount).toBe(1)
    expect(b.isActive).toBe(true)
  })

  it('deleting a NON-active collection leaves the active one untouched', async () => {
    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    const firstId = result.current.collections.activeId
    let bId = ''
    act(() => {
      bId = result.current.collections.create('B') // active = B
    })
    act(() => {
      result.current.collections.remove(firstId) // delete the non-active default
    })
    expect(result.current.collections.list).toHaveLength(1)
    expect(result.current.collections.activeId).toBe(bId)
  })

  it('deleting the ACTIVE collection reassigns active to a neighbor', async () => {
    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    const firstId = result.current.collections.activeId
    let bId = ''
    act(() => {
      bId = result.current.collections.create('B') // active = B (index 1)
    })
    act(() => {
      result.current.collections.remove(bId) // delete the active one
    })
    expect(result.current.collections.list).toHaveLength(1)
    expect(result.current.collections.activeId).toBe(firstId)
  })

  it('never goes to zero: deleting the last collection reseeds a fresh empty default', async () => {
    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    const onlyId = result.current.collections.activeId
    act(() => {
      result.current.addKey('a')
    })
    act(() => {
      result.current.collections.remove(onlyId)
    })
    expect(result.current.collections.list).toHaveLength(1)
    // A brand-new collection (new id), empty, named the default.
    expect(result.current.collections.activeId).not.toBe(onlyId)
    expect(result.current.collections.activeName).toBe('My Collection')
    expect(result.current.totalCount).toBe(0)
  })
})

// ============================================================================
// MIGRATION + LOAD-TIME COERCION — a v1 single-map is wrapped into a default
// collection; a corrupted/partial v2 blob is sanitized or falls back. Seed
// storage BEFORE the dynamic import so readStorage() sees it.
// ============================================================================
describe('useCollection migration + load coercion', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('migrates a v1 single-map into one active default collection', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ 'sv1-1': 3, 'sv2-2': 1 }))

    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    expect(result.current.collections.list).toHaveLength(1)
    expect(result.current.collections.activeName).toBe('My Collection')
    expect(result.current.map).toEqual({ 'sv1-1': 3, 'sv2-2': 1 })

    // The v2 blob is written on the first mutation.
    act(() => {
      result.current.addKey('sv3-3')
    })
    expect(localStorage.getItem(V2_KEY)).not.toBeNull()
  })

  it('sanitizes the legacy map on migration (drops zero/negative/string, floors fractional)', async () => {
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({ good: 2, zero: 0, neg: -1, frac: 1.9, str: 'x' }),
    )

    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    expect(result.current.map).toEqual({ good: 2, frac: 1 })
    expect(result.current.distinctCount).toBe(2)
  })

  it('prefers an existing v2 blob over a leftover legacy map', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ legacy: 5 }))
    localStorage.setItem(
      V2_KEY,
      JSON.stringify({
        activeId: 'x',
        collections: [{ id: 'x', name: 'A', cards: { v2card: 1 } }],
      }),
    )

    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    expect(result.current.has('v2card')).toBe(true)
    expect(result.current.has('legacy')).toBe(false)
  })

  it('sanitizes per-collection cards in a v2 blob', async () => {
    localStorage.setItem(
      V2_KEY,
      JSON.stringify({
        activeId: 'x',
        collections: [
          { id: 'x', name: 'A', cards: { good: 2, zero: 0, neg: -1, frac: 1.9, str: 'x' } },
        ],
      }),
    )

    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    expect(result.current.map).toEqual({ good: 2, frac: 1 })
  })

  it('repairs a stale/missing activeId to the first collection', async () => {
    localStorage.setItem(
      V2_KEY,
      JSON.stringify({
        activeId: 'nope',
        collections: [{ id: 'x', name: 'A', cards: { 'sv1-1': 2 } }],
      }),
    )

    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    expect(result.current.collections.activeId).toBe('x')
    expect(result.current.quantityOf('sv1-1')).toBe(2)
  })

  it('falls back to an empty default on malformed v2 JSON', async () => {
    localStorage.setItem(V2_KEY, '{not valid json')

    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    expect(result.current.collections.list).toHaveLength(1)
    expect(result.current.totalCount).toBe(0)
    expect(result.current.map).toEqual({})
  })
})
