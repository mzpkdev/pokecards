import type { CardCategory, CardDetail, PokemonCard, Printing } from './types'
// Defensive fallback only: real records carry their own printings[0].image
// (remote pokemontcg.io hires URLs). This local, content-hashed asset is used
// purely if a record somehow lacks an image, so a tile never renders empty.
import pikachuCard from './assets/pikachu-card.png'

// ============================================================================
// REAL DATA LAYER
// ----------------------------------------------------------------------------
// The card catalog lives as static JSON under public/database/ (served by Vite
// in dev and shipped into dist/ for GitHub Pages). We FETCH it at runtime — we
// deliberately do NOT `import` the JSON, because pokemon.json is ~4.3MB and an
// import would bundle it into the JS. As a fetched static asset it stays out of
// the bundle and is cached by the browser.
//
// Every fetch URL is prefixed with import.meta.env.BASE_URL so it resolves in
// BOTH environments without hardcoding a path:
//   - dev/preview-at-root → BASE_URL = '/'          → '/database/pokemon.json'
//   - GitHub Pages         → BASE_URL = '/pokecards/' → '/pokecards/database/pokemon.json'
// ============================================================================

// The on-disk record shape (a superset across both files). pokemon.json records
// carry the battle fields; poketools.json records carry `rules` and omit them.
// This matches CardDetail (Pokémon-only fields optional + rules?), so a record
// passes straight through as a CardDetail.
export type RawRecord = CardDetail

// The static dataset files, one per category. Exported so the detail-lookup
// layer (cardDetails.ts) reuses the exact same paths/cache.
export const POKEMON_FILE = 'database/pokemon.json'
export const POKETOOL_FILE = 'database/poketools.json'
export const SPECIAL_FILE = 'database/specials.json'

// Maps a grid category to the static JSON file that backs it. All three
// categories are real fetched datasets. Specials records share the pokemon
// shape PLUS a top-level `rules` field (V/ex/VMAX/… rule text).
const CATEGORY_FILE: Record<CardCategory, string> = {
  pokemon: POKEMON_FILE,
  poketool: POKETOOL_FILE,
  special: SPECIAL_FILE,
}

// All dataset files (used to fetch+index every record for detail lookup).
export const ALL_FILES = [POKEMON_FILE, POKETOOL_FILE, SPECIAL_FILE]

// Module-scoped cache of in-flight/resolved fetches, keyed by file path. Each
// file is fetched at most once for the lifetime of the page; tab switches and
// VirtuosoGrid remounts reuse the cached promise. Lazy: a file is only fetched
// when its tab is first opened (loadCards) or when a detail lookup needs it.
const fileCache = new Map<string, Promise<RawRecord[]>>()

/**
 * Fetches and caches one dataset file (raw records). Resolves the cached promise
 * on subsequent calls. Throws on a non-OK response so callers can show an error.
 *
 * Exported so the detail-lookup layer reuses this exact cache — a file fetched
 * for the grid is reused by getCardDetail and vice versa (fetched at most once).
 */
export function fetchFile(file: string): Promise<RawRecord[]> {
  const cached = fileCache.get(file)
  if (cached) return cached

  const promise = fetch(import.meta.env.BASE_URL + file)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load ${file}: ${res.status}`)
      return res.json() as Promise<RawRecord[]>
    })
    .catch((err) => {
      // Don't poison the cache on failure — drop the entry so a later attempt
      // (e.g. a retry on remount) can try the fetch again.
      fileCache.delete(file)
      throw err
    })

  fileCache.set(file, promise)
  return promise
}

// ============================================================================
// PRINTING ORDERING — push "special" prints (full-art / alt-art / secret-rare /
// gallery variants) to the END so a card's DEFAULT representation is a normal
// print: the grid tile (printings[0]) and the detail hero default (printings[0])
// both land on a normal print, and the detail printings list shows normals
// first, specials last.
// ----------------------------------------------------------------------------
// The data has NO rarity/fullart field — printings carry only
// {id, set, number, image}. We classify with a per-printing heuristic (see
// isSpecialPrinting). The sort is a STABLE partition that preserves each
// printing's original relative order within its group, so we never reorder
// within normals or within specials (alt-art suffixes like _A1/_A3/_A4 are NOT
// reliably sequential, so re-sorting by number would be wrong).
//
// This is an IN-MEMORY projection only: the source JSON is never mutated, and
// sortPrintings returns a NEW array (the input is left untouched) so the shared
// fetch-cached records aren't reordered in place.
// ============================================================================

// number with a letter prefix → set-specific subset printed beyond the main set
// (Shiny Vault SV###, Trainer Gallery TG###, Galarian Gallery GG###, …).
const LETTER_PREFIX_NUMBER = /^[A-Z]{2,}\d+/

// id ending in an alt-art suffix (_A, _A1, _A3, …) → alternate-art variant
// (e.g. cel25c-4_A, cel25c-15_A3).
const ALT_ART_SUFFIX = /_[A-Z]\d*$/

// ----------------------------------------------------------------------------
// CURATED FULL-ART OVERRIDE
// ----------------------------------------------------------------------------
// The two per-printing rules above only catch full-arts that LOOK special from
// their id/number alone (letter-prefix subsets, _A suffixes). They MISS "in
// range" full-arts: a full-art trainer printed with an ordinary numeric `number`
// inside a set that ALSO contains that card's normal print — e.g. Air Balloon's
// full-art `swsh1-213` (the normal is `swsh1-156`), or the Mega Evolution-era
// full-art trainers (me2 #116–122 vs their #85–93 normals). With no rarity
// field on a printing, these are indistinguishable from a normal by rule alone.
//
// This is a hand-curated allow-list of the exact printing IDs that are full-arts
// the heuristic misses. It was built by resolving a user-supplied list of card
// names against the catalog and, for each, identifying the full-art printing(s)
// — the higher-numbered print(s) within a set that also holds a lower normal
// print (and/or a print beyond the set's base-set numeric range). Keying on
// resolved printing IDs (not names) keeps it precise: it forces exactly these
// printings special and nothing else, and a card's normal print stays its
// default (printings[0]) because only the listed full-art ids are pushed last.
//
// To extend: add the full-art printing id(s) for a card; never add its normal
// print (that would leave the card with no normal default).
const CURATED_FULL_ART_IDS = new Set<string>([
  // Air Balloon (normal swsh1-156)
  'swsh1-213',
  // Amarys (normal sv8pt5-93)
  'sv8pt5-132',
  'sv8pt5-170',
  // AZ's Tranquility (normal me4-76)
  'me4-106',
  'me4-120',
  // Battle Cage (normal me2-85)
  'me2-116',
  // Blowtorch (normal me2-86)
  'me2-117',
  // Buddy-Buddy Poffin (normals me1-167, me2pt5-184, sv5-144, sv8pt5-101)
  'sv6-223',
  // Cheren (normal rsv10pt5-81)
  'me2pt5-258',
  // Clive (normal sv4pt5-78)
  'sv4pt5-227',
  'sv4pt5-236',
  // Collapsed Stadium (normal swsh9-137)
  'swsh11-215',
  // Dawn (normal me2-87)
  'me2-118',
  'me2-129',
  // Elesa's Sparkle (normals swsh12pt5-147, swsh8-233)
  'swsh8-260',
  'swsh8-275',
  // Emma (normal me4-77)
  'me4-107',
  // Energy Retrieval (normals rsv10pt5-82, sv1-171, swsh12pt5-127, swsh1-160)
  'me4-108',
  // Fennel (normal zsv10pt5-82)
  'zsv10pt5-162',
  // Firebreather (normal me2-89)
  'me2-119',
  // Grimsley's Move (normal me2-90)
  'me2-120',
  // Harlequin (normal rsv10pt5-83)
  'rsv10pt5-163',
  // Hilda (normal rsv10pt5-84)
  'rsv10pt5-164',
  'rsv10pt5-171',
  // Jacinthe (normal me3-75)
  'me3-110',
  'me3-122',
  // Jamming Tower (normal sv6-153)
  'me2pt5-261',
  'sv10-243',
  // Levincia (normal sv9-150)
  'sv10-244',
  // Lumiose City (normal me3-77)
  'me3-111',
  // N's Plan (normal zsv10pt5-83)
  'zsv10pt5-163',
  'zsv10pt5-170',
  // Naveen (normal me3-79)
  'me3-112',
  // Night Stretcher (normals me1-173, me2pt5-196, sv6pt5-61)
  'sv8-251',
  // Paldean Student (normals sv4pt5-85, sv4pt5-86)
  'sv4pt5-230',
  'sv4pt5-231',
  // Path to the Peak (normal swsh6-148)
  'swsh10-213',
  // Philippe — user-supplied "Phillipe" (likely typo) (normal me4-79)
  'me4-110',
  // Prism Tower (normal me4-80)
  'me4-111',
  // Punk Helmet (normal me2-92)
  'me2-121',
  // Rosa's Encouragement (normal me3-84)
  'me3-114',
  'me3-123',
  // Roxie's Performance (normal me4-81)
  'me4-112',
  'me4-121',
  // Sacred Ash (normal sv10-168)
  'me3-115',
  // Sacred Charm (normal me2-93)
  'me2-122',
  // Special Red Card (normal me4-82)
  'me4-113',
  // Tarragon — user-supplied "Terragon" (likely typo) (normal me3-85)
  'me3-116',
])

/**
 * Classifies a single printing as "special" (full-art / alt-art / gallery
 * variant) using a no-field, purely per-printing heuristic. A printing is
 * special if ANY of:
 *   1. its `id` is in the curated full-art allow-list (in-range full-arts the
 *      letter/suffix rules can't see — see CURATED_FULL_ART_IDS), OR
 *   2. its `number` has a letter prefix (SV###/TG###/GG### subset prints), OR
 *   3. its `id` ends in an alt-art suffix (_A, _A1, …).
 *
 * Rules 2–3 look only at the printing itself (no cross-set data needed); rule 1
 * is a static set lookup. With no rarity field, a full-art/secret printed INSIDE
 * a set's dense numeric range (e.g. Sword & Shield 195/211) is indistinguishable
 * from a normal by rule alone — the curated list (rule 1) backfills the specific
 * ones we know about.
 */
export function isSpecialPrinting(printing: Printing): boolean {
  if (CURATED_FULL_ART_IDS.has(printing.id)) return true
  if (LETTER_PREFIX_NUMBER.test(printing.number)) return true
  if (ALT_ART_SUFFIX.test(printing.id)) return true
  return false
}

/**
 * Stable partition of a printings list into [...normals, ...specials], returning
 * a NEW array (the input is not mutated). Relative order WITHIN each group is
 * preserved exactly as given — we deliberately do NOT re-sort within a group
 * (alt-art suffixes aren't reliably sequential).
 */
export function sortPrintings(printings: Printing[]): Printing[] {
  const normals: Printing[] = []
  const specials: Printing[] = []
  for (const printing of printings) {
    if (isSpecialPrinting(printing)) specials.push(printing)
    else normals.push(printing)
  }
  return [...normals, ...specials]
}

/**
 * Maps a raw record → the lightweight grid tile shape. ONE tile per record
 * (using its first NORMAL printing), not one per printing. printings are sorted
 * normals-first via sortPrintings so the tile image + id come from a normal
 * print where one exists; the id stays a real printing id (the same identifier
 * the detail route + similar[] use), so the tile links to /card/<printing.id>.
 */
function toCard(record: RawRecord, category: CardCategory): PokemonCard {
  const printing = sortPrintings(record.printings ?? [])[0]
  return {
    // First NORMAL printing's id (real records always have ≥1 printing; the
    // ?? '' only guards a record that somehow has none, matching the imageUrl
    // fallback below so a malformed record degrades instead of throwing).
    id: printing?.id ?? '',
    name: record.name,
    // Real cards show their real printing image; fall back to the local Pikachu
    // scan only if a record somehow has no image.
    imageUrl: printing?.image || pikachuCard,
    category,
  }
}

/**
 * Loads the grid tiles for one category. Each category is a real fetched
 * dataset:
 *   - 'pokemon'  → pokemon.json
 *   - 'poketool' → poketools.json
 *   - 'special'  → specials.json   (V/ex/VMAX/VSTAR/… cards; full-foil holo tier)
 *
 * Lazy: a file is only fetched when its tab is first opened. Each file is cached
 * in module scope (fetch once; reused across tab switches and remounts).
 *
 * On a fetch failure (network/404) this REJECTS; CardGrid catches it and renders
 * a graceful error state (and an empty-but-successful dataset renders a tasteful
 * empty state) — so a category never crashes the view.
 */
export async function loadCards(category: CardCategory): Promise<PokemonCard[]> {
  const file = CATEGORY_FILE[category]
  // Lazy: fetch ONLY this category's file. The normals-first sort is purely
  // per-printing (see isSpecialPrinting), so no cross-set data is needed.
  const records = await fetchFile(file)
  return records.map((r) => toCard(r, category))
}

// ============================================================================
// FILTERABLE TILES — search + faceted filtering source shape
// ----------------------------------------------------------------------------
// Client-side search/filtering needs MORE than the lightweight grid tile: it
// reads facet fields (subtypes, role, types, sets, series) and matches a
// free-text query against the card's name + battle/rules text. Rather than re-walk the
// heavyweight CardDetail on every keystroke, we project each record ONCE into a
// FilterableCard that carries the tile fields plus the derived facet values and
// a single precomputed lowercased `search` blob. useCardFilters then does plain
// case-insensitive substring matching on that blob and OR/AND facet checks on
// the arrays — no per-keystroke record traversal, no new deps.
// ============================================================================

// ============================================================================
// SERIES DERIVATION — the data has NO series field; we DERIVE it from the id.
// ----------------------------------------------------------------------------
// Every printing id is a TCG-format `<setcode>-<number>` (e.g. swsh1-22,
// sv6pt5-54, cel25c-107, cel25c-4_A). The setcode is the part before the first
// `-`, and its ALPHA-LEADING family (the leading letters, digits stripped:
// swsh1 → "swsh", sv6pt5 → "sv") cleanly encodes the TCG series/expansion era.
//
// SERIES_PREFIX is the single, hardcoded source of truth mapping that alpha
// family → its series label. It is trivial to extend: when a new set arrives,
// add (or reuse) one alpha-family entry here. The families below are EVERY
// distinct prefix present across pokemon.json / poketools.json / specials.json
// (verified by enumerating split('-')[0] across all printing ids):
//   • sv, rsv, zsv → "Scarlet & Violet"  (rsv/zsv are the SV-era special sets
//                    "White Flare" / "Black Bolt" — folded into SV by design)
//   • swsh         → "Sword & Shield"
//   • cel          → "Celebrations"       (cel25, cel25c)
//   • pgo          → "Pokémon GO"
//   • me           → "Mega Evolution"     (me1–me4, me2pt5: Mega Evolution,
//                    Phantasmal Flames, Ascended Heroes, Perfect Order, Chaos
//                    Rising — all the Mega Evolution era)
// Any family NOT listed here falls back to OTHER_SERIES, so a future setcode
// never yields an empty series — it lands in "Other" until classified.
// ============================================================================
const SERIES_PREFIX: Record<string, string> = {
  sv: 'Scarlet & Violet',
  rsv: 'Scarlet & Violet',
  zsv: 'Scarlet & Violet',
  swsh: 'Sword & Shield',
  cel: 'Celebrations',
  pgo: 'Pokémon GO',
  me: 'Mega Evolution',
}

// Fallback bucket for any setcode whose alpha family isn't in SERIES_PREFIX.
const OTHER_SERIES = 'Other'

/**
 * Derives a card's TCG series from a printing id. Takes the setcode (before the
 * first `-`), reduces it to its leading-alpha family (digits/suffix stripped),
 * and looks that up in SERIES_PREFIX; unknown families → "Other". Exported so
 * the projection (and any future consumer) shares one classification path.
 */
export function seriesOf(id: string): string {
  const setcode = id.split('-')[0] ?? ''
  const family = (setcode.match(/^[a-zA-Z]+/)?.[0] ?? setcode).toLowerCase()
  return SERIES_PREFIX[family] ?? OTHER_SERIES
}

// A grid tile PLUS the precomputed fields the filter UI/logic needs. `tile` is
// the exact PokemonCard the grid renders (so virtualization/holo are unchanged);
// everything else is derived filter metadata built once at load.
export type FilterableCard = {
  tile: PokemonCard
  // Facet values, distinct & lowercased-at-source kept in their ORIGINAL casing
  // for display; matching lowercases on both sides. Empty arrays = no value.
  subtypes: string[]
  roles: string[]
  types: string[]
  // Set names across ALL printings (printings[].set), deduped.
  sets: string[]
  // Distinct TCG series across ALL printings, derived from each printing id's
  // setcode prefix (seriesOf). SEPARATE from `sets` (sets = expansion names;
  // series = the broader era a printing belongs to). Empty only if no printings.
  series: string[]
  // Precomputed lowercased searchable text: name + attack names/text + ability
  // names/text + rules text + role. Built once so search is a cheap substring.
  search: string
}

/**
 * Projects one raw record into a FilterableCard: the grid tile + derived facet
 * fields + a single lowercased search blob (name + attack/ability/rules/role
 * text). Built once per record at load time so filtering never re-walks the
 * heavyweight record.
 */
function toFilterableCard(
  record: RawRecord,
  category: CardCategory,
): FilterableCard {
  // Defensive array reads. CardDetail types `role`/`subtypes`/`printings` as
  // required, but the real data diverges — e.g. EVERY specials.json record OMITS
  // `role` entirely (the key is absent, not []). Iterating an undefined here
  // would throw and reject the whole category load (blanking the grid), so we
  // normalize each list to [] before use.
  const role = record.role ?? []
  const subtypes = record.subtypes ?? []
  const printings = record.printings ?? []

  // Distinct set names across every printing (Set/printing facet sources here).
  const sets = [...new Set(printings.map((p) => p.set))]

  // Distinct TCG series across every printing, derived from each printing id's
  // setcode prefix (seriesOf). Built the same way `sets` is, but keyed on the
  // derived series rather than the raw set name — a card printed across eras
  // (e.g. a reprint) can therefore carry more than one series.
  const series = [...new Set(printings.map((p) => seriesOf(p.id)))]

  // One lowercased blob covering the full documented search scope. Tool cards
  // carry `rules` instead of attacks/abilities; including all fields keeps a
  // single code path that's correct for every category (missing fields are
  // simply empty). role is indexed too so a search like "draw" finds engines.
  const parts: string[] = [record.name]
  for (const a of record.attacks ?? []) {
    parts.push(a.name, a.text)
  }
  for (const ab of record.abilities ?? []) {
    parts.push(ab.name, ab.text)
  }
  for (const rule of record.rules ?? []) {
    parts.push(rule)
  }
  for (const r of role) {
    parts.push(r)
  }

  return {
    tile: toCard(record, category),
    subtypes,
    roles: role,
    types: record.types ?? [],
    sets,
    series,
    search: parts.join('  ').toLowerCase(),
  }
}

// Per-category cache of the projected filterable tiles. Built at most once per
// category for the page lifetime (keyed by category), so switching tabs and
// VirtuosoGrid remounts reuse the same projection — the blob/facet derivation
// is paid once, not on every tab visit.
const filterableCache = new Map<CardCategory, Promise<FilterableCard[]>>()

/**
 * Loads the filterable tiles for one category (grid tile + facet fields +
 * search blob per card). Reuses fetchFile's module-scoped fetch cache, then
 * memoizes the projection per category so the derivation runs once. Rejects on
 * a fetch failure (GridLayout catches it for the error state); the projection
 * itself is dropped from the cache on failure so a later attempt can retry.
 */
export function loadFilterableCards(
  category: CardCategory,
): Promise<FilterableCard[]> {
  const cached = filterableCache.get(category)
  if (cached) return cached

  const file = CATEGORY_FILE[category]
  // Lazy: fetch ONLY this category's file, then project. The normals-first sort
  // is purely per-printing (see isSpecialPrinting), so no cross-set/all-files
  // data is needed — opening one tab fetches one file.
  const promise = fetchFile(file)
    .then((records) => records.map((r) => toFilterableCard(r, category)))
    .catch((err) => {
      filterableCache.delete(category)
      throw err
    })

  filterableCache.set(category, promise)
  return promise
}

// ============================================================================
// GLOBAL MERGED LOAD — every category in one FilterableCard[]
// ----------------------------------------------------------------------------
// The intermediate "related" grid views (role / evolution drill-downs from the
// detail page) draw from ALL THREE categories at once, not a single tab. This
// merged loader fans out to the existing per-category loadFilterableCards calls
// and concatenates the results.
//
// Cache reuse (deliberate, per the product decision):
//   • loadFilterableCards already memoizes each category's projection over
//     fetchFile's module-scoped fetch cache. So a category whose tab was already
//     visited is NOT re-fetched/re-projected here — we reuse its cached promise.
//   • Conversely, warming the global set warms each per-category cache, so a tab
//     opened AFTER a global view is already loaded (its projection promise is in
//     filterableCache from this call).
//
// This is the ~5.6MB first-load path the per-tab UI deliberately avoids; it's
// expected and accepted for these views, and callers show a loading state.
// The merged result is memoized in module scope so the (cheap-but-nonzero)
// concat + dedupe runs once for the page lifetime.
// ============================================================================

// All categories, in display order, for the global merge.
const ALL_CATEGORIES: CardCategory[] = ['pokemon', 'poketool', 'special']

// Module-scoped memo of the merged result. Cleared on failure (below) so a
// later attempt can retry rather than resolving a poisoned/empty set.
let allFilterableCache: Promise<FilterableCard[]> | null = null

/**
 * Loads + merges the filterable tiles for EVERY category into one
 * FilterableCard[]. Fans out to loadFilterableCards per category (reusing their
 * per-category fetch + projection caches), then concatenates and dedupes by card
 * id (tile.id) — first writer wins, so a card appearing in two datasets keeps
 * its first-seen projection. Memoized for the page lifetime.
 *
 * Rejects if ANY category fails to load (the merged view needs the full set);
 * the cached promise is dropped on failure so a remount can retry. Callers
 * (RelatedGridView) render a loading state while this resolves and an error
 * state on rejection.
 */
export function loadAllFilterableCards(): Promise<FilterableCard[]> {
  if (allFilterableCache) return allFilterableCache

  const promise = Promise.all(
    ALL_CATEGORIES.map((category) => loadFilterableCards(category)),
  )
    .then((perCategory) => {
      // Concatenate, then dedupe by tile.id. Ids are globally unique across the
      // catalog (printing ids are TCG-format setcode-number), so overlap isn't
      // expected — but we dedupe defensively so a card can't appear twice if the
      // same printing id somehow lived in two datasets.
      const seen = new Set<string>()
      const merged: FilterableCard[] = []
      for (const cards of perCategory) {
        for (const card of cards) {
          if (seen.has(card.tile.id)) continue
          seen.add(card.tile.id)
          merged.push(card)
        }
      }
      return merged
    })
    .catch((err) => {
      allFilterableCache = null
      throw err
    })

  allFilterableCache = promise
  return promise
}
