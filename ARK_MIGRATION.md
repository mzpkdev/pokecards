# Ark UI migration

We are migrating the app's ad-hoc interactive widgets to **[Ark UI](https://ark-ui.com) (`@ark-ui/react`)** — headless, accessible primitives backed by Zag.js state machines. Ark brings the *behavior* (focus management, keyboard, ARIA, dismiss logic, scroll-lock); **we bring the styling**, by putting our existing class names on each Ark part.

- **Installed:** `@ark-ui/react@5.37.2` (peer deps `react >=18`, `react-dom >=18` — fine for React 19.2.6). Added ~58 KB gzip to the JS bundle (the Zag machines); that's the cost of accessible-by-default widgets and is acceptable.
- **Reference conversion done:** `src/components/CardLightbox.tsx` → Ark **Dialog**. Build (`tsc -b && vite build`) and lint (`eslint .`) both pass; behavior verified in a real browser engine (Escape / outside-click close, scroll-lock, card-click is inert, accessible name resolves).
- **Not yet converted (next fixers):** `Tabs.tsx`, `SearchFilterBar.tsx`, `CollectionView.tsx`. Inventory at the bottom.

> **Hard constraints for every conversion in this effort:** no Panda CSS, no Park UI, no Tailwind build step, no new styling system. Styling is the prebuilt **litewind** CDN Tailwind (only utilities baked into that static build — *no arbitrary values* like `bg-[#abc]`) plus the hand-written `src/index.css` (CSS-variable-driven holo/glow/focus visuals). Like-for-like swaps to accessible primitives, **not** redesigns. Keep HashRouter deep-linking intact.

---

## The styling convention

**One sentence:** swap the hand-rolled widget for the Ark primitive, render the primitive's anatomy parts, and put the *exact existing class names* (litewind utilities and/or `index.css` class names) on each part so it looks byte-identical — Ark contributes only behavior + ARIA, never visuals.

### 1. Import style

Namespace import per primitive (gives you `Dialog.Root`, `Dialog.Content`, …), plus `Portal` from the same package:

```tsx
import { Dialog, Portal } from '@ark-ui/react'
```

Ark also ships granular named exports (`DialogRoot`, `DialogContent`, …) — **prefer the namespace** for readability and to match this doc. The package has a single entry point (`.`); there are no per-component subpath imports.

### 2. Style the parts, reuse class names

Each Ark part is a polymorphic element accepting `className` (and `style`, refs, data-attrs). Put our class on the part whose **box/visual** matches the part the class was written for. Example mapping pattern:

```tsx
<Dialog.Positioner className="lightbox-backdrop">   {/* our centering+dim stage */}
  <Dialog.Content className="lightbox-content">     {/* our (boxless) surface */}
    <Dialog.Title className="sr-only">…</Dialog.Title>
    {/* existing inner markup, unchanged */}
  </Dialog.Content>
</Dialog.Positioner>
```

- **Don't** wrap Ark parts in extra `<div>`s to attach classes — put the class on the part itself.
- When a part shouldn't introduce a box (because the existing CSS assumes a particular DOM shape), give it a `display: contents` class in `index.css` (see `.lightbox-content`). That keeps the part in the DOM/a11y tree (so Ark's refs, `tabIndex`, ARIA still apply) while making it layout-transparent.
- Ark exposes `data-state`, `data-part`, `data-scope` attributes on parts. We don't need them for these conversions (our `.is-active`/`.is-open` conventions stay), but they're available for state-driven styling if ever needed — **without** arbitrary-value Tailwind, target them with plain selectors in `index.css` (e.g. `.foo[data-state="open"] { … }`).

### 3. `asChild` (render a custom element instead of Ark's default)

Every Ark part accepts `asChild` to merge its props/behavior onto **your** element instead of rendering Ark's default `<div>`/`<button>`. This is the key tool when an existing element has the right semantics/classes already:

```tsx
<Tabs.Trigger asChild value="/pokemon">
  <NavLink to="/pokemon" className={…}>Pokémon</NavLink>
</Tabs.Trigger>
```

Use `asChild` to preserve existing semantic elements (router `NavLink`s, the `<input type="search">`, custom `<button>`s) and their class strings, while Ark wires the ARIA/keyboard onto them.

### 4. Controlled vs. self-owned state

Ark widgets own their own state by default (uncontrolled: `defaultValue`/`defaultOpen`). **Our widgets must not fork app state** — filter state lives in the URL (`useSearchParams`), collection state in `localStorage` (`useCollection`), tab selection in the router. So drive Ark **controlled**:

- Pass the current value as the controlled prop (`open`, `value`, `value` for number, …).
- Handle the change callback (`onOpenChange`, `onValueChange`, `onValueChange` details) by writing to the **existing** store (setSearchParams / collection mutation / router navigate), **not** to local `useState`.

This is the single most important rule for the three remaining conversions.

### 5. Portals & z-index

`<Portal>` (no `container` prop) renders to `document.body` — exactly what `CardLightbox` needed to escape `RouteFade`'s stacking context. Our existing high `z-index` on `.lightbox-backdrop` (1000) still wins; the portal is what *frees* it from the clipping ancestor. For dropdown/popover-style widgets (Combobox/Select) you can portal too, but those currently render inline inside the filter bar with `z-index: 20` — keep them inline unless a stacking bug forces a portal, to preserve the current visual flow.

---

## Worked example: `CardLightbox` (before → after)

A fullscreen holographic card viewer opened from the detail page's hero button. It's a **modal overlay, not a route**: the parent (`CardDetailPage`) owns the open boolean and the trigger, and conditionally **mounts** `<CardLightbox>` only while open, passing `src`, `name`, `onClose`. (The hero button lives in `CardDetailPage` at ~L167; open state `lightboxOpen` + `heroButtonRef` at ~L228; conditional mount at ~L744. **We did not touch that file** — the prop contract is unchanged.)

### Before (hand-rolled)

A `createPortal(…, document.body)` of a single `<div className="lightbox-backdrop" role="dialog" aria-modal aria-labelledby tabIndex={-1}>` that hand-implemented **everything**:

- `useEffect` document `keydown` listener for Escape → `onClose()`
- `useEffect` body `overflow:hidden` scroll-lock with save/restore
- `useEffect` capturing `document.activeElement` on mount + restoring focus on unmount
- a `handleTrapKeyDown` that pinned Tab/Shift+Tab onto the backdrop (the sole focus stop)
- an `onClick` with `e.target === e.currentTarget` to close on backdrop click
- a `<figure>` child with `onClick={e => e.stopPropagation()}` so card clicks didn't close
- a `useId` + visually-hidden `<span className="sr-only">` for the accessible name

### After (Ark Dialog)

```
Dialog.Root        open (controlled true while mounted) + onOpenChange → onClose
  Portal           → document.body  (replaces createPortal)
    Dialog.Positioner  className="lightbox-backdrop"   (centering + dim + fade stage)
      Dialog.Content   className="lightbox-content"    (role=dialog, aria-modal, focus target)
        Dialog.Title   className="sr-only"             (accessible name; Ark auto-links it)
        <figure className="pc-card pc-card--lightbox" …holo handlers/ref…>  (unchanged)
```

The Zag dialog machine supplies, by default, everything the effects did by hand:

| Old hand-rolled effect | Ark default that replaces it |
| --- | --- |
| Escape `keydown` → `onClose` | `closeOnEscape` (default true) |
| body scroll-lock save/restore | `preventScroll` (default true) |
| capture + restore focus to trigger | `restoreFocus` (default true) |
| Tab-trap on the backdrop | `trapFocus` (default true) |
| backdrop-click close (`target===currentTarget`) | `closeOnInteractOutside` (default true) — clicks **outside** `Dialog.Content` close |
| card-click `stopPropagation` (don't close) | inert by construction — clicks *inside* Content are never "outside" |
| `role`/`aria-modal` on the backdrop | `modal` (default true) puts them on `Dialog.Content` |
| `createPortal(…, document.body)` | `<Portal>` |
| `useId` + sr-only span + manual `aria-labelledby` | `<Dialog.Title>` (Ark auto-sets `aria-labelledby` on Content) |

**Net:** the component dropped from ~160 lines (3 effects + a trap + 2 click guards + manual a11y) to ~140 lines that are almost entirely the holo `<figure>` markup. The whole `useEffect`/`useCallback`/`useRef`/`useId` import line collapsed to just `useHoloPointer`.

### Why the classes land where they do

- **`.lightbox-backdrop` → `Dialog.Positioner`.** That class is the *stage*: `position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 2rem;` + the gold/coral/blue radial vignette + `cursor: zoom-out` + the `lightbox-fade` animation. In Ark's anatomy the Positioner is the centering part, and it's the element the card centers within — identical role to the old backdrop. We deliberately **do not render a separate `Dialog.Backdrop`**: the old design used *one* element for both centering and the dim, and modality (hiding content below, scroll-lock) is handled by the machine's `modal`/`preventScroll`, not by a visual backdrop node. One element in, one element out — zero visual drift. Clicking the Positioner area around the card is "outside Content", so `closeOnInteractOutside` reproduces the old backdrop-click-to-close.
- **`.pc-card--lightbox` geometry is unchanged.** It's sized to be a direct grid item of the centered stage (`width: min(86vw, …)`, big shadow, the `pc-thumb`/`pc-rotator`/`pc-shine`/`pc-glare` holo layers).
- **`Dialog.Content` → new `.lightbox-content { display: contents }`.** Ark needs a Content node to carry `role="dialog"`, `aria-modal`, `tabIndex=-1`, and to be the focus-trap container. But the old DOM had the `<figure>` as a *direct* child of the centering stage. `display: contents` makes Content layout-transparent so the figure still centers exactly as before, while Content stays in the DOM/a11y tree for Ark's machinery. **This is the only `index.css` addition** (see below).

### Holo + focus-trap interaction (verified, no conflict)

The holo (`useHoloPointer`) attaches its ref + pointer handlers to the `<figure>` and reads **the figure's own** `getBoundingClientRect()`, so it's independent of Content's box — `display: contents` on the Content ancestor doesn't affect it. The focus trap targets `Dialog.Content` (which has `tabIndex=-1`); since the `<figure>` is non-interactive, Content is the sole focus stop and Tab just keeps focus there — *exactly* the old "backdrop is the only focusable element" trap behavior. No focusable holo elements means nothing competes with the trap.

---

## `index.css` additions

Exactly **one** rule was added (right after `.lightbox-backdrop:focus-visible`):

```css
.lightbox-content {
  display: contents;
}
```

**Why:** Ark's `Dialog.Content` must exist as a real node (it carries `role="dialog"`, `aria-modal`, `tabIndex=-1`, and is the focus-trap container), but the existing layout expects the holo `<figure>` to be a *direct grid child* of the centered stage. `display: contents` makes Content add no box of its own, so the card centers identically while Content remains in the DOM/a11y tree. litewind does ship a `contents` utility, but adding the named class in `index.css` keeps the intent documented next to the lightbox rules. No other CSS changed; `.lightbox-backdrop`, `.pc-card--lightbox`, `.sr-only`, and all holo layers are byte-for-byte the same.

---

## Gotchas (learned during the reference conversion)

1. **`Dialog.Root` is a context provider with no DOM node.** Passing `aria-labelledby`/`className` to it is dropped — it never reaches the content. Put DOM attributes on the leaf parts (`Dialog.Content`, etc.).
2. **Don't override Ark part `id`s when you want the auto-ARIA wiring.** Ark sets `Dialog.Content`'s `aria-labelledby` to *its own generated* `Dialog.Title` id, but only when a `Dialog.Title` is rendered. If you pass a custom `id` to `Dialog.Title`, you break that reference (Content points at Ark's id, your Title has yours) and the dialog ends up with **no accessible name**. Fix: render `<Dialog.Title>` with no `id` and let Ark link it. (Same applies to `Dialog.Description` → `aria-describedby`.) We hit this first cut — the accessible name silently disappeared until we removed our `useId`.
3. **`<Portal>` defaults to `document.body`** — don't reach for `createPortal`. To portal elsewhere, pass `container={ref}`.
4. **No separate `Dialog.Backdrop` unless you actually need a distinct dim layer.** Modality (scroll-lock, hiding/inert-ing content below) comes from the machine's `modal`/`preventScroll`, *not* from a backdrop element. Rendering an unused `Dialog.Backdrop` just adds a node to style. We folded the dim into the Positioner to match the old single-element stage.
5. **Headless-browser focus quirk (testing only).** When verifying with headless Chrome via CDP, `focus-trap` refuses to activate if `document.hasFocus()` is false, which also suppresses Escape-to-close. Enable `Emulation.setFocusEmulationEnabled({enabled:true})` and dispatch a *trusted* key event (`Input.dispatchKeyEvent` with `rawKeyDown`). Even then, headless reports `document.activeElement === BODY` after the trap runs — that's a reporting artifact, not a real focus failure. Real browsers behave correctly.
6. **litewind utility gaps.** litewind is a *static* prebuilt Tailwind: **no arbitrary values** (`bg-[#abc]`, `w-[460px]`, `z-[1000]`, …), and some plugins/utilities may be absent (e.g. `backdrop-blur`). When Ark's markup needs a utility litewind lacks, **add a named rule to `index.css`** (as we did with `.lightbox-content`) — never reach for an arbitrary-value class and never add a Tailwind build step.
7. **Controlled-open at mount works.** With `open` controlled `true` from the first render and `unmountOnExit` left default (false), `Dialog.Content` mounts immediately (no enter animation gate) — important because our parent mounts the component only when it wants it open.

---

## Conversion inventory for the next fixers

Three components remain. For each: the current markup, the Ark primitive + parts, and the single biggest risk. **Read the "controlled vs self-owned state" rule above before starting any of them** — all three must drive an *existing* external store, not fork local state.

### A. `src/components/Tabs.tsx` → Ark **Tabs** — ⚠️ route-driven, this is the risk

**Current markup.** A `<nav className="tabbar …">` rendering **react-router `NavLink`s**, *not* a self-owned tab list:

- Three category links — `to="/pokemon"`, `/poketools`, `/specials` — each `<NavLink className={({isActive}) => ['tab px-4 py-1.5 text-sm', isActive ? 'is-active' : ''].join(' ')}>`.
- A fourth `<NavLink to="/collection" className="tab tab--collection …">` carrying a **live badge** `<span className="tab-badge">{totalCount}</span>` from `useCollection()` (rendered only when `totalCount > 0`).

Selection is **owned by the router** (`NavLink`'s `isActive` from the current URL); rendered by `GridLayout` on the category routes and by `CollectionView` on `/collection`. There is **no internal selected-tab state** today.

**Ark mapping.**
- `Tabs.Root` — **controlled**: `value` = the current route's `to` (derive from `useLocation().pathname` / matched route), `onValueChange` = `navigate(details.value)`. Do **not** let Ark own selection.
- `Tabs.List` ← `className="tabbar flex flex-shrink-0 gap-3 px-6"`.
- `Tabs.Trigger` **with `asChild`** wrapping each existing `NavLink`, so the router stays the source of truth for both navigation *and* the `is-active` class, while Ark adds roving-tabindex + arrow-key semantics. Keep the `tab-badge` inside the collection trigger's NavLink.
- There are **no `Tabs.Content` panels here** — the routed views render the panels, not Ark. That's fine; `Tabs.Root`/`List`/`Trigger` can be used without `Content`.

**Biggest risk: reconciling Ark's self-owned selection with router navigation.** Ark Tabs wants to own `value` and render `Content`; here the *router* owns selection and renders content via `<Routes>`. Two failure modes to avoid: (1) double source of truth — Ark's internal value drifting from the URL on back/forward or deep-link; solve by running fully **controlled** (`value` synced to the current path every render, `onValueChange` → `navigate`). (2) ARIA mismatch — `Tabs.Trigger` sets `role="tab"`/`aria-selected` and expects an associated `tabpanel`; with no `Tabs.Content`, `aria-controls` dangles. **Decision the fixer must make explicitly:** is Ark Tabs even the right fit, or do we keep `NavLink`s and only borrow roving-focus/arrow-key behavior? Recommendation: `Tabs.Root` + `List` + `Trigger asChild={NavLink}`, controlled by route, **no Content** — but verify arrow-key nav + the `is-active`/badge visuals survive, and confirm the missing-panel ARIA is acceptable (or supply `aria-controls`/panel ids that point at the routed `<main>`). If the ARIA reconciliation gets ugly, keeping plain `NavLink`s is a legitimate outcome.

### B. `src/components/SearchFilterBar.tsx` → Ark **Select** (and/or **Combobox**) — ⚠️ URL-owned state

**Current markup.** A `.filter-bar` with:
- A **free-text search** `<input type="search" className="filter-search-input">` — locally buffered in `useState` and written to the URL `q` param on a **180 ms debounce** (re-synced from the URL on back/forward/clear).
- Seven **multi-select facets**, each via the local `MultiSelect` component: a `<button className="filter-trigger">` (with a count pill + caret) that toggles a `<div className="filter-menu">` containing a `<ul className="filter-options">` of `<label><input type="checkbox">…</label>` rows. Closes on outside-pointerdown/Escape via a local `useDismiss` hook. **All seven are multi-select** (OR-within-facet): **Type, Subtype, Card Class, Generation, Set, Series, Role**. (Each facet hides itself when its option list is empty — category-awareness; `Role` shows capitalized labels while storing raw lowercase values via `formatLabel`.)
- A mobile-only **“Filters” toggle** (`.filter-trigger.filter-toggle`) that collapses the facet pills (local UI state only).
- A meta row: result count, active-filter badge, **Clear all** button.

**State lives entirely in the URL** via `useSearchParams` (see `useCardFilters.ts` for `PARAM` keys + parsing): the component holds *only* the debounced text buffer and the mobile-collapse boolean. Changes are emitted by building a fresh `URLSearchParams` from the live params and calling `onChange` (→ `setSearchParams(next, {replace:true})` in `FilterableGrid`).

**Ark mapping.**
- Each facet → **`Select`** with `multiple` (closest to the current checkbox-list dropdown): `Select.Root` (multiple, **controlled** `value` = the facet's selected array from the URL, `onValueChange` → write that facet's comma-joined param), `Select.Control`/`Select.Trigger` ← `.filter-trigger` (keep the count pill + caret), `Select.Positioner` + `Select.Content` ← `.filter-menu`, `Select.Item` per option ← the `.filter-option` rows (`Select.ItemIndicator` for the check). Use `Select.ClearTrigger` for the per-facet “Clear”. Ark gives you typeahead + arrow-key + proper `listbox`/`option` ARIA that the hand-rolled checkbox dropdown lacks. (Use **`Combobox`** instead for a facet only if it needs an in-popover *type-to-filter* input over a long option list — e.g. Set; otherwise `Select` is the like-for-like swap.)
- Free-text search → **leave as the existing `<input type="search">`** (it's not an Ark widget — it's a debounced text field). Or, only if you want suggestions, promote it to a `Combobox` whose input writes `q`. Default: keep it as-is; it already maps cleanly to the URL.
- Keep `formatLabel` for Role (display capitalized, store raw), the empty-options hide, the mobile collapse, and Clear-all unchanged.

**Biggest risk: the Ark widgets MUST read/write the same URL state, not fork local state.** Every `Select` must be **controlled** off `filters.*` (parsed from `useSearchParams`) with `onValueChange` mutating the *shared* `URLSearchParams` through the existing `onChange`/`setList`/`toggle` plumbing (comma-joined, `replace:true`). If a fixer lets Ark own the selection (uncontrolled `defaultValue`), the URL and the widget desync and deep-linking/back-forward/Clear-all break. Watch case-insensitivity (URL `fire` must tick `Fire`) and keep the debounce on the text field. Secondary: the current dropdown renders inline at `z-index: 20` — keep `Select.Content` inline (not portalled) unless a stacking bug appears, to preserve the filter-bar flow.

### C. `src/components/CollectionView.tsx` → Ark **NumberInput** — ⚠️ localStorage-owned state

**Current markup.** Inside `CollectionControls` (overlaid on each collection tile via `FilterableGrid`'s `renderOverlay`), a `<div className="collection-stepper" role="group">` with:
- a **minus** `<button className="collection-step-btn">` (`−`), **disabled at qty ≤ 1** (remove handles deletion), `onClick={() => setQuantity(cardKey, qty - 1)}`,
- a `<span className="collection-qty">{qty}</span>` (no text input today — display only),
- a **plus** `<button className="collection-step-btn">` (`+`), `onClick={() => setQuantity(cardKey, qty + 1)}`,
- plus a separate `.collection-remove-btn`.

Quantity comes from `useCollection().quantityOf(cardKey)` and is written via `setQuantity(cardKey, n)` — which **persists to `localStorage`** (`STORAGE_KEY = 'pokecards.collection'`) and is reactive app-wide via `useSyncExternalStore` (the tab badge, detail button, and this view all update together). `setQuantity` **floors to an integer and removes the entry when `n < 1`**.

**Ark mapping.**
- `NumberInput.Root` — **controlled**: `value={String(qty)}`, `onValueChange={(d) => setQuantity(cardKey, d.valueAsNumber)}`, `min={1}`, `step={1}`, `allowMouseWheel` optional. `className="collection-stepper"` (keep `role="group"` semantics — NumberInput.Root already provides grouping/labelling; wire `aria-label` = `Quantity of {name}`).
- `NumberInput.DecrementTrigger` ← `.collection-step-btn` (the `−`). Ark auto-disables it at `min`, replacing the manual `disabled={qty <= 1}`.
- `NumberInput.Input` ← `.collection-qty` styling — **note this is a real `<input>`, not a `<span>`**: it makes the quantity directly editable (an upgrade), but you must style the input to look like the current static number (or keep it `readOnly` if you want to preserve display-only behavior exactly). Decide explicitly.
- `NumberInput.IncrementTrigger` ← `.collection-step-btn` (the `+`).
- Keep the separate `.collection-remove-btn` as-is (not part of NumberInput).

**Biggest risk: NumberInput must drive the same `useCollection`/localStorage store — not hold its own value.** Run it **controlled** off `quantityOf(cardKey)` with `onValueChange` → `setQuantity`, so every change flows through the existing persisted, reactive store (and the badge/detail stay in sync). Pitfalls: (1) **`min=1` vs. removal** — Ark clamps to `min`, so the minus at qty 1 will *disable* rather than remove; that matches today's `disabled={qty<=1}` (removal is the separate button), so don't wire decrement-below-1 to `remove` unless you intend to change behavior. (2) Ark NumberInput values are **strings** and it allows transient empty/invalid input — guard with `valueAsNumber`/the existing `Math.floor` + `< 1` handling in `setQuantity` (already does this) so a blanked field can't write `NaN`. (3) Keep `stopPropagation` on the controls container so editing the input doesn't trigger the tile's underlying `<Link>` navigation.
