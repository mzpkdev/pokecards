// ============================================================================
// FEATURE FLAGS — hardcoded defaults, runtime-overridable via `window`.
// ----------------------------------------------------------------------------
// Each flag ships with a hardcoded default baked into the bundle, but can be
// flipped AT RUNTIME (no rebuild) by setting the matching `window.<FLAG>`
// boolean in the browser console. The effective value is read PER-EVALUATION
// (every call to the helper below), so flipping `window.<FLAG>` and then
// triggering a re-render or navigation applies it immediately — there is no
// module-level caching of the runtime value.
//
// The override is intentionally narrow: only an actual `boolean` on `window`
// overrides the default. Anything else (undefined, a string, etc.) is ignored
// and the hardcoded default wins, so a stray/garbage global can't silently
// toggle behavior.
// ============================================================================

declare global {
  interface Window {
    // Runtime override for the Sword & Shield content flag. Set to a boolean in
    // the console (e.g. `window.IS_SWORD_N_SHIELD_ENABLED = true`) to override
    // the hardcoded default; anything non-boolean is ignored.
    IS_SWORD_N_SHIELD_ENABLED?: boolean
  }
}

// Hardcoded default: Sword & Shield content ships HIDDEN. Override at runtime via
// `window.IS_SWORD_N_SHIELD_ENABLED` (read per-evaluation by the helper below).
export const IS_SWORD_N_SHIELD_ENABLED = false

// The display label for the Sword & Shield series, derived in data.ts's
// seriesOf() from the `swsh` setcode family. Kept here as the single string the
// UI layer compares against when deciding what to hide while the flag is off.
export const SWORD_SHIELD_SERIES = 'Sword & Shield'

/**
 * The EFFECTIVE Sword & Shield flag, read fresh on every call.
 *
 * Resolution: if `window.IS_SWORD_N_SHIELD_ENABLED` is an actual boolean, that
 * wins (runtime override); otherwise the hardcoded {@link IS_SWORD_N_SHIELD_ENABLED}
 * default (false) is used. Reading per-call (rather than caching) is what lets a
 * console flip + a re-render/navigation apply with no rebuild. The `typeof
 * window` guard keeps it safe under SSR / non-browser evaluation.
 */
export function isSwordShieldEnabled(): boolean {
  if (typeof window !== 'undefined' && typeof window.IS_SWORD_N_SHIELD_ENABLED === 'boolean') {
    return window.IS_SWORD_N_SHIELD_ENABLED
  }
  return IS_SWORD_N_SHIELD_ENABLED
}

/**
 * True when the given series label is the Sword & Shield series AND the feature
 * flag is currently OFF — i.e. this series should be hidden right now. Centralizes
 * the "is this the hidden S&S series" check so the UI layer reads one predicate.
 */
export function isHiddenSeries(series: string): boolean {
  return !isSwordShieldEnabled() && series === SWORD_SHIELD_SERIES
}
