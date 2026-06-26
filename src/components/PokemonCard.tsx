import { useCallback, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { PokemonCard as PokemonCardData } from '../types'
import { typeColor } from '../energyIcons'
import { useHoloPointer } from '../useHoloPointer'
import { useProgressiveImage } from '../useProgressiveImage'
import { useVisibleDwell } from '../useVisibleDwell'
// Local, content-hashed asset (Vite rewrites the URL under the '/pokecards/'
// base) so it stays correct on GitHub Pages and never hotlinks.
import pikachuCard from '../assets/pikachu-card.png'

/*
  Holographic pointer tracking adapted from simeydotme/pokemon-cards-css
  (https://github.com/simeydotme/pokemon-cards-css), licensed GPL-3.0.
  Copyright (c) Simon Goellner (simeydotme).

  The pointer→CSS-variable engine (the rAF lerp + Simey's variable contract) now
  lives in the shared useHoloPointer hook (src/useHoloPointer.ts), which both
  this grid tile and the fullscreen CardLightbox consume — so there's exactly one
  holo implementation. This component just attaches the hook's ref + handlers to
  the tile <Link> and renders the ported holo layers (read from index.css). No
  global document/window listeners; the hook is per-element / remount-safe, which
  matters for VirtuosoGrid tile recycling.
*/

type PokemonCardProps = {
  card: PokemonCardData
}

// How long a tile must stay in view before it auto-upgrades to full-res (ms).
// Backs the dwell trigger that covers touch / passive browsing (where the
// hover/focus upgrade never fires); long enough that flicking past a tile during
// a scroll doesn't kick off a load. Tune to taste.
const VISIBLE_DWELL_MS = 1500

export default function PokemonCard({ card }: PokemonCardProps) {
  const isSpecial = card.category === 'special'
  // Real cards carry their printings[0].image (a remote pokemontcg.io hires URL),
  // mapped onto card.imageUrl in data.ts. The Pikachu asset is only a defensive
  // fallback if a record somehow lacks an image (data.ts already applies it, so
  // this `||` is belt-and-suspenders). Broken remote images are handled below.
  const lowSrc = card.imageUrl || pikachuCard
  const isFallback = !card.imageUrl
  const alt = isFallback ? `${card.name} (placeholder image)` : card.name
  // Progressive image: the tile renders the small CDN variant (lowSrc) as the
  // base layer; on hover / focus we preload the full-res scan and, once it has
  // decoded (showHires), stack it as a SECOND <img> over the base (see
  // useProgressiveImage + .pc-thumb-img--hires). The base never unmounts, so the
  // hi-res fades in on top instead of the base's src swapping and flashing blank.
  // `upgrade` is wired to onPointerEnter + onFocus below.
  const { showHires, upgrade } = useProgressiveImage(lowSrc, card.imageHiresUrl)

  // Shared holo engine: the callback ref to attach to the holo element plus the
  // pointer handlers. Same mechanism the lightbox uses. Destructured at the call
  // site so the handlers read as plain values (not properties of a ref-bearing
  // object) during render.
  const { ref: holoRef, onPointerEnter, onPointerMove, onPointerLeave } =
    useHoloPointer()

  // Second upgrade trigger: when the tile has dwelled in view for a beat (covers
  // touch / passive browsing, where hover/focus never fires). useVisibleDwell
  // returns a callback ref, which we MERGE with the holo ref into one ref on the
  // tile below — both the holo engine and the dwell observer need the node, and
  // an element takes a single `ref`. `upgrade` is idempotent, so hover + dwell
  // firing for the same card can't double-load.
  const dwellRef = useVisibleDwell(upgrade, VISIBLE_DWELL_MS)
  const setTileRef = useCallback(
    (el: HTMLElement | null) => {
      holoRef(el)
      dwellRef(el)
    },
    [holoRef, dwellRef],
  )

  // Per-card tint hook: resolve the PRIMARY energy type to its color and hand it
  // to the tile as a CSS custom property. index.css drives a SUBTLE background
  // wash on .pc-thumb off this var, so the whole palette stays in one place
  // (energyIcons.ts) and no hex is inlined here. No-type cards (Trainers/Tools)
  // and unknown values resolve to the neutral gray inside typeColor(). The cast
  // is only because '--card-type-color' isn't a known CSSProperties key.
  const tintStyle = {
    '--card-type-color': typeColor(card.types),
  } as CSSProperties

  return (
    // The tile IS the link: making .pc-card a react-router <Link> (a real <a>)
    // keeps the holo geometry identical — same element the holo ref points at, same
    // bounding box getBoundingClientRect reads, same node the CSS vars are written
    // to — so the tilt/clip/3D are untouched; we only added navigation. onClick
    // (the anchor's) is orthogonal to onPointerMove, so the holo pointer tracking
    // coexists with the click. Anchors are focusable + activate on Enter natively;
    // we add Space (onKeyDown) so it matches button-like keyboard activation.
    // No overflow-hidden / rounded-* here: the Pikachu scan already has its own
    // border + rounded corners baked in, so clipping the frame would fight them
    // and produce doubled/mismatched corners. The frame is just a shadow now.
    //
    // holo.ref is the hook's stable callback ref (RefCallback<HTMLElement>); it
    // accepts this anchor where <Link> wants an HTMLAnchorElement, so we hand it
    // straight to ref= with no cast and no local assignment (keeping the
    // react-hooks/immutability rule happy — the hook owns the node).
    <Link
      to={`/card/${card.id}`}
      ref={setTileRef}
      data-category={card.category}
      style={tintStyle}
      aria-label={`View ${card.name} details`}
      onPointerEnter={(e) => {
        // Holo tracking + kick off the hi-res upgrade for the hovered card.
        onPointerEnter(e)
        upgrade()
      }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      // Keyboard users get the upgrade too: focusing the tile (tab) triggers it.
      onFocus={upgrade}
      onKeyDown={(e) => {
        // Anchors fire on Enter for free; add Space to match button semantics
        // (and prevent the default page-scroll that Space would otherwise cause).
        // e.currentTarget is this anchor, so we activate it directly rather than
        // reaching through the holo hook's (now private) node.
        if (e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault()
          e.currentTarget.click()
        }
      }}
      className={[
        'pc-card pc-card-link relative flex flex-col',
        isSpecial ? 'pc-card--special' : '',
      ].join(' ')}
    >
      {/* card__rotator: the 3D-tilted layer (perspective lives on .pc-card).
          Holds the art plus the holo overlays so they tilt together — matches
          Simey's translater > rotator > front(img + shine + glare) structure. */}
      <div className="pc-thumb">
        <div className="pc-rotator">
          <img
            src={lowSrc}
            alt={alt}
            // Remote pokemontcg.io art: async decode + lazy load so 3914 remote
            // images don't block the main thread on scroll (sync decode made
            // sense only for the old single cached local asset). VirtuosoGrid's
            // increaseViewportBy still pre-mounts tiles before they enter view, so
            // they decode ahead of time and don't pop. On a broken/404 remote URL
            // we swap to the local Pikachu fallback once (guarded so it can't loop).
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={(e) => {
              // Swap to the local fallback exactly once. A data flag guards
              // against an error loop if the fallback itself ever failed (the
              // src getter is absolute, so we can't compare it to the import).
              const img = e.currentTarget
              if (img.dataset.fallback) return
              img.dataset.fallback = '1'
              img.src = pikachuCard
            }}
            className="pc-thumb-img pc-thumb-img--low"
          />
          {/* Holographic overlays ported from simeydotme/pokemon-cards-css.
              Both sit above the art, are clipped to the card's rounded rect by
              .pc-rotator's own overflow:hidden, and are invisible (--card-opacity 0) at
              rest — the resting card stays the clean image. pointer-events:none so
              they never intercept the pointer tracking. */}
          {/* Hi-res overlay — mounts only after the full-res preload has
              decoded (showHires), grid-stacked into the same rotator cell ON TOP
              of the low-res base img. Because the base never unmounts, the hi-res
              fades in over it (CSS .pc-thumb-img--hires) instead of flashing
              blank. It sits above the base (DOM order) but below the shine/glare
              (their positive z-index), so the foil still renders over it. */}
          {showHires && card.imageHiresUrl && (
            <img
              src={card.imageHiresUrl}
              alt=""
              aria-hidden="true"
              decoding="async"
              draggable={false}
              className="pc-thumb-img pc-thumb-img--hires"
            />
          )}
          <div className="pc-shine" aria-hidden="true" />
          <div className="pc-glare" aria-hidden="true" />
        </div>
      </div>
    </Link>
  )
}
