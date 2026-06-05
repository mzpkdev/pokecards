import type { CardDetail } from './types'
import { ALL_FILES, fetchFile, sortPrintings } from './data'
import type { RawRecord } from './data'

// ============================================================================
// PER-CARD DETAIL LOOKUP
// ----------------------------------------------------------------------------
// A detail URL is #/card/<printing-id>, where the id is a TCG-format
// `setcode-number` taken from a record's printings[].id. We resolve it by
// indexing EVERY printing id (across ALL datasets — pokemon + poketools +
// specials) → its parent record, then returning that record (which already
// matches CardDetail) for the requested id. So clicking a special V/ex card
// resolves to its real detail (hp/types/attacks/weakness/retreat + rule text).
//
// This must work on a COLD deep-link/refresh: opening #/card/<id> directly,
// without the grid ever having loaded, has to fetch the data, build the index,
// and resolve. So getCardDetail ensures all files are loaded (reusing the
// module-scoped fetch cache from data.ts — fetched at most once) before looking
// up. A record can have multiple printings, and a `similar` link may point at a
// different printing than printings[0], so we map ALL printing ids, not just the
// first, to make every linkable id resolvable.
//
// `similar` RESOLUTION (the catch): the `similar` field is NOT one consistent
// id form across datasets — it's a curated list of related cards stored in two
// shapes depending on the source file:
//   • pokemon.json  → printing IDS    (e.g. "sv4-17", "cel25c-4_A")
//   • poketools.json → card NAMES     (e.g. "Echoing Horn", "Erika's Invitation")
//   • specials.json  → no `similar`   (the field is absent)
// A #/card/:id route only resolves printing ids, so linking a poketool's
// name-form `similar` token straight to /card/<name> hits the "not found" state.
// resolveSimilar() below bridges this: it maps EACH token to a concrete printing
// id — pass-through if the token already IS a printing id, else look the token up
// as a card name and use that record's first printing id — so every resolvable
// `similar` entry links directly to the real target card's detail page.
// ============================================================================

// The two lookups built once from the merged catalog:
//   • byId   — printing id → record (drives getCardDetail + similar pass-through)
//   • byName — lowercased card name → record (resolves name-form similar tokens)
// Both share one pass over the data so the catalog is walked a single time.
type CatalogIndex = {
  byId: Map<string, RawRecord>
  byName: Map<string, RawRecord>
}

// Built once, lazily, then cached so repeated detail views + similar-link
// navigation reuse it instead of rebuilding.
let indexPromise: Promise<CatalogIndex> | null = null

function buildIndex(records: RawRecord[][]): CatalogIndex {
  const byId = new Map<string, RawRecord>()
  const byName = new Map<string, RawRecord>()
  for (const record of records.flat()) {
    // Reorder each record's printings normals-first / specials-last (in-memory
    // only): the detail hero defaults to printings[0] and the printings list
    // renders in array order, so this makes the default a NORMAL print and the
    // list normals-first. The sort is purely per-printing (see isSpecialPrinting)
    // — no cross-set data needed. We index a SHALLOW COPY with the sorted array
    // rather than mutating the shared fetch-cached record (the grid projection
    // reads the same objects). The set of printing ids is unchanged — only their
    // order — so every linkable id still resolves; similar pass-through (byId)
    // and name-form resolution (byName → printings[0].id, now the first normal)
    // keep working.
    const sorted: RawRecord = {
      ...record,
      printings: sortPrintings(record.printings),
    }
    // Name → record (lowercased for case-insensitive name-form similar lookup).
    // First writer wins so a name maps to its first-seen record (then its
    // first printing id), matching how the grid/detail pick a representative
    // printing. Names are unique enough across the catalog that this is stable.
    const nameKey = sorted.name.toLowerCase()
    if (!byName.has(nameKey)) byName.set(nameKey, sorted)
    for (const printing of sorted.printings) {
      // First writer wins — keep the first record seen for a given printing id
      // (ids are unique across the catalog, so collisions aren't expected).
      if (!byId.has(printing.id)) byId.set(printing.id, sorted)
    }
  }
  return { byId, byName }
}

/**
 * Ensures ALL datasets are fetched and the lookup index is built. Reuses
 * data.ts's fetch cache, so this never double-fetches a file the grid loaded.
 * The built index itself is cached in module scope. If a fetch fails, the cached
 * index promise is cleared so a later call can retry.
 *
 * We index every file in ALL_FILES (pokemon + poketools + specials) so a
 * deep-link to ANY card — including a special V/ex/VMAX printing id — resolves.
 */
function ensureIndex(): Promise<CatalogIndex> {
  if (!indexPromise) {
    indexPromise = Promise.all(ALL_FILES.map((file) => fetchFile(file)))
      .then(buildIndex)
      .catch((err) => {
        indexPromise = null
        throw err
      })
  }
  return indexPromise
}

/**
 * Looks up the full detail record for a single card by its printing id.
 *
 * Async: a cold deep-link can hit this before any grid has loaded, so it fetches
 * + indexes the datasets (once) on demand. Returns the matching record as a
 * CardDetail, or null if no card has that id (the detail page renders a
 * "card not found" state for null). Poketool records resolve here too — they
 * carry `rules` + optional Pokémon fields, which CardDetail already allows.
 */
export async function getCardDetail(id: string): Promise<CardDetail | null> {
  const { byId } = await ensureIndex()
  return byId.get(id) ?? null
}

// A resolved `similar` entry: the concrete printing id to link to (#/card/<id>)
// plus the target card's display name (so the chip shows a readable name rather
// than a raw printing id like "sv4-17").
export type SimilarLink = {
  id: string
  name: string
}

/**
 * Resolves a card's raw `similar` tokens into concrete, linkable targets.
 *
 * Each token is either a printing id (pokemon.json) or a card name
 * (poketools.json) — see the header note. For every token we:
 *   1. try it as a printing id (the pokemon-form, and the form #/card/:id wants);
 *   2. else try it as a card name (the poketool-form), mapping to that record's
 *      first printing id.
 * Resolvable tokens become { id, name }; tokens that match neither (stale/typo
 * references) are DROPPED so the UI only ever renders links that actually
 * navigate to a real card. Order is preserved; duplicate resolved ids are
 * collapsed so the same target can't appear twice.
 *
 * Async + index-backed for the same reason as getCardDetail: a cold deep-link
 * can render the detail page (and its Similar section) before any grid has
 * loaded, so we ensure the catalog is fetched/indexed first.
 */
export async function resolveSimilar(tokens: string[]): Promise<SimilarLink[]> {
  const { byId, byName } = await ensureIndex()
  const links: SimilarLink[] = []
  const seen = new Set<string>()
  for (const token of tokens) {
    // Pass-through: the token already IS a printing id (pokemon-form).
    let record = byId.get(token)
    let id = token
    if (!record) {
      // Name-form (poketool): resolve the name to its first printing id.
      record = byName.get(token.toLowerCase())
      id = record?.printings[0]?.id ?? ''
    }
    if (!record || !id || seen.has(id)) continue
    seen.add(id)
    links.push({ id, name: record.name })
  }
  return links
}
