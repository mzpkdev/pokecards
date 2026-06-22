import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Portal,
  Select,
  createListCollection,
  useSelectItemContext,
} from '@ark-ui/react'
import type { FacetOptions, CardFilters } from '../useCardFilters'
import { PARAM } from '../useCardFilters'
import { formatRoleLabel } from '../roleLabel'

// ============================================================================
// SearchFilterBar — the search box + facet controls above a category grid.
// ----------------------------------------------------------------------------
// Presentational + URL-driven: it reads the current filters/options and emits
// changes by mutating a fresh URLSearchParams (built from the live params) and
// handing it to onChange (GridLayout wires that to react-router setSearchParams,
// replace:true so typing/toggling doesn't spam the history stack). All real
// state lives in the URL — this component holds only the debounced text buffer.
//
// Category-awareness is automatic: each facet renders only when its option list
// is non-empty. So Types vanish on poketools, Role vanishes on specials, etc.,
// with no hardcoded per-category logic here.
//
// The seven facets are Ark UI <Select multiple> widgets (headless listbox +
// ARIA + keyboard/typeahead from Zag); we keep the existing .filter-* classes
// on each Ark part so the look is unchanged, and drive every Select CONTROLLED
// off the URL-derived `filters.*` (no forked local selection state).
// ============================================================================

// Debounce for the text query (ms). Long enough that fast typing doesn't thrash
// the virtualized grid's filter pass, short enough to feel responsive.
const QUERY_DEBOUNCE_MS = 180

type SearchFilterBarProps = {
  options: FacetOptions
  filters: CardFilters
  // Total tiles in the category (for the "N of M" count).
  total: number
  // Tiles currently shown after filtering.
  shown: number
  activeCount: number
  // Emit a new param set (already built); GridLayout pushes it to the URL.
  onChange: (next: URLSearchParams) => void
  // The live params, so we always mutate from the current URL state.
  params: URLSearchParams
}

// The native checkbox that renders inside each Select.Item, ticked to match the
// item's selection state (read from Ark's item context). This preserves the
// original `.filter-option input[type='checkbox']` visuals byte-for-byte while
// Ark owns the actual selection logic (so the checkbox is purely a presentation
// of `itemState.selected` — clicks are handled by the Select.Item, not here).
function ItemCheckbox() {
  const itemState = useSelectItemContext()
  return (
    <input
      type="checkbox"
      checked={itemState.selected}
      // The Select.Item owns toggling; this input only reflects state. readOnly
      // keeps React happy about the controlled `checked` with no onChange and
      // makes it inert to direct interaction (the row label drives selection).
      readOnly
      tabIndex={-1}
      aria-hidden="true"
    />
  )
}

// One multiselect facet, backed by an Ark <Select multiple>. OR-within-facet is
// expressed by allowing multiple selections. Renders nothing when there are no
// options (category-awareness — e.g. types on poketools).
//
// CONTROLLED off the URL: `selected` is the facet's value array parsed from the
// URL and `onValuesChange` writes the new array straight back through the shared
// URLSearchParams plumbing — no local selection state.
function MultiSelect({
  label,
  options,
  selected,
  onValuesChange,
  onClear,
  formatLabel,
}: {
  label: string
  options: string[]
  selected: string[]
  // Receives the full next selection (canonical option casing); the caller
  // comma-joins it into the facet's URL param.
  onValuesChange: (values: string[]) => void
  onClear: () => void
  // Optional DISPLAY-ONLY transform for each option's visible text. The raw
  // `opt` is still the value stored in the URL param, so filtering matches the
  // data; only the rendered label changes (e.g. roles shown Capitalized while
  // ?role= stays the raw lowercase value).
  formatLabel?: (value: string) => string
}) {
  // Ark's collection: value = the raw option (what we store in the URL), label =
  // the display text (Role capitalization etc.). Memoized on the option list so
  // the collection identity is stable across re-renders.
  const collection = useMemo(
    () =>
      createListCollection({
        items: options,
        itemToValue: (opt) => opt,
        itemToString: (opt) => (formatLabel ? formatLabel(opt) : opt),
      }),
    [options, formatLabel],
  )

  // Case-insensitive: a URL value of "fire" must tick the "Fire" option. Map
  // each selected URL value onto the canonical option casing so Ark (which
  // compares values exactly) marks the right items selected. Values without a
  // matching option are dropped (same as the old membership test ignoring them).
  const controlledValue = useMemo(() => {
    if (selected.length === 0) return []
    const byLower = new Map(options.map((opt) => [opt.toLowerCase(), opt]))
    return selected
      .map((v) => byLower.get(v.toLowerCase()))
      .filter((v): v is string => v != null)
  }, [selected, options])

  if (options.length === 0) return null

  const count = controlledValue.length

  return (
    <Select.Root
      // Controlled, multi-select, URL-owned. closeOnSelect:false keeps the
      // popover open while ticking several values (matches the old checkbox
      // list, where each click toggled in place without closing).
      collection={collection}
      multiple
      closeOnSelect={false}
      value={controlledValue}
      onValueChange={(details) => onValuesChange(details.value)}
      // Let Ark/Zag (Floating-UI) own positioning: drop the menu 8px below the
      // trigger, left-aligned (bottom-start) in the normal case, but with flip/
      // shift collision handling ON (Zag defaults) so a right-edge or bottom-edge
      // facet auto-shifts/flips to stay fully inside the viewport — no horizontal
      // scrollbar. The 8px gap lives HERE (gutter) instead of in CSS, so there's
      // no double-offset with the Positioner's transform.
      positioning={{ placement: 'bottom-start', gutter: 8 }}
      className="filter-facet"
    >
      <Select.Control>
        <Select.Trigger
          className={['filter-trigger', count > 0 ? 'is-active' : ''].join(' ')}
        >
          <span className="filter-trigger-label">{label}</span>
          {count > 0 && <span className="filter-trigger-count">{count}</span>}
          <span className="filter-trigger-caret" aria-hidden="true">
            ▾
          </span>
        </Select.Trigger>
      </Select.Control>
      {/* PORTAL the popover to <body> so it escapes any ancestor's clip/scroll
          context (a page-level `overflow-x:hidden` computes to overflow-y:auto per
          spec, which both crops the popover AND is what Floating-UI treats as its
          clipping boundary). Out of that chain, the boundary becomes the viewport,
          so flip/shift keep the menu fully on-screen with no horizontal scrollbar.
          Ark/Zag (Floating-UI via @zag-js/popper) still anchors the Positioner to
          the trigger and writes the inline position + transform (8px below,
          left-aligned via `positioning` above).
          Z-INDEX: the Positioner's inline style is `z-index: var(--z-index)`, and
          @zag-js/popper sets that --z-index from getComputedStyle(Content).zIndex
          — so the popover's stacking level is declared as `z-index:20` on
          .filter-menu (the Content) in index.css, NOT on the portalled positioner
          (the old `--z-index` on .filter-facet no longer reaches it under <body>).
          .filter-menu is otherwise visual-only (surface, border, width, scroll). */}
      <Portal>
        <Select.Positioner className="filter-positioner">
          <Select.Content className="filter-menu" aria-label={label}>
            <div className="filter-menu-head">
              <span className="filter-menu-title">{label}</span>
              {count > 0 && (
                <Select.ClearTrigger
                  className="filter-menu-clear"
                  onClick={onClear}
                >
                  Clear
                </Select.ClearTrigger>
              )}
            </div>
            <ul className="filter-options">
              {options.map((opt) => (
                <li key={opt}>
                  {/* Select.Item carries role="option"/aria-selected + click-to-
                      toggle; we keep the .filter-option look and the native
                      checkbox (presentational, reflecting item state). */}
                  <Select.Item item={opt} className="filter-option">
                    <ItemCheckbox />
                    <Select.ItemText className="filter-option-text">
                      {formatLabel ? formatLabel(opt) : opt}
                    </Select.ItemText>
                  </Select.Item>
                </li>
              ))}
            </ul>
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  )
}

export default function SearchFilterBar({
  options,
  filters,
  total,
  shown,
  activeCount,
  onChange,
  params,
}: SearchFilterBarProps) {
  // Build a mutable copy of the current URL params, apply a mutation, and emit.
  // Always start from the live `params` so concurrent facet/text edits compose.
  const update = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const next = new URLSearchParams(params)
      mutate(next)
      onChange(next)
    },
    [params, onChange],
  )

  // Set or delete a comma-joined multi-value facet param.
  const setList = useCallback(
    (key: string, values: string[]) => {
      update((p) => {
        if (values.length === 0) p.delete(key)
        else p.set(key, values.join(','))
      })
    },
    [update],
  )

  // --- Debounced text query --------------------------------------------------
  // The input is locally controlled by `text` for instant feedback; the URL `q`
  // is written on a debounce so the (potentially large) filter pass + Virtuoso
  // re-render don't run on every keystroke. We re-sync the buffer if the URL `q`
  // changes from outside (back/forward, clear-all, share-link restore).
  const [text, setText] = useState(filters.q)
  const lastCommitted = useRef(filters.q)
  const debounceRef = useRef<number | null>(null)
  useEffect(() => {
    if (filters.q !== lastCommitted.current) {
      lastCommitted.current = filters.q
      setText(filters.q)
    }
  }, [filters.q])

  const onTextChange = useCallback(
    (value: string) => {
      setText(value)
      // Debounce the URL write. Capture the value; on fire, commit it.
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current)
      debounceRef.current = window.setTimeout(() => {
        const trimmed = value.trim()
        lastCommitted.current = trimmed
        update((p) => {
          if (trimmed) p.set(PARAM.q, trimmed)
          else p.delete(PARAM.q)
        })
      }, QUERY_DEBOUNCE_MS)
    },
    [update],
  )
  useEffect(() => {
    return () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current)
    }
  }, [])

  // Clear-all: drop every filter param, keeping any unrelated params intact.
  const clearAll = useCallback(() => {
    update((p) => {
      for (const key of Object.values(PARAM)) p.delete(key)
    })
    // Reset the local text buffer immediately (the effect would do it after the
    // URL settles, but this avoids a one-frame stale value in the input).
    lastCommitted.current = ''
    setText('')
  }, [update])

  // --- Mobile facet collapse -------------------------------------------------
  // On phones the facet pills wrap into several rows and eat the vertical space
  // above the grid, so we collapse them behind a "Filters" toggle. Desktop ALWAYS
  // shows the pills inline (the toggle is display:none and .filter-facets is
  // display:contents there — see index.css), so this is purely a mobile affordance.
  // Local UI state only; every filter VALUE still lives in the URL.
  const [facetsOpen, setFacetsOpen] = useState(false)

  // Whether ANY facet has options to show — guards against rendering a pointless
  // toggle for a category with zero facets (doesn't happen today, but cheap).
  const hasFacets =
    options.types.length > 0 ||
    options.subtypes.length > 0 ||
    options.cardClasses.length > 0 ||
    options.generations.length > 0 ||
    options.sets.length > 0 ||
    options.series.length > 0 ||
    options.roles.length > 0

  // Active facets, EXCLUDING the text query (search stays visible while the
  // facets collapse, so the toggle badge should reflect only the hidden facets).
  const activeFacetCount =
    (filters.types.length ? 1 : 0) +
    (filters.subtypes.length ? 1 : 0) +
    (filters.cardClasses.length ? 1 : 0) +
    (filters.generations.length ? 1 : 0) +
    (filters.sets.length ? 1 : 0) +
    (filters.series.length ? 1 : 0) +
    (filters.roles.length ? 1 : 0)

  return (
    <div className="filter-bar">
      <div className="filter-bar-row">
        {/* Search box */}
        <div className="filter-search">
          <span className="filter-search-icon" aria-hidden="true">
            ⌕
          </span>
          <input
            type="search"
            className="filter-search-input"
            placeholder="Search name, attacks, abilities, rules…"
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            aria-label="Search cards"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        {/* Mobile-only "Filters" toggle: collapses the facet pills (which wrap
            into several rows on a phone) behind one tap. Hidden on desktop via
            CSS, where the facets always show inline. Reuses the .filter-trigger
            pill styling; goes sky-blue (is-active) with a count when ≥1 facet is
            selected, so applied filters stay visible even while collapsed. */}
        {hasFacets && (
          <button
            type="button"
            className={[
              'filter-trigger',
              'filter-toggle',
              activeFacetCount > 0 ? 'is-active' : '',
            ].join(' ')}
            aria-expanded={facetsOpen}
            aria-controls="filter-facets"
            onClick={() => setFacetsOpen((o) => !o)}
          >
            <span className="filter-trigger-label">Filters</span>
            {activeFacetCount > 0 && (
              <span className="filter-trigger-count">{activeFacetCount}</span>
            )}
            <span className="filter-trigger-caret" aria-hidden="true">
              {facetsOpen ? '▴' : '▾'}
            </span>
          </button>
        )}

        {/* Facet multiselects — each hides itself when it has no options. On
            desktop this wrapper is display:contents (the pills flow inline in
            .filter-bar-row exactly as before); on mobile it becomes a full-width
            row that the Filters toggle shows/hides via .is-open. */}
        <div
          id="filter-facets"
          className={['filter-facets', facetsOpen ? 'is-open' : ''].join(' ')}
        >
          <MultiSelect
            label="Type"
            options={options.types}
            selected={filters.types}
            onValuesChange={(v) => setList(PARAM.type, v)}
            onClear={() => setList(PARAM.type, [])}
          />
          <MultiSelect
            label="Subtype"
            options={options.subtypes}
            selected={filters.subtypes}
            onValuesChange={(v) => setList(PARAM.subtype, v)}
            onClear={() => setList(PARAM.subtype, [])}
          />
          {/* Card Class — Specials tab only. options.cardClasses is empty for
              non-special categories, so MultiSelect renders nothing there. */}
          <MultiSelect
            label="Card Class"
            options={options.cardClasses}
            selected={filters.cardClasses}
            onValuesChange={(v) => setList(PARAM.cardClass, v)}
            onClear={() => setList(PARAM.cardClass, [])}
          />
          {/* Generation — species tabs only (Pokémon + Specials). options.generations
              is empty on Poketools, so MultiSelect renders nothing there. */}
          <MultiSelect
            label="Generation"
            options={options.generations}
            selected={filters.generations}
            onValuesChange={(v) => setList(PARAM.gen, v)}
            onClear={() => setList(PARAM.gen, [])}
          />
          <MultiSelect
            label="Set"
            options={options.sets}
            selected={filters.sets}
            onValuesChange={(v) => setList(PARAM.set, v)}
            onClear={() => setList(PARAM.set, [])}
          />
          <MultiSelect
            label="Series"
            options={options.series}
            selected={filters.series}
            onValuesChange={(v) => setList(PARAM.series, v)}
            onClear={() => setList(PARAM.series, [])}
          />
          <MultiSelect
            label="Role"
            options={options.roles}
            selected={filters.roles}
            onValuesChange={(v) => setList(PARAM.role, v)}
            onClear={() => setList(PARAM.role, [])}
            // Roles are stored lowercase in the data; show them Capitalized while
            // the toggled value / ?role= param stays the raw value (so filtering
            // and the #/role/:role drill-down still match the data).
            formatLabel={formatRoleLabel}
          />
        </div>
      </div>

      {/* Status row: result count + active-filter count + clear-all. */}
      <div className="filter-bar-meta">
        <span className="filter-count" aria-live="polite">
          <strong>{shown.toLocaleString()}</strong> of {total.toLocaleString()}
        </span>
        {activeCount > 0 && (
          <>
            <span className="filter-active-badge">
              {activeCount} {activeCount === 1 ? 'filter' : 'filters'}
            </span>
            <button type="button" className="filter-clear-all" onClick={clearAll}>
              Clear all
            </button>
          </>
        )}
      </div>
    </div>
  )
}
