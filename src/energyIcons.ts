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

// ============================================================================
// TYPE → TINT COLOR — the per-energy hue used to wash a grid tile's background.
// ----------------------------------------------------------------------------
// SAME 11 TCG type identifiers as ENERGY_ICON above (verified against the data:
// pokemon.json + specials.json carry exactly Grass/Fire/Water/Lightning/Psychic/
// Fighting/Darkness/Metal/Colorless/Dragon, plus Fairy on specials; poketools
// have no `types` at all). The icons are self-colored SVGs, so there was no
// existing per-type CSS color to reuse — these are the canonical Pokémon TCG
// type hues, picked at a mid saturation since index.css applies them as a SOFT,
// low-alpha wash behind the card art (so the tint only ever reads as a gentle
// hint, never a saturated fill). Colorless → a neutral slate gray, which is also
// the fallback below for any no-type tile (Trainers/Tools) or unknown value.
const NEUTRAL_TYPE_COLOR = '#9aa0ad' // Colorless / no-type → neutral gray

const TYPE_COLOR: Record<string, string> = {
  Grass: '#4caf50', // green
  Fire: '#ff5a4d', // red
  Water: '#2f8fe0', // blue
  Lightning: '#f2c029', // yellow
  Psychic: '#a35fd0', // purple
  Fighting: '#c0703f', // orange-brown
  Darkness: '#4a5568', // dark slate
  Metal: '#8a93a3', // steel gray
  Fairy: '#ec78b8', // pink
  Dragon: '#caa53d', // gold
  Colorless: NEUTRAL_TYPE_COLOR,
}

// Resolve a card's PRIMARY (first) type to its tint color. Multi-type cards use
// types[0]; a missing/empty array (Trainers/Tools) or an unknown value falls
// back to the neutral gray, so every tile gets a defined --card-type-color.
export function typeColor(types: string[] | undefined): string {
  const primary = types?.[0]
  return (primary && TYPE_COLOR[primary]) || NEUTRAL_TYPE_COLOR
}
