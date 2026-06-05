// ============================================================================
// ENERGY / TYPE ICONS — TCG energy name → vendored SVG symbol.
// ----------------------------------------------------------------------------
// The card detail page renders a real per-type icon everywhere a type/energy
// appears (attack costs, type badges, weaknesses, resistances, retreat cost),
// instead of a letter-in-a-circle. The SVGs are vendored locally under
// ./assets/energy/ — these are the official Pokémon TCG energy symbols
// (™/© Nintendo / Creatures / GAME FREAK; see that folder's ATTRIBUTION.md) and
// imported here so Vite content-hashes them and keeps the /pokecards/ base
// correct (no runtime CDN hotlinking).
//
// The filenames keep the original video-game type names (electric/dark/steel/
// normal); we alias them to the TCG energy names that actually appear in
// public/database/*.json. The data's
// distinct strings (scanned across all three files) are exactly the standard 11
// energies — Grass, Fire, Water, Lightning, Psychic, Fighting, Darkness, Metal,
// Fairy, Dragon, Colorless — plus one data-only value, `Free` (used in some
// attacks' `cost` arrays to mean a no-cost attack), which reuses the Colorless
// icon. Each imported `*.svg` resolves to a hashed URL string at build time.
// ============================================================================

import grass from './assets/energy/grass.svg'
import fire from './assets/energy/fire.svg'
import water from './assets/energy/water.svg'
import electric from './assets/energy/electric.svg'
import psychic from './assets/energy/psychic.svg'
import fighting from './assets/energy/fighting.svg'
import dark from './assets/energy/dark.svg'
import steel from './assets/energy/steel.svg'
import fairy from './assets/energy/fairy.svg'
import dragon from './assets/energy/dragon.svg'
import normal from './assets/energy/normal.svg'

// TCG energy name → icon URL. Colorless uses the "normal" icon; `Free` (data
// only) aliases to it too. Unknown/missing types fall back to it via get
// energyIcon below, so the UI never shows a broken image.
const ENERGY_ICON: Record<string, string> = {
  Grass: grass,
  Fire: fire,
  Water: water,
  Lightning: electric,
  Psychic: psychic,
  Fighting: fighting,
  Darkness: dark,
  Metal: steel,
  Fairy: fairy,
  Dragon: dragon,
  Colorless: normal,
  // Data-only value seen in some attack cost arrays (a "no energy" attack).
  Free: normal,
}

// Resolve a type/energy name to its icon URL, falling back to the neutral
// Colorless icon for anything unrecognized (defensive: no crash, no broken img).
export function energyIcon(type: string): string {
  return ENERGY_ICON[type] ?? normal
}
