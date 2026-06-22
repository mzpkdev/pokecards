import { useCallback, useEffect, useRef, useState } from 'react'
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

// Small hook: close a dropdown when a pointerdown lands outside its root, or on
// Escape. Used per multiselect so only one popover stays open at a time without
// any global menu manager.
function useDismiss(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])
  return ref
}

// One multiselect facet: a button that opens a checkbox list. OR-within-facet
// is expressed by simply allowing multiple checks. Renders nothing when there
// are no options (category-awareness — e.g. types on poketools).
function MultiSelect({
  label,
  paramKey,
  options,
  selected,
  onToggle,
  onClear,
  formatLabel,
}: {
  label: string
  paramKey: string
  options: string[]
  selected: string[]
  onToggle: (value: string) => void
  onClear: () => void
  // Optional DISPLAY-ONLY transform for each option's visible text. The raw
  // `opt` is still the value passed to onToggle / stored in the URL param, so
  // filtering matches the data; only the rendered label changes (e.g. roles
  // shown Capitalized while ?role= stays the raw lowercase value).
  formatLabel?: (value: string) => string
}) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useDismiss(open, close)

  if (options.length === 0) return null

  // Case-insensitive membership so a URL value of "fire" still ticks "Fire".
  const selectedLower = selected.map((v) => v.toLowerCase())
  const count = selected.length

  return (
    <div className="filter-facet" ref={ref}>
      <button
        type="button"
        className={['filter-trigger', count > 0 ? 'is-active' : ''].join(' ')}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="filter-trigger-label">{label}</span>
        {count > 0 && <span className="filter-trigger-count">{count}</span>}
        <span className="filter-trigger-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="filter-menu" role="group" aria-label={label}>
          <div className="filter-menu-head">
            <span className="filter-menu-title">{label}</span>
            {count > 0 && (
              <button
                type="button"
                className="filter-menu-clear"
                onClick={onClear}
              >
                Clear
              </button>
            )}
          </div>
          <ul className="filter-options">
            {options.map((opt) => {
              const checked = selectedLower.includes(opt.toLowerCase())
              return (
                <li key={opt}>
                  <label className="filter-option">
                    <input
                      type="checkbox"
                      name={paramKey}
                      checked={checked}
                      onChange={() => onToggle(opt)}
                    />
                    <span className="filter-option-text">
                      {formatLabel ? formatLabel(opt) : opt}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
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

  // Toggle one value in a facet (OR-within-facet). Case-insensitive removal so a
  // ticked value is always removable regardless of URL casing.
  const toggle = useCallback(
    (key: string, current: string[], value: string) => {
      const has = current.some((v) => v.toLowerCase() === value.toLowerCase())
      const nextValues = has
        ? current.filter((v) => v.toLowerCase() !== value.toLowerCase())
        : [...current, value]
      setList(key, nextValues)
    },
    [setList],
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
            paramKey={PARAM.type}
            options={options.types}
            selected={filters.types}
            onToggle={(v) => toggle(PARAM.type, filters.types, v)}
            onClear={() => setList(PARAM.type, [])}
          />
          <MultiSelect
            label="Subtype"
            paramKey={PARAM.subtype}
            options={options.subtypes}
            selected={filters.subtypes}
            onToggle={(v) => toggle(PARAM.subtype, filters.subtypes, v)}
            onClear={() => setList(PARAM.subtype, [])}
          />
          {/* Card Class — Specials tab only. options.cardClasses is empty for
              non-special categories, so MultiSelect renders nothing there. */}
          <MultiSelect
            label="Card Class"
            paramKey={PARAM.cardClass}
            options={options.cardClasses}
            selected={filters.cardClasses}
            onToggle={(v) => toggle(PARAM.cardClass, filters.cardClasses, v)}
            onClear={() => setList(PARAM.cardClass, [])}
          />
          {/* Generation — species tabs only (Pokémon + Specials). options.generations
              is empty on Poketools, so MultiSelect renders nothing there. */}
          <MultiSelect
            label="Generation"
            paramKey={PARAM.gen}
            options={options.generations}
            selected={filters.generations}
            onToggle={(v) => toggle(PARAM.gen, filters.generations, v)}
            onClear={() => setList(PARAM.gen, [])}
          />
          <MultiSelect
            label="Set"
            paramKey={PARAM.set}
            options={options.sets}
            selected={filters.sets}
            onToggle={(v) => toggle(PARAM.set, filters.sets, v)}
            onClear={() => setList(PARAM.set, [])}
          />
          <MultiSelect
            label="Series"
            paramKey={PARAM.series}
            options={options.series}
            selected={filters.series}
            onToggle={(v) => toggle(PARAM.series, filters.series, v)}
            onClear={() => setList(PARAM.series, [])}
          />
          <MultiSelect
            label="Role"
            paramKey={PARAM.role}
            options={options.roles}
            selected={filters.roles}
            onToggle={(v) => toggle(PARAM.role, filters.roles, v)}
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
