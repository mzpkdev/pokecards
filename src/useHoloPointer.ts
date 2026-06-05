import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, RefCallback } from 'react'

/*
  Holographic pointer tracking adapted from simeydotme/pokemon-cards-css
  (https://github.com/simeydotme/pokemon-cards-css), licensed GPL-3.0.
  Copyright (c) Simon Goellner (simeydotme).

  This hook is the SHARED holo mechanism — the pointer→CSS-variable mapping
  mirrors the `interact()` handler in that project's src/lib/components/Card.svelte
  so the ported CSS in index.css reads the exact same variable contract
  (--pointer-x/y, --pointer-from-center/top/left, --rotate-x/y, --background-x/y,
  --card-opacity, --card-scale). We swap Svelte's `spring` motion for a
  lightweight rAF lerp (no new deps) and keep everything per-element /
  remount-safe via a returned ref + JSX handlers — no global document/window
  listeners that could leak across VirtuosoGrid remounts.

  Both the grid tile (PokemonCard) and the fullscreen lightbox (CardLightbox)
  consume this hook, so the holo logic lives in exactly one place; the CSS that
  reads the variable contract (`.card`/holo layers in index.css) is shared too.
*/

// Faithful ports of simeydotme/pokemon-cards-css src/lib/helpers/Math.js.
const round = (value: number, precision = 3) => parseFloat(value.toFixed(precision))
const clamp = (value: number, min = 0, max = 100) => Math.min(Math.max(value, min), max)
const adjust = (
  value: number,
  fromMin: number,
  fromMax: number,
  toMin: number,
  toMax: number,
) => round(toMin + ((toMax - toMin) * (value - fromMin)) / (fromMax - fromMin))

// Resting (neutral) state — flat card, glare centered, foil hidden (opacity 0).
const REST = {
  px: 50,
  py: 50,
  bx: 50,
  by: 50,
  rx: 0,
  ry: 0,
  o: 0,
}

// rAF lerp factor toward the target each frame (Simey uses a Svelte spring; this
// is a dependency-free approximation — fast enough to track, smooth on ease-out).
const LERP = 0.18

// What the hook returns: a callback ref to attach to the holo element plus the
// three pointer handlers to spread onto it. `ref` is a RefCallback<HTMLElement>
// (NOT a RefObject) on purpose: the element node is stored in a ref PRIVATE to
// the hook, and the only mutation of it happens inside that callback — i.e.
// inside the hook — which keeps the react-hooks/immutability rule satisfied
// (consumers never assign to a value the hook returned). A RefCallback<HTMLElement>
// is assignable to both <figure ref> (HTMLElement) and <Link ref> (it accepts
// the wider HTMLElement where an HTMLAnchorElement is expected), so the one hook
// drives the grid tile's <a> and the lightbox's <figure> without a cast.
export type HoloPointer = {
  ref: RefCallback<HTMLElement>
  onPointerEnter: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerLeave: () => void
}

// The pointer-tracked holo engine. Wired through the returned ref + JSX
// handlers, so when the consumer unmounts (VirtuosoGrid recycling, lightbox
// close) React tears the listeners down for us. We deliberately do NOT
// addEventListener on document/window, which is what would otherwise leak.
export function useHoloPointer(): HoloPointer {
  // The holo element node, kept in a ref PRIVATE to the hook. Consumers attach
  // it via the `setRef` callback returned below (not by writing this directly),
  // so the only place this is mutated is inside the hook.
  const nodeRef = useRef<HTMLElement | null>(null)
  const rafRef = useRef<number | null>(null)
  // Latest pointer client coords, read inside the rAF loop so we coalesce
  // multiple pointermove events into one write per frame.
  const pointerRef = useRef({ x: 0, y: 0 })
  const interactingRef = useRef(false)
  // Current (eased) and target holo state. The loop lerps current → target.
  const stateRef = useRef({ ...REST })
  const targetRef = useRef({ ...REST })

  // Write the eased state out as Simey's CSS-variable contract. Mirrors the
  // `dynamicStyles` reactive block in Card.svelte.
  const writeVars = useCallback(() => {
    const el = nodeRef.current
    if (!el) return
    const s = stateRef.current
    const fromCenter = clamp(
      Math.sqrt((s.py - 50) * (s.py - 50) + (s.px - 50) * (s.px - 50)) / 50,
      0,
      1,
    )
    el.style.setProperty('--pointer-x', `${round(s.px)}%`)
    el.style.setProperty('--pointer-y', `${round(s.py)}%`)
    el.style.setProperty('--pointer-from-center', `${round(fromCenter)}`)
    el.style.setProperty('--pointer-from-top', `${round(s.py / 100)}`)
    el.style.setProperty('--pointer-from-left', `${round(s.px / 100)}`)
    el.style.setProperty('--card-opacity', `${round(s.o)}`)
    el.style.setProperty('--rotate-x', `${round(s.rx)}deg`)
    el.style.setProperty('--rotate-y', `${round(s.ry)}deg`)
    el.style.setProperty('--background-x', `${round(s.bx)}%`)
    el.style.setProperty('--background-y', `${round(s.by)}%`)
  }, [])

  // Recompute the target from the latest pointer position against the element's
  // own box (element-relative — center→0°, corner→max). Mirrors Card.svelte
  // `interact`.
  const computeTarget = useCallback(() => {
    const el = nodeRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return

    const absolute = {
      x: pointerRef.current.x - rect.left,
      y: pointerRef.current.y - rect.top,
    }
    const percent = {
      x: clamp(round((100 / rect.width) * absolute.x)),
      y: clamp(round((100 / rect.height) * absolute.y)),
    }
    const center = {
      x: percent.x - 50,
      y: percent.y - 50,
    }

    targetRef.current = {
      bx: adjust(percent.x, 0, 100, 37, 63),
      by: adjust(percent.y, 0, 100, 33, 67),
      rx: round(-(center.x / 3.5)),
      ry: round(center.y / 3.5),
      px: round(percent.x),
      py: round(percent.y),
      o: 1,
    }
  }, [])

  const tick = useCallback(() => {
    const s = stateRef.current
    const t = targetRef.current
    let moving = false
    for (const k of Object.keys(s) as (keyof typeof s)[]) {
      const diff = t[k] - s[k]
      if (Math.abs(diff) > 0.01) {
        s[k] += diff * LERP
        moving = true
      } else {
        s[k] = t[k]
      }
    }
    writeVars()
    if (moving || interactingRef.current) {
      // Self-scheduling rAF loop: `tick` re-queues itself until the eased state
      // settles. The immutability rule flags the self-reference, but this is the
      // intended animation-loop pattern (re-queue the SAME stable callback) —
      // restructuring it would risk the pointer-tracked holo effect.
      // eslint-disable-next-line react-hooks/immutability
      rafRef.current = requestAnimationFrame(tick)
    } else {
      rafRef.current = null
    }
  }, [writeVars])

  const ensureLoop = useCallback(() => {
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(tick)
    }
  }, [tick])

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      pointerRef.current = { x: e.clientX, y: e.clientY }
      computeTarget()
      ensureLoop()
    },
    [computeTarget, ensureLoop],
  )

  const onPointerEnter = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      interactingRef.current = true
      nodeRef.current?.classList.add('is-interacting')
      pointerRef.current = { x: e.clientX, y: e.clientY }
      computeTarget()
      ensureLoop()
    },
    [computeTarget, ensureLoop],
  )

  const onPointerLeave = useCallback(() => {
    interactingRef.current = false
    nodeRef.current?.classList.remove('is-interacting')
    // Ease back to the neutral resting state (flat, glare centered, foil faded).
    targetRef.current = { ...REST }
    ensureLoop()
  }, [ensureLoop])

  // Stable callback ref: React calls it with the node on attach and with null on
  // detach. Storing the node here (inside the hook) is what lets the returned
  // `ref` be assignment-free for consumers, satisfying react-hooks/immutability.
  const setRef = useCallback<RefCallback<HTMLElement>>((el) => {
    nodeRef.current = el
  }, [])

  // Cancel any in-flight frame if the consumer unmounts mid-animation
  // (VirtuosoGrid recycling, lightbox close), so we never call into a detached
  // node.
  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [])

  return { ref: setRef, onPointerEnter, onPointerMove, onPointerLeave }
}
