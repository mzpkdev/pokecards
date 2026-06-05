import { useCallback, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useHoloPointer } from '../useHoloPointer'

/*
  Fullscreen "lightbox" card view for the detail page. A modal overlay (NOT a
  route): a fixed full-viewport backdrop with the card centered and enlarged,
  running the SAME pointer-tracked holographic foil as the grid tile via the
  shared useHoloPointer hook + the ported .pc-card / .pc-rotator / .pc-shine /
  .pc-glare layers from index.css. The big card carries data-category="special"
  so it always shows the FULL foil (rainbow + glitter + glare), whatever the
  card's real category.

  Behavior: opens from the detail hero, closes on Escape and backdrop click
  (clicking the card itself does NOT close). A11y: role="dialog" + aria-modal,
  labelled by the card name, focus trapped while open and restored to the trigger
  on close, body scroll locked while open.

  RENDERING: the whole overlay is portalled to document.body via createPortal, so
  it escapes the detail page's ancestor stacking context. The page tree sits
  UNDER RouteFade's wrapper, whose route-change opacity animation establishes a
  stacking context; the shared <AppHeader> (position:relative; z-index:1) is a
  sibling of that wrapper, so a fixed backdrop rendered INSIDE the page would be
  trapped in the wrapper's context and paint UNDER the header/tabs (the original
  bug). Portalling to <body> makes the fixed, top-most-z-index backdrop resolve
  against the document root, so it covers the ENTIRE viewport including the topbar.
*/

type CardLightboxProps = {
  // The currently-selected printing's hires image + the card name. The detail
  // page passes its derived `hero.image` here, so the lightbox always shows
  // whatever printing is active in the switcher (not a hardcoded first printing).
  src: string
  name: string
  // Close the overlay. The detail page also restores focus to the trigger after
  // this resolves (we call back into a ref it owns), but we additionally guard
  // focus restoration here so the component is self-contained.
  onClose: () => void
}

export default function CardLightbox({ src, name, onClose }: CardLightboxProps) {
  // Stable id to wire aria-labelledby → the visually-hidden dialog title.
  const titleId = useId()
  // The backdrop (dialog root) — focus lands here on open, and the focus trap
  // keeps Tab inside it. The card is non-focusable, so the dialog itself is the
  // sole focus stop, which is the simplest correct trap for an image viewer.
  const dialogRef = useRef<HTMLDivElement>(null)
  // The element focused when the lightbox opened, so we can restore focus to it
  // (the hero trigger) on close — required for keyboard/AT users.
  const triggerRef = useRef<Element | null>(null)

  // Shared holo engine drives the big card exactly like a grid tile. Destructured
  // so the handlers read as plain values (not props of a ref-bearing object).
  const { ref: holoRef, onPointerEnter, onPointerMove, onPointerLeave } =
    useHoloPointer()

  // Escape closes. We listen on the document (capture) for the lifetime of the
  // overlay only; the effect cleanup removes it, so nothing leaks after close.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Body scroll lock while open: stash the prior overflow and restore it on
  // close so we never clobber a value some other code set.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // On mount: remember the trigger, move focus into the dialog. On unmount:
  // restore focus to the trigger (if it's still in the document and focusable).
  useEffect(() => {
    triggerRef.current = document.activeElement
    dialogRef.current?.focus()
    return () => {
      const trigger = triggerRef.current
      if (trigger instanceof HTMLElement && document.contains(trigger)) {
        trigger.focus()
      }
    }
  }, [])

  // Focus trap: the dialog root is the only focusable element, so any Tab /
  // Shift+Tab just keeps focus on it. Cheaper and more robust than scanning for
  // focusables when the only interactive affordances are Escape + backdrop click.
  const handleTrapKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      dialogRef.current?.focus()
    }
  }, [])

  // Portal target: document.body, so the fixed full-viewport backdrop escapes
  // RouteFade's stacking context and overlays EVERYTHING (incl. the topbar).
  return createPortal(
    // Backdrop = the dialog root. Clicking it closes (target === currentTarget
    // guards against clicks that bubbled up from the card). It's focusable
    // (tabIndex -1) so we can move focus here on open and trap it.
    <div
      ref={dialogRef}
      className="lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={handleTrapKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Visually-hidden accessible name for the dialog. */}
      <span id={titleId} className="sr-only">
        {name} — enlarged card
      </span>

      {/* The big holo card. Reuses the ported .pc-card / .pc-rotator / .pc-shine
          / .pc-glare layer structure (so it reads the exact same CSS-variable
          contract the hook writes), plus a --lightbox modifier that sizes it
          large/centered. data-category="special" opts it into the FULL foil path
          (rainbow + glitter + glare) regardless of the card's real category — the
          fullscreen view always shows the full holo. We deliberately do NOT add
          the .pc-card--special class, so it gets no stray gold-glow box-shadow.
          A <figure> (not a button/link) — it's a viewer, not an action; clicks on
          it must NOT close, so we stop propagation to the backdrop. */}
      <figure
        ref={holoRef}
        data-category="special"
        className="pc-card pc-card--lightbox"
        onPointerEnter={onPointerEnter}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={(e) => e.stopPropagation()}
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
    </div>,
    document.body,
  )
}
