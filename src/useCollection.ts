import { useCallback, useSyncExternalStore } from 'react'
import { sortPrintings } from './data'
import type { CardDetail, PokemonCard } from './types'

// ============================================================================
// COLLECTION STORE — a localStorage-backed, app-wide "deck list" of owned cards.
// ----------------------------------------------------------------------------
// MODEL: card-level with a quantity. The collection is a flat map
//   { [cardKey]: quantity }
// where `cardKey` is a STABLE, card-LEVEL identifier (see CARD IDENTITY below)
// and quantity is a positive integer. A card is ONE entry no matter which
// printing it was added from.
//
// CARD IDENTITY (the crux). A detail URL is #/card/<printing-id>, where the id
// is an arbitrary PRINTING of a card — a single card has many printings, and the
// grid/detail both pick a *representative* printing (printings[0] after
// data.ts's normals-first sortPrintings) as the card's canonical face. The grid
// tile's `id` (PokemonCard.id = toCard → sortPrintings(printings)[0].id) IS that
// representative id. So we key the collection on the representative printing id:
//   • The collection view loads loadAllFilterableCards() and keys each entry on
//     `tile.id` — already the representative id.
//   • The detail page adds via collectionKeyForDetail(card), which runs the SAME
//     sortPrintings(printings)[0].id, so adding from ANY printing of a card maps
//     to the exact same key the grid/collection view uses.
// This id is stable across the printings-REORDER because sortPrintings is a
// deterministic, purely per-printing partition (normals-first, stable within
// group) — reordering the source array can't change which printing sorts first.
// We deliberately do NOT key on card NAME: names are not unique (distinct cards
// share a name, e.g. multiple "Pikachu"), so a name key would merge real cards.
//
// REACTIVITY: a tiny module-level store + useSyncExternalStore so the tab badge,
// the detail-page button, and the collection view all reflect the same state and
// update live across the app (no context provider needed). Writes persist to
// localStorage, guarded with typeof-window + try/catch so SSR / private-mode /
// quota failures degrade to an in-memory store rather than throwing.
// ============================================================================

const STORAGE_KEY = 'pokecards.collection'

// The persisted shape: cardKey → quantity (always a positive integer in store).
export type CollectionMap = Record<string, number>

// ----------------------------------------------------------------------------
// localStorage I/O (guarded). Any failure (no window, disabled storage, quota,
// malformed JSON) falls back to an empty/no-op so the app never crashes.
// ----------------------------------------------------------------------------
function readStorage(): CollectionMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    // Sanitize: keep only entries with a finite quantity ≥ 1 (floored to an int),
    // so a hand-edited / corrupted blob can't seed bad values into the UI.
    const clean: CollectionMap = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const n = typeof value === 'number' ? Math.floor(value) : NaN
      if (Number.isFinite(n) && n >= 1) clean[key] = n
    }
    return clean
  } catch {
    return {}
  }
}

function writeStorage(map: CollectionMap): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Ignore (private mode / quota). The in-memory store stays authoritative for
    // this session even if it can't be persisted.
  }
}

// ----------------------------------------------------------------------------
// Module store. `state` is treated as IMMUTABLE — every mutation replaces it
// with a new object so useSyncExternalStore's reference-equality check fires and
// subscribers re-render. Initialized once from localStorage.
// ----------------------------------------------------------------------------
let state: CollectionMap = readStorage()
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): CollectionMap {
  return state
}

// Server snapshot (SSR / non-browser): a stable empty map. Module-level constant
// so useSyncExternalStore sees the SAME reference every call (a fresh {} each
// time would loop). Frozen to make the "empty + immutable" contract explicit.
const EMPTY: CollectionMap = Object.freeze({})
function getServerSnapshot(): CollectionMap {
  return EMPTY
}

// Commit a new state object: replace, persist, notify. Centralizes the
// immutable-replace + persist + emit so every mutation is consistent.
function commit(next: CollectionMap): void {
  state = next
  writeStorage(next)
  emit()
}

// ----------------------------------------------------------------------------
// Mutations (module-level so they're stable identities and usable outside React
// too). Each produces a NEW map and commits it.
// ----------------------------------------------------------------------------

// Add one of a card (by its stable card key): +1 if present, else seed at 1.
function addKey(cardKey: string): void {
  if (!cardKey) return
  commit({ ...state, [cardKey]: (state[cardKey] ?? 0) + 1 })
}

// Set an exact quantity; n < 1 removes the entry entirely. Quantities are
// floored to a non-negative integer so a stepper can't store fractional/NaN.
function setQuantity(cardKey: string, n: number): void {
  if (!cardKey) return
  const qty = Number.isFinite(n) ? Math.floor(n) : 0
  if (qty < 1) {
    removeKey(cardKey)
    return
  }
  if (state[cardKey] === qty) return
  commit({ ...state, [cardKey]: qty })
}

// Remove a card outright (no-op if absent).
function removeKey(cardKey: string): void {
  if (!(cardKey in state)) return
  const next = { ...state }
  delete next[cardKey]
  commit(next)
}

// ----------------------------------------------------------------------------
// PUBLIC KEY HELPERS — the single source of truth for deriving a card's
// collection key from the two shapes callers hold.
// ----------------------------------------------------------------------------

// From a grid tile (PokemonCard): its id is ALREADY the representative printing
// id (toCard → sortPrintings(printings)[0].id), so the key is just tile.id.
export function collectionKeyForTile(tile: PokemonCard): string {
  return tile.id
}

// From a full CardDetail record (the detail page): derive the SAME representative
// key the grid/collection view uses by running data.ts's normals-first sort and
// taking the first printing's id. The detail route resolves an ARBITRARY printing
// id to its parent record, so this maps any printing of a card → the one
// canonical card key. Returns '' for a record with no printings (the detail page
// guards on that — it can't add a card it can't key). This intentionally mirrors
// data.ts's toCard so add-from-detail and the collection view never diverge.
export function collectionKeyForDetail(card: CardDetail): string {
  return sortPrintings(card.printings ?? [])[0]?.id ?? ''
}

// The cross-app return shape of useCollection. Mutations are stable module
// functions; reactive reads (`map`, `entries`, `totalCount`, `distinctCount`)
// are derived from the live snapshot so every consumer updates together.
export type UseCollection = {
  // The raw cardKey → quantity map (current snapshot; treat as read-only).
  map: CollectionMap
  // [cardKey, quantity] pairs (snapshot order). Convenience for iteration.
  entries: [string, number][]
  // Sum of all quantities (e.g. "12 cards" — used for the tab badge).
  totalCount: number
  // Number of DISTINCT cards collected (e.g. "5 unique").
  distinctCount: number
  // Add one of a card given a grid tile (resolves the key internally).
  add: (tile: PokemonCard) => void
  // Add one given an already-resolved card key (detail page uses this with the
  // representative key it derives via collectionKeyForDetail).
  addKey: (cardKey: string) => void
  // Set an exact quantity for a key (removes if < 1).
  setQuantity: (cardKey: string, n: number) => void
  // Remove a card by key.
  remove: (cardKey: string) => void
  // Current quantity for a key (0 if absent).
  quantityOf: (cardKey: string) => number
  // Whether a key is in the collection.
  has: (cardKey: string) => boolean
}

/**
 * App-wide collection hook. Subscribes to the module store via
 * useSyncExternalStore, so any component using it re-renders when the collection
 * changes anywhere (tab badge, detail button, collection view stay in sync).
 *
 * The returned object is rebuilt each render (cheap — derived from the snapshot),
 * but the mutation functions are stable module identities, so passing them to
 * children/memoized callbacks is safe.
 */
export function useCollection(): UseCollection {
  const map = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const add = useCallback((tile: PokemonCard) => addKey(collectionKeyForTile(tile)), [])
  const quantityOf = useCallback((cardKey: string) => map[cardKey] ?? 0, [map])
  const has = useCallback((cardKey: string) => (map[cardKey] ?? 0) > 0, [map])

  const entries = Object.entries(map)
  let totalCount = 0
  for (const [, qty] of entries) totalCount += qty

  return {
    map,
    entries,
    totalCount,
    distinctCount: entries.length,
    add,
    addKey,
    setQuantity,
    remove: removeKey,
    quantityOf,
    has,
  }
}
