import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { CollectionsState } from './useCollection'

// ============================================================================
// SYNC SEAM — hydrateFromRemote / getCollectionsState / subscribe. hydrate
// applies an UNTRUSTED remote snapshot through the SAME coerceState hardening +
// commit path a local mutation uses. The module store reads localStorage at
// IMPORT time and is a singleton, so each test clears storage and resets the
// registry, then dynamically re-imports for a fresh store. (jsdom is fine here —
// coerceState/commit touch no crypto.)
// ============================================================================
const V2_KEY = 'pokecards.collections'

const remoteState: CollectionsState = {
  activeId: 'binder-modern',
  collections: [
    { id: 'binder-vintage', name: 'Vintage', cards: { 'base1-4': 2, 'base1-58': 1 } },
    { id: 'binder-modern', name: 'Modern', cards: { 'sv1-1': 3, 'sv3-125': 4 } },
  ],
}

describe('useCollection sync seam', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('hydrateFromRemote applies a valid state (snapshot + persistence)', async () => {
    const { hydrateFromRemote, getCollectionsState } = await import('./useCollection')

    hydrateFromRemote(remoteState)

    const snap = getCollectionsState()
    expect(snap.activeId).toBe('binder-modern')
    expect(snap.collections).toHaveLength(2)
    expect(snap.collections[1].cards).toEqual({ 'sv1-1': 3, 'sv3-125': 4 })
    // commit ran the normal persist path, so the v2 blob reflects the remote state.
    const raw = JSON.parse(localStorage.getItem(V2_KEY) as string)
    expect(raw.activeId).toBe('binder-modern')
    expect(raw.collections).toHaveLength(2)
  })

  it('hydrateFromRemote notifies subscribers on a valid apply', async () => {
    const { hydrateFromRemote, subscribe } = await import('./useCollection')

    const listener = vi.fn()
    const unsub = subscribe(listener)
    hydrateFromRemote(remoteState)

    expect(listener).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('hydrateFromRemote ignores null / malformed / garbage (state unchanged, no notify)', async () => {
    const { hydrateFromRemote, getCollectionsState, subscribe } = await import('./useCollection')

    const before = getCollectionsState()
    const listener = vi.fn()
    const unsub = subscribe(listener)

    hydrateFromRemote(null)
    hydrateFromRemote(undefined)
    hydrateFromRemote('not an object')
    hydrateFromRemote(42)
    hydrateFromRemote({}) // no collections array
    hydrateFromRemote({ collections: 'nope' }) // wrong type
    hydrateFromRemote({ collections: [] }) // empty after coercion
    hydrateFromRemote({ collections: [{ name: 'no id' }] }) // every collection dropped

    // Never committed: same object reference, no subscriber notification.
    expect(getCollectionsState()).toBe(before)
    expect(listener).not.toHaveBeenCalled()
    unsub()
  })

  it('hydrateFromRemote hardens a partially-valid state via coerceState', async () => {
    const { hydrateFromRemote, getCollectionsState } = await import('./useCollection')

    hydrateFromRemote({
      activeId: 'stale-id', // names no surviving collection → repaired to the first
      collections: [
        { id: 'x', name: 'A', cards: { good: 2, zero: 0, neg: -1, frac: 1.9, str: 'x' } },
        { id: '', name: 'dropped', cards: {} }, // no id → dropped
      ],
    })

    const snap = getCollectionsState()
    expect(snap.collections).toHaveLength(1)
    expect(snap.activeId).toBe('x')
    expect(snap.collections[0].cards).toEqual({ good: 2, frac: 1 })
  })
})
