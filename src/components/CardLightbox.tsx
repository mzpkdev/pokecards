import { Dialog, Portal } from '@ark-ui/react'
import { useHoloPointer } from '../useHoloPointer'

/*
  Fullscreen "lightbox" card view for the detail page. A modal overlay (NOT a
  route): a fixed full-viewport backdrop with the card centered and enlarged,
  running the SAME pointer-tracked holographic foil as the grid tile via the
  shared useHoloPointer hook + the ported .pc-card / .pc-rotator / .pc-shine /
  .pc-glare layers from index.css. The big card carries data-category="special"
  so it always shows the FULL foil (rainbow + glitter + glare), whatever the
  card's real category.

  ARK UI MIGRATION (reference conversion — see ARK_MIGRATION.md):
  This widget is now built on Ark UI's headless Dialog (Zag.js state machine)
  rather than hand-rolled effects. The Zag dialog machine supplies, for free and
  more robustly, everything the old hand-written version did by hand:
    • focus trap while open            (trapFocus, default true)
    • Escape-to-close                  (closeOnEscape, default true)
    • backdrop / click-outside close   (closeOnInteractOutside, default true)
    • body scroll lock while open      (preventScroll, default true)
    • focus restored to the trigger    (restoreFocus, default true)
    • role="dialog" + aria-modal       (modal, default true)
    • content rendered into a Portal   (<Portal> → document.body)
  We REUSE the exact same litewind/index.css class names on each Ark PART so the
  visuals are byte-identical: the dim, centered, vignetted stage is .lightbox-
  backdrop (now on Dialog.Positioner — it still does the grid-centering + the dim
  gradient + the fade), and the enlarged holo card is the same .pc-card
  .pc-card--lightbox structure inside Dialog.Content.

  OPEN STATE / TRIGGER OWNERSHIP: the detail page owns both the trigger (the hero
  button) and the open boolean — it conditionally MOUNTS this component only while
  open and passes onClose. We keep that contract: Dialog.Root is rendered with a
  controlled open=true for the lifetime of the mount, and onOpenChange(false)
  (Escape / outside-click / close button) calls back into onClose so the detail
  page unmounts us. The hero button stays the trigger; Ark restores focus to it on
  close (the detail page also restores focus to its heroButtonRef, which is the
  same element — an idempotent double-focus, harmless).

  RENDERING: Dialog content is portalled to document.body via Ark's <Portal>, so
  the fixed full-viewport stage escapes the detail page's ancestor stacking
  context. The page tree sits UNDER RouteFade's wrapper, whose route-change
  opacity animation establishes a stacking context; the shared <AppHeader>
  (position:relative; z-index:1) is a sibling of that wrapper, so a fixed backdrop
  rendered INSIDE the page would be trapped in the wrapper's context and paint
  UNDER the header/tabs (the original bug). Portalling to <body> makes the fixed,
  top-most-z-index stage resolve against the document root, so it covers the
  ENTIRE viewport including the topbar.
*/

type CardLightboxProps = {
  // The currently-selected printing's hires image + the card name. The detail
  // page passes its derived `hero.image` here, so the lightbox always shows
  // whatever printing is active in the switcher (not a hardcoded first printing).
  src: string
  name: string
  // Close the overlay. The detail page also restores focus to the trigger after
  // this resolves (we call back into a ref it owns); Ark's Dialog additionally
  // restores focus to the previously-focused element, so focus is correct even
  // viewed as a self-contained component.
  onClose: () => void
}

export default function CardLightbox({ src, name, onClose }: CardLightboxProps) {
  // Shared holo engine drives the big card exactly like a grid tile. Destructured
  // so the handlers read as plain values (not props of a ref-bearing object).
  const { ref: holoRef, onPointerEnter, onPointerMove, onPointerLeave } =
    useHoloPointer()

  // The detail page mounts us only while open and owns the open boolean, so we
  // run the Ark dialog as a CONTROLLED dialog pinned open for the mount's
  // lifetime; any close intent (Escape, click-outside, close button) flows back
  // through onOpenChange → onClose so the detail page unmounts us. Ark derives
  // the dialog's accessible name from the rendered <Dialog.Title> below
  // (auto-wiring aria-labelledby on the content), so we DON'T set ids ourselves.
  return (
    <Dialog.Root
      open
      onOpenChange={(details) => {
        if (!details.open) onClose()
      }}
    >
      <Portal>
        {/* The dim, centered, vignetted stage. Reuses .lightbox-backdrop verbatim
            (fixed + inset, grid place-items:center, the gold/coral/blue vignette,
            the fade-in, and cursor:zoom-out as the close affordance). Living on
            the POSITIONER (Ark's centering part) preserves the original single-
            element stage: clicking anywhere on it that isn't the card fires Ark's
            interact-outside → onClose, exactly like the old backdrop click. */}
        <Dialog.Positioner className="lightbox-backdrop">
          {/* The dialog surface. The a11y contract (role="dialog" + aria-modal,
              the focus trap target) lives here, supplied by Ark. We carry the
              big holo card itself; it's display:contents so it adds no box and the
              existing .pc-card--lightbox geometry/centering is unchanged. The
              card must NOT close on click — Ark only closes on interaction OUTSIDE
              this content, so clicks on the card are inert by construction (no
              manual stopPropagation needed). */}
          <Dialog.Content className="lightbox-content">
            {/* Visually-hidden accessible name for the dialog. Rendering a
                Dialog.Title makes Ark auto-set aria-labelledby on the content to
                this node's (Ark-generated) id — keep .sr-only so it's announced
                to AT but invisible, exactly like the original sr-only span. */}
            <Dialog.Title className="sr-only">
              {name} — enlarged card
            </Dialog.Title>

            {/* The big holo card. Reuses the ported .pc-card / .pc-rotator /
                .pc-shine / .pc-glare layer structure (so it reads the exact same
                CSS-variable contract the hook writes), plus a --lightbox modifier
                that sizes it large/centered. data-category="special" opts it into
                the FULL foil path (rainbow + glitter + glare) regardless of the
                card's real category — the fullscreen view always shows the full
                holo. We deliberately do NOT add the .pc-card--special class, so it
                gets no stray gold-glow box-shadow. A <figure> (not a button/link)
                — it's a viewer, not an action. */}
            <figure
              ref={holoRef}
              data-category="special"
              className="pc-card pc-card--lightbox"
              onPointerEnter={onPointerEnter}
              onPointerMove={onPointerMove}
              onPointerLeave={onPointerLeave}
            >
              <div className="pc-thumb">
                <div className="pc-rotator">
                  <img
                    src={src}
                    alt={`${name} card`}
                    className="pc-thumb-img"
                    decoding="async"
                    draggable={false}
                  />
                  <div className="pc-shine" aria-hidden="true" />
                  <div className="pc-glare" aria-hidden="true" />
                </div>
              </div>
            </figure>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
