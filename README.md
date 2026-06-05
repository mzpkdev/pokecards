# Pokécards

A Pokémon card viewer: fetches a JSON list of cards and renders them in a virtualized grid. Built with Vite + React + TypeScript.

## Quick start

```bash
npm install      # install dependencies
npm run dev      # start the dev server
npm run build    # type-check (tsc) + production build to dist/
npm run preview  # preview the production build locally
```

## Styling

Styling uses **litewind** — a prebuilt, static Tailwind CSS file loaded over a CDN via a `<link>` tag in `index.html`. There is **no Tailwind build step**: no `tailwindcss`/`postcss`/`autoprefixer` dependency and no `tailwind.config`. You style purely by writing Tailwind utility class names in JSX, and the static CSS file resolves them.

## Data

The cards are **placeholder data** right now — there is no real JSON source yet. The data layer lives in `src/data.ts`, which exposes an async `loadCards()` function. It currently returns a mock array but is already the seam for a future real JSON fetch (the commented-out skeleton shows the intended `fetch(import.meta.env.BASE_URL + 'cards.json')`). Swapping in real data won't change the call site in `CardGrid`.

## Deployment

The app auto-deploys to **https://mzpkdev.github.io/pokecards/** on every push to `main`, via the GitHub Actions workflow in `.github/workflows/deploy.yml`. Because this is a GitHub Pages *project* page, Vite is configured with `base: '/pokecards/'`.

One-time manual setup (cannot be done from code): in the repository, go to **Settings → Pages → Build and deployment → Source** and select **"GitHub Actions"**. After that, pushes to `main` will build and publish automatically.

## Credits

The interactive holographic card effect (the pointer-tracked tilt, the rainbow "sunpillar" foil, and the glare) is **adapted from [simeydotme/pokemon-cards-css](https://github.com/simeydotme/pokemon-cards-css)** by Simon Goellner — the project behind [poke-holo.simey.me](https://poke-holo.simey.me/). The CSS layer stack and the pointer→CSS-variable contract in `src/index.css` and `src/components/PokemonCard.tsx` are ported from that project, and the `glitter.png` / `grain.webp` foil textures under `src/assets/holo/` are its original assets.

That project is licensed under the **GPL-3.0** license, and the portions adapted here are used under those terms.

The energy/type symbols on the card detail page (attack costs, type badges, weaknesses, resistances, retreat cost) are the **official Pokémon Trading Card Game energy symbols** — the circular type emblems printed on real cards. These are **™/© Nintendo / Creatures Inc. / GAME FREAK Inc.**; they are trademarked, copyrighted assets used here purely for **non-commercial, personal / fan display** (this is a hobby project, not affiliated with or endorsed by the rights holders). The artwork is the standard energy symbol set catalogued on the [Bulbagarden Archives](https://archives.bulbagarden.net/) and is vendored locally under `src/assets/energy/` (each original transparent PNG wrapped in a square SVG), with a mapping/attribution note at `src/assets/energy/ATTRIBUTION.md`. Only the eleven symbols needed for the standard TCG energies are included.
