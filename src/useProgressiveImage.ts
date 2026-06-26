import { useCallback, useEffect, useRef, useState } from 'react'

// ============================================================================
// useProgressiveImage — low-res first, upgrade to high-res on demand.
// ----------------------------------------------------------------------------
// The grid tile renders a small CDN variant (cheap) as its BASE image. When the
// user shows intent in a card — hover / keyboard focus, where the caller invokes
// `upgrade()` — we PRELOAD the full-res scan off-screen via `new Image()` and,
// once it has decoded, flip `showHires`. The caller then mounts the hi-res as a
// SECOND <img> STACKED OVER the low-res base (never mutating the base's own src).
//
// Why a stacked layer instead of swapping the base <img>'s src: changing a
// visible <img>'s src drops its painted frame for a beat (a blank "blink") even
// from cache. Keeping the low-res base mounted and fading the hi-res in on top
// means the worst case is "you briefly still see low-res" — never blank.
//
// Recycling correctness WITHOUT resetting state in an effect: both the "ready"
// and "already started" trackers are keyed by the hires URL VALUE. When
// VirtuosoGrid recycles a tile for a different card, the new hiresSrc no longer
// matches the loaded `readySrc`, so `showHires` reads false on its own; and
// `startedForRef` no longer matches, so the recycled tile is free to upgrade
// again. A late-arriving preload from the PREVIOUS card can't reveal itself on
// the recycled tile either — its URL won't match the current hiresSrc.
// ============================================================================
export function useProgressiveImage(
  lowSrc: string,
  hiresSrc?: string,
): { showHires: boolean; upgrade: () => void } {
  // The hires URL that has finished preloading (null until then), compared by
  // value against the current hiresSrc to decide whether to reveal it.
  const [readySrc, setReadySrc] = useState<string | null>(null)
  // The hires URL we've already kicked a preload off for — keyed by value so a
  // recycled tile (different URL) gets a fresh upgrade, while repeated hovers on
  // the same card don't spawn a second Image().
  const startedForRef = useRef<string | undefined>(undefined)
  // The in-flight preloader, detached on unmount so its onload can't setState
  // after teardown.
  const imgRef = useRef<HTMLImageElement | null>(null)

  const upgrade = useCallback(() => {
    // No-op if there's no hires URL, it equals the low-res one (thumbnailUrl was
    // a no-op), or we've already started loading exactly this URL.
    if (!hiresSrc || hiresSrc === lowSrc || startedForRef.current === hiresSrc) {
      return
    }
    startedForRef.current = hiresSrc
    const img = new Image()
    imgRef.current = img
    // Capture the URL this preload is for, so onload marks the right one ready.
    const target = hiresSrc
    img.onload = () => setReadySrc(target)
    // On error we intentionally do nothing — the tile stays on the low-res base.
    img.src = hiresSrc
  }, [lowSrc, hiresSrc])

  useEffect(() => {
    return () => {
      if (imgRef.current) {
        imgRef.current.onload = null
        imgRef.current = null
      }
    }
  }, [])

  return {
    // True once the preload for the CURRENT hiresSrc has decoded; the caller
    // stacks the hi-res <img> over the low-res base only while this holds.
    showHires: hiresSrc != null && readySrc === hiresSrc,
    upgrade,
  }
}
