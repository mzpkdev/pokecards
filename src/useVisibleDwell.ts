import { useCallback, useEffect, useRef } from 'react'
import type { RefCallback } from 'react'

// ============================================================================
// useVisibleDwell — fire `onDwell` once the attached element has been
// CONTINUOUSLY visible in the viewport for `ms`.
// ----------------------------------------------------------------------------
// Used to upgrade a grid tile to full-res when the user settles on it WITHOUT
// hovering — covering touch / passive browsing, where the hover/focus upgrade
// never fires. An IntersectionObserver starts a timer when the tile crosses into
// view (≥25% visible); scrolling it back out before `ms` clears the timer, so
// only tiles you actually linger on upgrade — flicking past doesn't.
//
// `onDwell` is read through a ref, so a changing callback identity never tears
// down/recreates the observer. Returns a callback ref to attach to the observed
// element — compose it with any other ref the element already needs (the grid
// tile also carries the holo ref). Degrades to a no-op where IntersectionObserver
// is unavailable (SSR / very old engines); hover/focus still upgrades there.
// ============================================================================
export function useVisibleDwell(
  onDwell: () => void,
  ms: number,
): RefCallback<HTMLElement> {
  // Latest callback in a ref — synced in an effect (never written during
  // render) so a changing callback identity doesn't re-arm the observer.
  const onDwellRef = useRef(onDwell)
  useEffect(() => {
    onDwellRef.current = onDwell
  }, [onDwell])

  const timerRef = useRef<number | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const teardown = useCallback(() => {
    observerRef.current?.disconnect()
    observerRef.current = null
    clearTimer()
  }, [clearTimer])

  const ref = useCallback<RefCallback<HTMLElement>>(
    (el) => {
      // Detach from any previous node first (ref re-attach / unmount with null).
      teardown()
      if (!el || typeof IntersectionObserver === 'undefined') return
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1]
          if (entry?.isIntersecting) {
            // Visible — start the dwell timer once; staying put `ms` fires it.
            if (timerRef.current == null) {
              timerRef.current = window.setTimeout(() => {
                timerRef.current = null
                onDwellRef.current()
              }, ms)
            }
          } else {
            // Left view before dwelling long enough — reset the countdown.
            clearTimer()
          }
        },
        { threshold: 0.25 },
      )
      observer.observe(el)
      observerRef.current = observer
    },
    [ms, teardown, clearTimer],
  )

  // Final teardown on unmount (the ref(null) detach covers re-attach).
  useEffect(() => teardown, [teardown])

  return ref
}
