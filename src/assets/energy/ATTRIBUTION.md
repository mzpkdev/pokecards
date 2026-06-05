# Energy / type icons

The energy-type symbols rendered on the card detail page (attack costs, type
badges, weaknesses, resistances, retreat cost) are the **official Pokémon
Trading Card Game energy symbols** — the glossy circular type emblems printed on
real cards.

These symbols are **™/© Nintendo / Creatures Inc. / GAME FREAK Inc.** They are
trademarked, copyrighted assets and are **not** offered under any open license.
They are vendored here and displayed solely for **non-commercial, personal /
fan** purposes (a hobby card viewer), with no affiliation with or endorsement by
the rights holders.

The source artwork is the standard TCG energy symbol set as catalogued on the
[Bulbagarden Archives](https://archives.bulbagarden.net/) (the media wiki behind
Bulbapedia), files `*-attack.png` from
[Type (TCG)](https://bulbapedia.bulbagarden.net/wiki/Type_(TCG)). Each original
85×85 transparent PNG (a full-bleed circular emblem) is embedded inside a square
256×256 SVG wrapper so the icon fills the existing circular pip/badge containers
with no CSS change.

## File mapping

The vendored filenames keep the original video-game type names; `energyIcon()`
(in `src/energyIcons.ts`) aliases the TCG energy names that appear in
`public/database/*.json` to them:

| TCG energy            | vendored file  |
| --------------------- | -------------- |
| Grass                 | `grass.svg`    |
| Fire                  | `fire.svg`     |
| Water                 | `water.svg`    |
| Lightning             | `electric.svg` |
| Psychic               | `psychic.svg`  |
| Fighting              | `fighting.svg` |
| Darkness              | `dark.svg`     |
| Metal                 | `steel.svg`    |
| Fairy                 | `fairy.svg`    |
| Dragon                | `dragon.svg`   |
| Colorless / Free      | `normal.svg`   |

`Free` (a data-only value that appears in some attacks' `cost` arrays to denote
a no-cost attack) reuses the Colorless/`normal` icon. Any unknown/missing type
also falls back to that icon, so the UI never renders a broken image.
