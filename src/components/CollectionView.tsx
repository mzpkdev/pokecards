import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Dialog,
  NumberInput,
  Portal,
  Select,
  createListCollection,
} from '@ark-ui/react'
import type { LoadState } from './CardGrid'
import FilterableGrid from './FilterableGrid'
import Tabs from './Tabs'
import { loadAllFilterableCards } from '../data'
import type { FilterableCard } from '../data'
import type { PokemonCard } from '../types'
import { buildExportText } from '../collectionExport'
import {
  collectionKeyForTile,
  useCollection,
} from '../useCollection'

// ============================================================================
// CollectionView — the "Your Collection" tab (#/collection).
// ----------------------------------------------------------------------------
// A tabbed view (renders <Tabs/> like GridLayout) showing the cards the user has
// collected. It loads the GLOBAL merged FilterableCard[] (loadAllFilterableCards
// — reusing the per-category fetch + projection caches), narrows it to the cards
// whose representative key is in the collection, and hands that subset to the
// SAME FilterableGrid the tabs/related views use — so the collection is fully
// searchable/filterable with all the existing facets.
//
// Each rendered tile carries a quantity stepper (+/−, min 1) + a remove control,
// laid over the tile via FilterableGrid's renderOverlay slot (additive — the
// tile component itself is untouched). A header band hosts the live count + an
// Export button (copies the deck list to the clipboard). An empty state shows a
// tasteful prompt when nothing is collected.
//
// CARD IDENTITY: the collection keys on the representative printing id, which is
// exactly each FilterableCard's tile.id (collectionKeyForTile). The detail page
// adds the same key via collectionKeyForDetail, so a card added from any printing
// resolves here to its one canonical tile — no duplicates, no name collisions.
// ============================================================================

// Transient export-feedback state (drives the button's label/aria-live message).
type ExportFeedback = 'idle' | 'copied' | 'failed'

// How long the "Copied!" / fallback message stays before reverting to idle.
const FEEDBACK_MS = 2000

// Best-effort clipboard write. Prefers the async Clipboard API; falls back to a
// hidden-textarea + execCommand('copy') for older/insecure contexts where
// navigator.clipboard is unavailable. Returns whether the copy succeeded.
async function copyToClipboard(text: string): Promise<boolean> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to the legacy path (e.g. permission denied / not focused).
    }
  }
  if (typeof document === 'undefined') return false
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    // Keep it out of view + non-disruptive to scroll/focus.
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.top = '-9999px'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

// A single tile's quantity stepper + remove control, laid over the card.
function CollectionControls({ tile }: { tile: PokemonCard }) {
  const { quantityOf, setQuantity, remove } = useCollection()
  const cardKey = collectionKeyForTile(tile)
  const qty = quantityOf(cardKey)

  return (
    <div
      className="collection-controls"
      // Stop clicks on the controls from bubbling to the tile's <Link> beneath
      // (the overlay sits over the card link, which would otherwise navigate).
      onClick={(e) => e.stopPropagation()}
    >
      {/* Ark NumberInput, fully CONTROLLED off the collection store: value mirrors
          quantityOf(cardKey) and every change flows back through setQuantity — which
          persists to localStorage and is reactive app-wide (tab badge/detail stay in
          sync). No local state is forked. min=1 makes Ark auto-disable the decrement
          trigger at qty 1 (remove handles deletion via the separate button below),
          exactly reproducing the old `disabled={qty <= 1}`. */}
      <NumberInput.Root
        className="collection-stepper"
        role="group"
        aria-label={`Quantity of ${tile.name}`}
        value={String(qty)}
        min={1}
        step={1}
        // setQuantity floors a non-finite n to 0 and then REMOVES the entry, so a
        // stray NaN (e.g. an empty parse) must never reach it. The input is readOnly
        // below so keystrokes can't blank it, and this finite-guard is the backstop
        // for any transient/invalid detail the machine might emit.
        onValueChange={(details) => {
          if (Number.isFinite(details.valueAsNumber)) {
            setQuantity(cardKey, details.valueAsNumber)
          }
        }}
      >
        {/* The parts read state from context, not DOM nesting, so they sit as
            direct children of Root (no NumberInput.Control wrapper) — preserving the
            old single `.collection-stepper` flex row of [−][qty][+] exactly. */}
        <NumberInput.DecrementTrigger
          className="collection-step-btn"
          aria-label={`Decrease quantity of ${tile.name}`}
        >
          −
        </NumberInput.DecrementTrigger>
        {/* readOnly to preserve today's display-only number (was a <span>): the
            +/- triggers drive the value, typing is disabled. The litewind resets
            strip the native <input> chrome so it renders as the old static digit. */}
        <NumberInput.Input
          className="collection-qty border-0 bg-transparent p-0 appearance-none outline-none"
          readOnly
          aria-live="polite"
        />
        <NumberInput.IncrementTrigger
          className="collection-step-btn"
          aria-label={`Increase quantity of ${tile.name}`}
        >
          +
        </NumberInput.IncrementTrigger>
      </NumberInput.Root>
      <button
        type="button"
        className="collection-remove-btn"
        aria-label={`Remove ${tile.name} from your collection`}
        onClick={() => remove(cardKey)}
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  )
}

// Which management dialog is open (null = none). Create/rename share a name-entry
// form; delete is a confirm. The id/name are captured when the dialog opens so an
// active-collection switch underneath can't retarget an in-flight rename/delete.
type DialogState =
  | { mode: 'create' }
  | { mode: 'rename'; id: string }
  | { mode: 'delete'; id: string; name: string }
  | null

// The collection switcher + CRUD controls shown in the Collection header band.
// An Ark Select switches the active collection (everything else in the app reads
// the active collection through useCollection); the +/✎/🗑 buttons create, rename,
// and delete via a small Ark Dialog. Delete is disabled while only one collection
// exists (the store would just reseed an empty default — nothing to gain).
function CollectionSwitcher() {
  const { collections } = useCollection()
  const { list, activeId, activeName, create, rename, remove, setActive } =
    collections

  const [dialog, setDialog] = useState<DialogState>(null)
  const [draft, setDraft] = useState('')

  // Ark Select wants a ListCollection. We carry each collection's count on the
  // item so the dropdown can show it without a second lookup. Rebuilt when the
  // list changes (create/rename/delete/quantity edits).
  const selectCollection = useMemo(
    () =>
      createListCollection({
        items: list.map((c) => ({
          label: c.name,
          value: c.id,
          count: c.totalCount,
        })),
      }),
    [list],
  )

  const active = list.find((c) => c.isActive)

  const openCreate = () => {
    setDraft('')
    setDialog({ mode: 'create' })
  }
  const openRename = () => {
    setDraft(activeName)
    setDialog({ mode: 'rename', id: activeId })
  }
  const openDelete = () => {
    if (active) setDialog({ mode: 'delete', id: active.id, name: active.name })
  }
  const close = () => setDialog(null)

  // Create/rename submit. A blank name is rejected by the store too, but we guard
  // here so a whitespace-only draft can't close the dialog as if it did something.
  const submitName = (e: FormEvent) => {
    e.preventDefault()
    const name = draft.trim()
    if (!name) return
    if (dialog?.mode === 'create') create(name)
    else if (dialog?.mode === 'rename') rename(dialog.id, name)
    close()
  }
  const confirmDelete = () => {
    if (dialog?.mode === 'delete') remove(dialog.id)
    close()
  }

  return (
    <div className="collection-switcher">
      {/* Ark Select, controlled off the store: value is the active id, and every
          change flows through setActive (which re-renders the whole app on the new
          active collection). Single-select, so value is a 1-element array. */}
      <Select.Root
        collection={selectCollection}
        value={[activeId]}
        onValueChange={(details) => {
          if (details.value[0]) setActive(details.value[0])
        }}
        positioning={{ sameWidth: true }}
        className="collection-select"
      >
        <Select.Control>
          <Select.Trigger
            className="collection-select-trigger"
            aria-label="Switch active collection"
          >
            <Select.ValueText
              className="collection-select-value"
              placeholder="Collection"
            />
            {active && active.totalCount > 0 && (
              <span className="collection-select-count">{active.totalCount}</span>
            )}
            <Select.Indicator className="collection-select-caret" aria-hidden="true">
              ▾
            </Select.Indicator>
          </Select.Trigger>
        </Select.Control>
        <Portal>
          <Select.Positioner className="collection-select-positioner">
            <Select.Content className="collection-select-content">
              {selectCollection.items.map((item) => (
                <Select.Item
                  key={item.value}
                  item={item}
                  className="collection-select-item"
                >
                  <Select.ItemText>{item.label}</Select.ItemText>
                  <span className="collection-select-item-count">{item.count}</span>
                  <Select.ItemIndicator
                    className="collection-select-check"
                    aria-hidden="true"
                  >
                    ✓
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Positioner>
        </Portal>
      </Select.Root>

      <button
        type="button"
        className="collection-manage-btn"
        aria-label="New collection"
        title="New collection"
        onClick={openCreate}
      >
        <span aria-hidden="true">＋</span>
      </button>
      <button
        type="button"
        className="collection-manage-btn"
        aria-label={`Rename ${activeName}`}
        title="Rename collection"
        onClick={openRename}
      >
        <span aria-hidden="true">✎</span>
      </button>
      <button
        type="button"
        className="collection-manage-btn collection-manage-btn--danger"
        aria-label={`Delete ${activeName}`}
        title="Delete collection"
        onClick={openDelete}
        disabled={list.length <= 1}
      >
        <span aria-hidden="true">🗑</span>
      </button>

      {/* One Ark Dialog drives all three flows. Open is controlled off `dialog`;
          Ark supplies the focus trap, Escape/outside-click close, scroll-lock, and
          the role/aria-modal contract (same convention as CardLightbox). */}
      <Dialog.Root
        open={dialog !== null}
        onOpenChange={(details) => {
          if (!details.open) close()
        }}
      >
        <Portal>
          <Dialog.Backdrop className="collection-dialog-backdrop" />
          <Dialog.Positioner className="collection-dialog-positioner">
            <Dialog.Content className="collection-dialog">
              {dialog?.mode === 'delete' ? (
                <>
                  <Dialog.Title className="collection-dialog-title">
                    Delete collection?
                  </Dialog.Title>
                  <Dialog.Description className="collection-dialog-desc">
                    “{dialog.name}” and everything in it will be removed. This
                    can’t be undone.
                  </Dialog.Description>
                  <div className="collection-dialog-actions">
                    <button
                      type="button"
                      className="collection-dialog-btn"
                      onClick={close}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="collection-dialog-btn collection-dialog-btn--danger"
                      onClick={confirmDelete}
                    >
                      Delete
                    </button>
                  </div>
                </>
              ) : dialog ? (
                <form onSubmit={submitName}>
                  <Dialog.Title className="collection-dialog-title">
                    {dialog.mode === 'create'
                      ? 'New collection'
                      : 'Rename collection'}
                  </Dialog.Title>
                  <input
                    className="collection-dialog-input"
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Collection name"
                    aria-label="Collection name"
                    maxLength={60}
                    autoFocus
                  />
                  <div className="collection-dialog-actions">
                    <button
                      type="button"
                      className="collection-dialog-btn"
                      onClick={close}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="collection-dialog-btn collection-dialog-btn--primary"
                      disabled={!draft.trim()}
                    >
                      {dialog.mode === 'create' ? 'Create' : 'Save'}
                    </button>
                  </div>
                </form>
              ) : null}
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </div>
  )
}

export default function CollectionView() {
  const collection = useCollection()
  const { map, entries, totalCount, distinctCount } = collection
  const activeName = collection.collections.activeName

  // Load the GLOBAL merged set once (module-memoized in data.ts, so this reuses
  // any per-category projections already warmed by the tabs/related views).
  const [allCards, setAllCards] = useState<FilterableCard[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [feedback, setFeedback] = useState<ExportFeedback>('idle')

  const isEmpty = totalCount === 0

  useEffect(() => {
    // Skip the (large) global load entirely while the collection is empty —
    // there's nothing to resolve, and the empty state is shown directly below.
    // The load kicks off as soon as the first card is collected.
    if (isEmpty) return
    let active = true
    loadAllFilterableCards()
      .then((loaded) => {
        if (!active) return
        setAllCards(loaded)
        setState('ready')
      })
      .catch(() => {
        if (!active) return
        setState('error')
      })
    return () => {
      active = false
    }
  }, [isEmpty])

  // Narrow the global set to the collected cards. Memoized on the loaded set +
  // the collection map so it recomputes only when one changes. Keys match the
  // collection map exactly (tile.id == representative key == collection key).
  const collected = useMemo<FilterableCard[]>(
    () => allCards.filter((c) => (map[collectionKeyForTile(c.tile)] ?? 0) > 0),
    [allCards, map],
  )

  // cardKey → display name across the whole global set, for the export text
  // (so removing/keeping by key can still print a readable name). Built from the
  // full set so an export works even before `collected` is computed/visible.
  const nameByKey = useMemo<Map<string, string>>(() => {
    const m = new Map<string, string>()
    for (const c of allCards) m.set(collectionKeyForTile(c.tile), c.tile.name)
    return m
  }, [allCards])

  // Auto-revert the transient export feedback to idle.
  useEffect(() => {
    if (feedback === 'idle') return
    const t = window.setTimeout(() => setFeedback('idle'), FEEDBACK_MS)
    return () => window.clearTimeout(t)
  }, [feedback])

  const handleExport = async () => {
    // Prefix the deck list with the active collection's name so a pasted export
    // is self-labeling (which of the user's collections it came from).
    const text = `${activeName}\n\n${buildExportText(entries, nameByKey)}`
    const ok = await copyToClipboard(text)
    setFeedback(ok ? 'copied' : 'failed')
  }

  // Tasteful empty state: shown when nothing is collected. Mirrors the grid's
  // themed empty-state look (bouncy emoji blob + title + hint).
  const emptyState = (
    <div className="grid-status grid-status--empty" role="status">
      <span className="grid-status-emoji" aria-hidden="true">
        ✦
      </span>
      <span className="grid-status-title">“{activeName}” is empty</span>
      <span className="grid-status-text">
        Open any card and tap “Add to collection” to start filling it.
      </span>
    </div>
  )

  const exportLabel =
    feedback === 'copied'
      ? 'Copied!'
      : feedback === 'failed'
        ? 'Copy failed'
        : 'Export'

  return (
    <>
      <Tabs />
      {/* Header band: title + live count on the left, Export on the right.
          flex-shrink-0 so FilterableGrid's <main> keeps the height VirtuosoGrid
          needs to measure (same chain GridLayout relies on). */}
      <div className="collection-head flex-shrink-0">
        <div className="collection-head-text">
          <h2 className="collection-title">Your Collection</h2>
          {!isEmpty && (
            <p className="collection-subtitle" aria-live="polite">
              {totalCount.toLocaleString()} {totalCount === 1 ? 'card' : 'cards'}
              {distinctCount !== totalCount && (
                <> · {distinctCount.toLocaleString()} unique</>
              )}
            </p>
          )}
        </div>
        {/* Actions ALWAYS render so the switcher is reachable even when the
            active collection is empty (you must be able to switch/create from an
            empty one). Export stays visible too — it just DISABLES when there's
            nothing to export, so the header layout doesn't shift. */}
        <div className="collection-head-actions">
          <CollectionSwitcher />
          <button
            type="button"
            className="collection-export-btn"
            onClick={handleExport}
            data-feedback={feedback}
            disabled={isEmpty}
            title={isEmpty ? 'Nothing to export yet' : undefined}
          >
            <span aria-hidden="true">⧉</span> {exportLabel}
          </button>
          {/* Visually-hidden live region so the copy result is announced even
              though the button label also reflects it. */}
          <span className="sr-only" role="status" aria-live="polite">
            {feedback === 'copied'
              ? 'Collection copied to clipboard'
              : feedback === 'failed'
                ? 'Could not copy to clipboard'
                : ''}
          </span>
        </div>
      </div>

      {isEmpty ? (
        // Nothing collected — show the tasteful empty state directly (we skipped
        // the global load above, so there's no FilterableGrid loading spinner to
        // sit through). Wrapped in the same min-h-0/flex-1 main the grid uses so
        // the empty blob centers in the leftover height.
        <main className="min-h-0 flex-1">{emptyState}</main>
      ) : (
        // The collected subset feeds the SAME filter bar + grid the tabs use, so
        // search/facets work within the collection. Each tile gets the quantity
        // stepper + remove overlay. `emptyState` covers the (rare) case where the
        // collection holds only keys no longer present in the dataset.
        <FilterableGrid
          cards={collected}
          state={state}
          categoryHint="pokemon"
          renderOverlay={(tile) => <CollectionControls tile={tile} />}
          emptyState={emptyState}
        />
      )}
    </>
  )
}
