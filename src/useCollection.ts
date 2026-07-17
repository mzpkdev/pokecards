import { useCallback, useSyncExternalStore } from 'react'
import { sortPrintings } from './data'
import type { CardDetail, PokemonCard } from './types'

// ============================================================================
// COLLECTION STORE — localStorage-backed, app-wide "deck lists" of owned cards.
// ----------------------------------------------------------------------------
// MODEL: the user has MANY named collections and exactly ONE is ACTIVE at a
// time. Each collection is card-level with a quantity — a flat map
//   { [cardKey]: quantity }
// (positive integers), keyed by a STABLE, card-LEVEL identifier (see CARD
// IDENTITY below). The persisted shape is
//   { activeId, collections: [{ id, name, cards }] }
// with the INVARIANT that there is always ≥ 1 collection and `activeId` always
// names an existing one. "Adding a card" always targets the ACTIVE collection,
// so every consumer that reads `map`/`totalCount`/`quantityOf` (the tab badge,
// the detail-page button) automatically operates on whatever's active.
//
// CARD IDENTITY (the crux, unchanged across the multi-collection migration). A
// detail URL is #/card/<printing-id>, where the id is an arbitrary PRINTING of a
// card — a single card has many printings, and the grid/detail both pick a
// *representative* printing (printings[0] after data.ts's normals-first
// sortPrintings) as the card's canonical face. The grid tile's `id`
// (PokemonCard.id = toCard → sortPrintings(printings)[0].id) IS that
// representative id. So we key each collection on the representative printing id:
//   • The collection view loads loadAllFilterableCards() and keys each entry on
//     `tile.id` — already the representative id.
//   • The detail page adds via collectionKeyForDetail(card), which runs the SAME
//     sortPrintings(printings)[0].id, so adding from ANY printing of a card maps
//     to the exact same key the grid/collection view uses.
// This id is stable across the printings-REORDER because sortPrintings is a
// deterministic, purely per-printing partition (normals-first, stable within
// group). Keys are GLOBAL: the same card lives independently in each collection.
// We deliberately do NOT key on card NAME: names are not unique (distinct cards
// share a name, e.g. multiple "Pikachu"), so a name key would merge real cards.
//
// REACTIVITY: a tiny module-level store + useSyncExternalStore so the tab badge,
// the detail-page button, and the collection view all reflect the same state and
// update live across the app (no context provider needed). The snapshot is the
// WHOLE multi-collection state; useCollection derives the active collection's
// view from it in render. Writes persist to localStorage, guarded with
// typeof-window + try/catch so SSR / private-mode / quota failures degrade to an
// in-memory store rather than throwing.
// ============================================================================

// v2 storage key (the multi-collection blob). The v1 key held a single bare
// CollectionMap; readStorage() migrates it once into a default collection.
const STORAGE_KEY = 'pokecards.collections'
const LEGACY_KEY = 'pokecards.collection'

// The name the very first / migrated default collection gets.
const DEFAULT_NAME = 'My Collection'

// The persisted per-collection shape: cardKey → quantity (positive int in store).
export type CollectionMap = Record<string, number>

// One named collection.
export type Collection = {
  id: string
  name: string
  cards: CollectionMap
}

// The whole persisted store. INVARIANT (enforced by readStorage + every
// mutation): `collections` is non-empty and `activeId` names one of them.
export type CollectionsState = {
  activeId: string
  collections: Collection[]
}

// ----------------------------------------------------------------------------
// IDs. crypto.randomUUID where available (browser + jsdom + modern Node), with a
// non-crypto fallback for ancient/insecure contexts — collection ids are local
// and need only be unique within this store, not cryptographically strong.
// ----------------------------------------------------------------------------
function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // fall through
  }
  return `c_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

// ----------------------------------------------------------------------------
// localStorage I/O (guarded). Any failure (no window, disabled storage, quota,
// malformed JSON) falls back to a sane default so the app never crashes.
// ----------------------------------------------------------------------------

// Sanitize a raw cards map: keep only entries with a finite quantity ≥ 1
// (floored to an int), so a hand-edited / corrupted blob can't seed bad values.
function sanitizeMap(input: unknown): CollectionMap {
  const clean: CollectionMap = {}
  if (!input || typeof input !== 'object') return clean
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const n = typeof value === 'number' ? Math.floor(value) : NaN
    if (Number.isFinite(n) && n >= 1) clean[key] = n
  }
  return clean
}

// Coerce an arbitrary parsed value into a valid CollectionsState, or null if it
// isn't recognizably the v2 shape (caller then migrates legacy / seeds default).
// Enforces the invariant: drops malformed collections, requires ≥ 1 to survive,
// and repairs a missing/stale activeId to the first collection.
function coerceState(parsed: unknown): CollectionsState | null {
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>
  if (!Array.isArray(obj.collections)) return null

  const collections: Collection[] = []
  const seen = new Set<string>()
  for (const raw of obj.collections) {
    if (!raw || typeof raw !== 'object') continue
    const c = raw as Record<string, unknown>
    const id = typeof c.id === 'string' && c.id ? c.id : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    const name =
      typeof c.name === 'string' && c.name.trim() ? c.name : DEFAULT_NAME
    collections.push({ id, name, cards: sanitizeMap(c.cards) })
  }
  if (collections.length === 0) return null

  const activeId =
    typeof obj.activeId === 'string' && collections.some((c) => c.id === obj.activeId)
      ? obj.activeId
      : collections[0].id
  return { activeId, collections }
}

// A brand-new single-empty-collection state (fresh ids). Used at first run and
// when a delete empties the store (never-zero reset).
function makeDefaultState(): CollectionsState {
  const id = newId()
  return { activeId: id, collections: [{ id, name: DEFAULT_NAME, cards: {} }] }
}

// Stable server/non-browser snapshot. useSyncExternalStore demands the SAME
// reference every call (a fresh object each time would loop), so this is a
// frozen module constant rather than makeDefaultState() (which mints new ids).
const EMPTY_MAP: CollectionMap = Object.freeze({})
const SERVER_STATE: CollectionsState = Object.freeze({
  activeId: 'server',
  collections: [Object.freeze({ id: 'server', name: DEFAULT_NAME, cards: EMPTY_MAP })],
}) as CollectionsState

function readStorage(): CollectionsState {
  if (typeof window === 'undefined') return SERVER_STATE
  try {
    // Prefer the v2 blob.
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const state = coerceState(JSON.parse(raw))
      if (state) return state
      // Malformed v2 → fall through to legacy/default rather than throwing.
    }
    // One-time migration: wrap a v1 single-map as the default collection so an
    // existing user's collection survives the upgrade untouched.
    const legacy = window.localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const cards = sanitizeMap(JSON.parse(legacy))
      const id = newId()
      return { activeId: id, collections: [{ id, name: DEFAULT_NAME, cards }] }
    }
    return makeDefaultState()
  } catch {
    return makeDefaultState()
  }
}

function writeStorage(next: CollectionsState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Ignore (private mode / quota). The in-memory store stays authoritative for
    // this session even if it can't be persisted.
  }
}

// ----------------------------------------------------------------------------
// Module store. `state` is treated as IMMUTABLE — every mutation replaces it
// (and the touched collection within it) with new objects so the snapshot's
// reference changes and useSyncExternalStore subscribers re-render. Initialized
// once from localStorage.
// ----------------------------------------------------------------------------
let state: CollectionsState = readStorage()
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

function getSnapshot(): CollectionsState {
  return state
}

function getServerSnapshot(): CollectionsState {
  return SERVER_STATE
}

// Commit a new state object: replace, persist, notify. Centralizes the
// immutable-replace + persist + emit so every mutation is consistent.
function commit(next: CollectionsState): void {
  state = next
  writeStorage(next)
  emit()
}

// The active collection in a given state (falls back to the first — the
// invariant guarantees one exists, so this never returns undefined).
function activeOf(s: CollectionsState): Collection {
  return s.collections.find((c) => c.id === s.activeId) ?? s.collections[0]
}

// ----------------------------------------------------------------------------
// CARD MUTATIONS — operate on the ACTIVE collection. Each produces a new cards
// map, swaps it into a new copy of that one collection, and commits new state.
// (Module-level so they're stable identities and usable outside React too.)
// ----------------------------------------------------------------------------

// Replace the active collection's cards map immutably and commit.
function commitActiveCards(nextCards: CollectionMap): void {
  const active = activeOf(state)
  const collections = state.collections.map((c) =>
    c.id === active.id ? { ...c, cards: nextCards } : c,
  )
  commit({ activeId: state.activeId, collections })
}

// Add one of a card (by its stable card key): +1 if present, else seed at 1.
function addKey(cardKey: string): void {
  if (!cardKey) return
  const cards = activeOf(state).cards
  commitActiveCards({ ...cards, [cardKey]: (cards[cardKey] ?? 0) + 1 })
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
  const cards = activeOf(state).cards
  if (cards[cardKey] === qty) return
  commitActiveCards({ ...cards, [cardKey]: qty })
}

// Remove a card outright from the active collection (no-op if absent).
function removeKey(cardKey: string): void {
  const cards = activeOf(state).cards
  if (!(cardKey in cards)) return
  const next = { ...cards }
  delete next[cardKey]
  commitActiveCards(next)
}

// ----------------------------------------------------------------------------
// COLLECTION MUTATIONS — create / rename / delete / switch active. Each upholds
// the ≥1-collection + valid-activeId invariant.
// ----------------------------------------------------------------------------

// Suggest a non-colliding default name ("Collection 2", "Collection 3", …) for a
// new collection created without an explicit name.
function suggestName(collections: Collection[]): string {
  const taken = new Set(collections.map((c) => c.name))
  let n = collections.length + 1
  while (taken.has(`Collection ${n}`)) n++
  return `Collection ${n}`
}

// Create a new (empty) collection and make it ACTIVE. Returns the new id so the
// UI can reference it. An empty/blank name falls back to a suggested default.
function createCollection(name?: string): string {
  const id = newId()
  const finalName = (name ?? '').trim() || suggestName(state.collections)
  const collections = [...state.collections, { id, name: finalName, cards: {} }]
  commit({ activeId: id, collections })
  return id
}

// Rename a collection. A blank name is ignored (the old name stays).
function renameCollection(id: string, name: string): void {
  const trimmed = name.trim()
  if (!trimmed) return
  let changed = false
  const collections = state.collections.map((c) => {
    if (c.id !== id || c.name === trimmed) return c
    changed = true
    return { ...c, name: trimmed }
  })
  if (!changed) return
  commit({ activeId: state.activeId, collections })
}

// Delete a collection. Never leaves zero: deleting the last one resets to a
// fresh empty default; deleting the active one reassigns active to a neighbor
// (the previous in list order, else the first remaining).
function deleteCollection(id: string): void {
  const idx = state.collections.findIndex((c) => c.id === id)
  if (idx === -1) return
  const remaining = state.collections.filter((c) => c.id !== id)
  if (remaining.length === 0) {
    commit(makeDefaultState())
    return
  }
  let activeId = state.activeId
  if (activeId === id) {
    activeId = (remaining[idx - 1] ?? remaining[0]).id
  }
  commit({ activeId, collections: remaining })
}

// Switch the active collection (no-op for an unknown id or the current active).
function setActiveCollection(id: string): void {
  if (id === state.activeId) return
  if (!state.collections.some((c) => c.id === id)) return
  commit({ activeId: id, collections: state.collections })
}

// ----------------------------------------------------------------------------
// PUBLIC KEY HELPERS — the single source of truth for deriving a card's
// collection key from the two shapes callers hold. (Unchanged: keys are global
// across collections.)
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

// ----------------------------------------------------------------------------
// PUBLIC RETURN SHAPES
// ----------------------------------------------------------------------------

// A read-only summary of one collection for the switcher UI.
export type CollectionSummary = {
  id: string
  name: string
  // Sum of quantities in this collection (the badge number).
  totalCount: number
  // Number of distinct cards in this collection.
  distinctCount: number
  // Whether this is the currently-active collection.
  isActive: boolean
}

// The collection-management surface (additive — card-level consumers ignore it).
export type CollectionsApi = {
  // Every collection, in stored order, with live counts + the active flag.
  list: CollectionSummary[]
  activeId: string
  activeName: string
  // Create a new (empty) collection and make it active; returns its id.
  create: (name?: string) => string
  // Rename a collection by id (blank name ignored).
  rename: (id: string, name: string) => void
  // Delete a collection by id (never zero — see deleteCollection).
  remove: (id: string) => void
  // Switch the active collection by id.
  setActive: (id: string) => void
}

// The cross-app return shape of useCollection. The card-level fields below are
// the ACTIVE collection's view (so existing consumers are unchanged); mutations
// are stable module functions; `collections` exposes the management surface.
export type UseCollection = {
  // The active collection's cardKey → quantity map (snapshot; treat as read-only).
  map: CollectionMap
  // [cardKey, quantity] pairs of the active collection (snapshot order).
  entries: [string, number][]
  // Sum of all quantities in the active collection (used for the tab badge).
  totalCount: number
  // Number of DISTINCT cards in the active collection.
  distinctCount: number
  // Add one of a card given a grid tile (resolves the key internally).
  add: (tile: PokemonCard) => void
  // Add one given an already-resolved card key (detail page uses this with the
  // representative key it derives via collectionKeyForDetail).
  addKey: (cardKey: string) => void
  // Set an exact quantity for a key in the active collection (removes if < 1).
  setQuantity: (cardKey: string, n: number) => void
  // Remove a card by key from the active collection.
  remove: (cardKey: string) => void
  // Current quantity for a key in the active collection (0 if absent).
  quantityOf: (cardKey: string) => number
  // Whether a key is in the active collection.
  has: (cardKey: string) => boolean
  // Collection management (list/create/rename/remove/setActive).
  collections: CollectionsApi
}

/**
 * App-wide collection hook. Subscribes to the module store via
 * useSyncExternalStore, so any component using it re-renders when the store
 * changes anywhere (tab badge, detail button, collection view stay in sync).
 *
 * The card-level fields reflect the ACTIVE collection; switching collections
 * changes them everywhere. The returned object is rebuilt each render (cheap —
 * derived from the snapshot), but the mutation functions are stable module
 * identities, so passing them to children/memoized callbacks is safe.
 */
export function useCollection(): UseCollection {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const active = activeOf(snapshot)
  const map = active.cards

  const add = useCallback((tile: PokemonCard) => addKey(collectionKeyForTile(tile)), [])
  const quantityOf = useCallback((cardKey: string) => map[cardKey] ?? 0, [map])
  const has = useCallback((cardKey: string) => (map[cardKey] ?? 0) > 0, [map])

  const entries = Object.entries(map)
  let totalCount = 0
  for (const [, qty] of entries) totalCount += qty

  const list: CollectionSummary[] = snapshot.collections.map((c) => {
    const cardEntries = Object.entries(c.cards)
    let total = 0
    for (const [, qty] of cardEntries) total += qty
    return {
      id: c.id,
      name: c.name,
      totalCount: total,
      distinctCount: cardEntries.length,
      isActive: c.id === snapshot.activeId,
    }
  })

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
    collections: {
      list,
      activeId: snapshot.activeId,
      activeName: active.name,
      create: createCollection,
      rename: renameCollection,
      remove: deleteCollection,
      setActive: setActiveCollection,
    },
  }
}

// ----------------------------------------------------------------------------
// SYNC SEAM — a thin read/write boundary for the cross-device sync layer
// (src/sync), added WITHOUT changing any existing behavior or public API. The
// synced payload is the WHOLE CollectionsState (all collections + activeId), so
// these expose exactly that snapshot and let a remote snapshot be applied back.
// ----------------------------------------------------------------------------

// The same pub/sub useSyncExternalStore drives — lets the sync hook observe local
// mutations (to know when to push) without re-plumbing the store.
export { subscribe }

// The current whole-store snapshot: the exact object the sync layer serializes
// and pushes. Same reference as getSnapshot; named for the sync call site.
export function getCollectionsState(): CollectionsState {
  return state
}

// Apply an untrusted remote snapshot. Routed through the SAME coerceState
// hardening every load uses (drops malformed collections, sanitizes quantities,
// repairs activeId) and the SAME commit path a local mutation uses (persist +
// notify). Anything that isn't a recognizable v2 state — null, garbage, wrong
// shape — is silently ignored, leaving the store untouched.
export function hydrateFromRemote(raw: unknown): void {
  const s = coerceState(raw)
  if (s) commit(s)
}
