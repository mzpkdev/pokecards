import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { collectionKeyForTile, collectionKeyForDetail } from './useCollection'
import type { CardDetail, PokemonCard, Printing } from './types'

const STORAGE_KEY = 'pokecards.collection'

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
// STORE BEHAVIOR — the useCollection hook over the module-singleton store.
// The store reads localStorage at IMPORT time, so each test clears storage and
// resets the module registry, then dynamically re-imports for a fresh store.
// ============================================================================
describe('useCollection store', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
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

  it('setQuantity floors fractional below 1 to 0 and removes (0.5 → absent)', async () => {
    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    act(() => {
      result.current.addKey('sv1-1')
    })
    act(() => {
      result.current.setQuantity('sv1-1', 0.5)
    })
    expect(result.current.has('sv1-1')).toBe(false)
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
    expect(result.current.quantityOf('sv1-1')).toBe(3)
    expect(result.current.quantityOf('sv2-2')).toBe(2)
  })

  it('quantityOf is 0 and has is false for an unknown key', async () => {
    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    expect(result.current.quantityOf('nope')).toBe(0)
    expect(result.current.has('nope')).toBe(false)
  })

  it('persists writes to localStorage under the storage key', async () => {
    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    act(() => {
      result.current.setQuantity('sv1-1', 4)
    })
    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw as string)).toEqual({ 'sv1-1': 4 })
  })
})

// ============================================================================
// SANITIZATION ON LOAD — a corrupted/hand-edited blob must be cleaned at import
// time: only finite integers ≥ 1 survive (floored); everything else is dropped.
// Seed storage BEFORE the dynamic import so readStorage() sees it.
// ============================================================================
describe('useCollection load-time sanitization', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('keeps only finite integers ≥ 1 (floored), dropping zero/negative/string', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ good: 2, zero: 0, neg: -1, frac: 1.9, str: 'x' }),
    )

    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    expect(result.current.quantityOf('good')).toBe(2)
    expect(result.current.quantityOf('frac')).toBe(1)
    expect(result.current.has('zero')).toBe(false)
    expect(result.current.has('neg')).toBe(false)
    expect(result.current.has('str')).toBe(false)

    expect(result.current.distinctCount).toBe(2)
    expect(result.current.map).toEqual({ good: 2, frac: 1 })
  })

  it('falls back to an empty store on malformed JSON', async () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json')

    const { useCollection } = await import('./useCollection')
    const { result } = renderHook(() => useCollection())

    expect(result.current.distinctCount).toBe(0)
    expect(result.current.map).toEqual({})
  })
})
