// Which tab a card belongs to. Buckets are mutually exclusive: every card is
// exactly one of these.
export type CardCategory = 'pokemon' | 'poketool' | 'special'

// Special-card subtype. Only cards with category 'special' carry a variant.
export type SpecialVariant = 'gx' | 'ex' | 'mega' | 'v' | 'vmax' | 'vstar'

export type PokemonCard = {
  id: string
  name: string
  imageUrl: string
  category: CardCategory
  variant?: SpecialVariant
  setName?: string
  number?: string
  rarity?: string
}

// ============================================================================
// CARD DETAIL — the full per-card data shown on the detail page (#/card/:id).
// Modeled on the pokemontcg.io card shape (see the Pinsir sample in
// cardDetails.ts). The grid `PokemonCard` above is the lightweight tile shape;
// this is the heavyweight record fetched/looked up only when a card is opened.
// ============================================================================

// One of a Pokémon's attacks. `cost` is a list of energy *type* names (e.g.
// ['Grass','Colorless']) — the detail page renders each as a colored pip.
// `damage`/`text` may be empty strings (e.g. effect-only attacks).
export type Attack = {
  name: string
  cost: string[]
  damage: string
  text: string
}

// Weakness / resistance entry, e.g. { type: 'Fire', value: '×2' }.
export type Weakness = {
  type: string
  value: string
}

// Resistances share the exact same shape as weaknesses.
export type Resistance = Weakness

// An ability/poke-power line. The sample has none, so this is a reasonable
// shape: a name + rules text, with an optional kind (e.g. 'Ability', 'Poké-Power').
export type Ability = {
  name: string
  text: string
  type?: string
}

// A specific printing of the card across sets. `image` is a real
// pokemontcg.io hires URL (external img is allowed on the detail page).
export type Printing = {
  id: string
  set: string
  number: string
  image: string
}

// The full detail record for a single card.
//
// This shape covers BOTH datasets:
//   - pokemon.json records carry hp/types/attacks/weaknesses/etc.
//   - poketools.json records (Trainer/Tool cards) carry `rules` instead and
//     LACK the battle fields entirely.
// So every Pokémon-only field is optional, and `rules` is added for tools. The
// detail page already omits empty sections, so a record simply not having a
// field renders nothing for it. `name`, `subtypes`, `role`, `similar` and
// `printings` are present on every record in both files, so they stay required.
export type CardDetail = {
  name: string
  subtypes: string[]
  hp?: string
  types?: string[]
  evolves_from?: string | null
  evolves_to?: string[]
  abilities?: Ability[]
  attacks?: Attack[]
  weaknesses?: Weakness[]
  resistances?: Resistance[]
  retreat_cost?: string[]
  // Trainer/Tool rules text (poketools.json). Pokémon records don't have this.
  rules?: string[]
  // National Pokédex number(s) for the species on this card. Backfilled into
  // pokemon.json + specials.json from pokemontcg.io (gap-filled via PokéAPI).
  // An array because TAG TEAM / multi-species cards legitimately carry 2+ (e.g.
  // Pikachu & Zekrom-GX → [25, 644]). Absent on poketools.json (Trainer/Item
  // cards have no species), so optional; an empty [] means "unknown".
  national_pokedex?: number[]
  role: string[]
  similar: string[]
  printings: Printing[]
}
