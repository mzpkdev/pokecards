import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getCardDetail, resolveSimilar } from '../cardDetails'
import type { SimilarLink } from '../cardDetails'
import { seriesOf } from '../data'
import { energyIcon } from '../energyIcons'
import { formatRoleLabel } from '../roleLabel'
import type { CardDetail } from '../types'
import CardLightbox from './CardLightbox'

// Energy / type symbols now come from real, recognizable per-type icons (a
// vendored MIT SVG set — see src/energyIcons.ts + src/assets/energy/), not a
// letter-in-a-circle. energyIcon(type) resolves a type/energy name to its
// (Vite-hashed) SVG URL, falling back to the neutral Colorless icon for any
// unknown/missing type so the UI never shows a broken image.

// A type "tag": the energy icon + (optionally) a label. Used for the head type
// badges and for weaknesses/resistances (where `label` carries "Type ×2" etc.).
// The icon is a self-colored disc, so the type's color identity reads from the
// icon itself rather than a colored background.
//
// When `to` is supplied it renders as a real <Link> (keyboard-accessible for
// free) to a global filtered grid — used for the HEAD type badges, which drill
// down to #/type/:type. Without `to` it's a static <span> — used for
// weaknesses/resistances, which are stat displays, not navigation. The visual
// chip is identical; the link variant only layers on the .type-pill--link
// interaction affordances (hover/focus) so it reads as clickable.
function TypePill({
  type,
  label,
  to,
  ariaLabel,
}: {
  type: string
  label?: string
  to?: string
  ariaLabel?: string
}) {
  const inner = (
    <>
      <img className="type-icon" src={energyIcon(type)} alt="" aria-hidden="true" />
      <span className="type-pill-label">{label ?? type}</span>
    </>
  )
  if (to) {
    return (
      <Link to={to} className="type-pill type-pill--link" aria-label={ariaLabel}>
        {inner}
      </Link>
    )
  }
  return <span className="type-pill">{inner}</span>
}

// A small energy pip — the type's icon disc. Used for attack costs and the
// (colorless) retreat cost. The SVG already carries the type's color, so it
// reads as a real energy symbol at a glance.
function EnergyPip({ type }: { type: string }) {
  return (
    <img
      className="energy-pip"
      src={energyIcon(type)}
      title={type}
      alt={type}
    />
  )
}

// Hero card image with a graceful loading/placeholder state. The image is an
// external pokemontcg.io hires URL (allowed on the detail page). Until it
// decodes we show a themed skeleton; on error we show a labeled placeholder so
// the layout never collapses.
//
// The frame is a real <button> so it's natively click- AND keyboard-activatable
// (Enter/Space) — clicking/activating it opens the fullscreen lightbox via
// onOpen. The hero ref is forwarded so the page can restore focus here when the
// lightbox closes.
function HeroImage({
  src,
  alt,
  onOpen,
  triggerRef,
}: {
  src: string
  alt: string
  onOpen: () => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  return (
    <div className="detail-hero">
      <button
        type="button"
        ref={triggerRef}
        className="detail-hero-frame detail-hero-button"
        onClick={onOpen}
        aria-label={`View ${alt} fullscreen`}
        aria-haspopup="dialog"
      >
        {status !== 'loaded' && (
          <div className="detail-hero-skeleton" aria-hidden={status === 'loading'}>
            {status === 'error' ? (
              <span className="detail-hero-fallback">Image unavailable</span>
            ) : (
              <span className="detail-hero-spinner" />
            )}
          </div>
        )}
        <img
          src={src}
          alt={alt}
          className="detail-hero-img"
          data-status={status}
          decoding="async"
          draggable={false}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
        />
        {/* Hover/focus affordance overlay — a faint "expand" hint so the hero
            visibly reads as interactive (the cursor + this glyph). aria-hidden:
            the button already carries an accessible label. */}
        <span className="detail-hero-expand" aria-hidden="true">
          ⤢
        </span>
      </button>
    </div>
  )
}

// Lookup lifecycle. A cold deep-link fetches + indexes the datasets before the
// record is available, so we model loading / found / not-found explicitly.
type DetailState =
  | { status: 'loading' }
  | { status: 'found'; card: CardDetail }
  | { status: 'notfound' }

export default function CardDetailPage() {
  // :id is read from the route and handed to getCardDetail, which (async)
  // ensures the datasets are loaded, indexes printing-id → record, and returns
  // the matching record or null. Works on a cold deep-link/refresh.
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState<DetailState>({ status: 'loading' })
  // Active printing = which printing's image fills the hero preview. We store
  // just the printing *id* (a stable string); the actual Printing record and
  // its image are derived from the loaded card below, so there's a single
  // source of truth and the "current printing / current image" is trivial to
  // read or lift (a later fullscreen view reads this). `null` means "use the
  // card's default" (the first printing) — the common case on a fresh load.
  const [activePrintingId, setActivePrintingId] = useState<string | null>(null)
  // Fullscreen lightbox open/closed. Opening is triggered by the hero button;
  // closing (Escape / backdrop) restores focus to the hero via heroButtonRef.
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const heroButtonRef = useRef<HTMLButtonElement | null>(null)
  // Resolved "similar" targets. The raw card.similar tokens are NOT uniformly
  // linkable (pokemon-form = printing ids, poketool-form = card names — see
  // cardDetails.ts), so we resolve them to concrete { id, name } pairs via the
  // same catalog index that backs the lookup, and render THOSE as the chips.
  // Held in state because resolution is async (index-backed) and runs per-:id.
  const [similarLinks, setSimilarLinks] = useState<SimilarLink[]>([])

  useEffect(() => {
    let active = true
    // Reset to loading when :id changes before the async lookup resolves. The
    // set-state-in-effect rule flags the sync setter, but this is the intended
    // per-id loading reset (a cold deep-link must show a spinner while the
    // datasets fetch/index), not a cascading render bug.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: 'loading' })
    // Drop any printing selection carried over from a previously-viewed card so
    // the new card opens on its own default printing — an intended per-:id
    // reset, not a render loop. (The disable above already covers this block's
    // set-state-in-effect; the rule reports the cluster once.)
    setActivePrintingId(null)
    // Also close any open lightbox on a card change so it can't outlive the
    // record it was showing (e.g. a deep-link swap). Same intended per-:id reset.
    setLightboxOpen(false)
    // Clear any prior card's resolved similar links so they can't flash on the
    // new card before its own resolve completes. Same intended per-:id reset.
    setSimilarLinks([])
    getCardDetail(id)
      .then((card) => {
        if (!active) return
        setState(card ? { status: 'found', card } : { status: 'notfound' })
        // Resolve this card's similar tokens (printing-id- or name-form) into
        // concrete linkable targets. Unresolvable tokens are dropped, so the
        // Similar section only renders links that navigate to a real card.
        // Absent/empty similar resolves to [] (the section then renders nothing).
        return resolveSimilar(card?.similar ?? [])
      })
      .then((links) => {
        if (!active || !links) return
        setSimilarLinks(links)
      })
      .catch(() => {
        if (!active) return
        // A failed fetch is treated as not-found from the user's perspective
        // (with a back link), rather than a hard crash.
        setState({ status: 'notfound' })
      })
    return () => {
      active = false
    }
  }, [id])

  // Back = history.back(), falling back to the grid if there's no history (e.g.
  // a deep link straight to #/card/:id opened in a fresh tab).
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/pokemon')
    }
  }

  // Loading — themed spinner while the dataset fetches/indexes (cold deep-link).
  if (state.status === 'loading') {
    return (
      <main className="detail-page min-h-0 flex-1 overflow-y-auto">
        <div className="detail-container">
          <div className="grid-status" role="status" aria-live="polite">
            <span className="grid-status-spinner" aria-hidden="true" />
            <span className="grid-status-text">Loading card…</span>
          </div>
        </div>
      </main>
    )
  }

  // Not found — no card with this id (or the fetch failed). Offer a back link.
  if (state.status === 'notfound') {
    return (
      <main className="detail-page min-h-0 flex-1 overflow-y-auto">
        <div className="detail-container">
          <button type="button" className="detail-back" onClick={handleBack}>
            <span aria-hidden="true">←</span> Back
          </button>
          <div className="grid-status grid-status--empty" role="alert">
            <span className="grid-status-emoji" aria-hidden="true">
              ✦
            </span>
            <span className="grid-status-title">Card not found</span>
            <span className="grid-status-text">
              No card matches “{id}”.
            </span>
            <Link to="/pokemon" className="detail-notfound-link">
              Browse Pokémon
            </Link>
          </div>
        </div>
      </main>
    )
  }

  const card = state.card
  // The active printing drives the hero preview. Resolve the stored id to a
  // record; if it's null (fresh card) or doesn't match (defensive — e.g. the
  // selection somehow outlived a card swap), fall back to the first printing.
  // `hero` is therefore always the *currently shown* printing (or undefined
  // only when the card has no printings at all).
  const hero =
    card.printings.find((p) => p.id === activePrintingId) ?? card.printings[0]
  // SET + EXPANSION (series) for the ACTIVE printing, shown near the title and
  // each a clickable drill-down. set = the printing's set name; series =
  // seriesOf(printing id) (the display-ready expansion label, e.g.
  // "Scarlet & Violet"). Both derive from `hero`, so they update automatically
  // when the printing switcher changes the active printing. `hero` is undefined
  // only when the card has no printings at all, in which case we show neither.
  const heroSet = hero?.set
  const heroSeries = hero ? seriesOf(hero.id) : ''

  return (
    // Own scroll container: the detail page is NOT virtualized, so it scrolls
    // normally. min-h-0 + flex-1 lets it fill the leftover height under the
    // shared header in App's full-height flex layout, and overflow-y-auto makes
    // the content scroll within that area.
    <main className="detail-page min-h-0 flex-1 overflow-y-auto">
      <div className="detail-container">
        {/* Back affordance — its own view, no tab bar. */}
        <button type="button" className="detail-back" onClick={handleBack}>
          <span aria-hidden="true">←</span> Back
        </button>

        <article className="detail-layout">
          {hero ? (
            // key on the printing id so HeroImage remounts when the active
            // printing changes — that resets its internal load status, so the
            // themed skeleton shows again while the newly-selected hires image
            // decodes (instead of flashing the previous image's "loaded" state).
            <HeroImage
              key={hero.id}
              src={hero.image}
              alt={`${card.name} card`}
              triggerRef={heroButtonRef}
              onOpen={() => setLightboxOpen(true)}
            />
          ) : (
            <div className="detail-hero">
              <div className="detail-hero-frame">
                <div className="detail-hero-skeleton">
                  <span className="detail-hero-fallback">No image</span>
                </div>
              </div>
            </div>
          )}

          <div className="detail-body">
            {/* HEAD — name, HP chip, type pills, subtypes. */}
            <header className="detail-head">
              <div className="detail-head-top">
                <h2 className="detail-name">{card.name}</h2>
                {card.hp && (
                  <span className="detail-hp">
                    <span className="detail-hp-label">HP</span>
                    {card.hp}
                  </span>
                )}
              </div>
              <div className="detail-head-meta">
                {/* Each head TYPE badge is a real <Link> to the global "by type"
                    grid (#/type/<type>) — every card across all categories whose
                    types include it (mirrors the role/evolution drill-downs).
                    Types are URL-encoded for safety. The weakness/resistance
                    TypePills below stay static (stat displays, not navigation). */}
                {card.types?.map((t) => (
                  <TypePill
                    key={t}
                    type={t}
                    to={`/type/${encodeURIComponent(t)}`}
                    ariaLabel={`Cards of type ${t}`}
                  />
                ))}
                {card.subtypes.map((s) => (
                  <span key={s} className="chip chip-subtype">
                    {s}
                  </span>
                ))}
              </div>
              {/* SET + EXPANSION for the active printing — shown near the title
                  and each a clickable drill-down to the matching global filtered
                  grid (#/set/<set>, #/series/<series>), mirroring the type/role
                  pattern. Both read from `hero`, so switching the active printing
                  in the Printings switcher updates them live. Rendered only when
                  the card has a printing (heroSet present); the series link is
                  additionally guarded on a non-empty seriesOf result. Params are
                  URL-encoded (set/series names contain spaces & "&"). */}
              {heroSet && (
                <div className="detail-head-origin">
                  <Link
                    to={`/set/${encodeURIComponent(heroSet)}`}
                    className="origin-chip origin-chip--set"
                    aria-label={`Cards in set ${heroSet}`}
                  >
                    <span className="origin-chip-label">Set</span>
                    <span className="origin-chip-value">{heroSet}</span>
                  </Link>
                  {heroSeries && (
                    <Link
                      to={`/series/${encodeURIComponent(heroSeries)}`}
                      className="origin-chip origin-chip--series"
                      aria-label={`Cards in series ${heroSeries}`}
                    >
                      <span className="origin-chip-label">Series</span>
                      <span className="origin-chip-value">{heroSeries}</span>
                    </Link>
                  )}
                </div>
              )}
            </header>

            {/* RULES — Trainer/Tool rules text (poketools.json). Pokémon cards
                don't carry this, so the section is omitted for them. */}
            {card.rules && card.rules.length > 0 && (
              <section className="detail-section">
                <h3 className="detail-section-title">Rules</h3>
                <ul className="detail-list rules-list">
                  {card.rules.map((rule, i) => (
                    <li key={i} className="rule-row">
                      {rule}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ABILITIES — only render if non-empty. */}
            {card.abilities && card.abilities.length > 0 && (
              <section className="detail-section">
                <h3 className="detail-section-title">Abilities</h3>
                <ul className="detail-list">
                  {card.abilities.map((ability, i) => (
                    <li key={`${ability.name}-${i}`} className="ability-row">
                      <div className="ability-head">
                        {ability.type && (
                          <span className="chip chip-ability-kind">{ability.type}</span>
                        )}
                        <span className="ability-name">{ability.name}</span>
                      </div>
                      {ability.text && <p className="ability-text">{ability.text}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ATTACKS — energy cost pips, name, right-aligned damage, text. */}
            {card.attacks && card.attacks.length > 0 && (
              <section className="detail-section">
                <h3 className="detail-section-title">Attacks</h3>
                <ul className="detail-list">
                  {card.attacks.map((attack, i) => (
                    <li key={`${attack.name}-${i}`} className="attack-row">
                      <div className="attack-line">
                        <span className="attack-cost">
                          {attack.cost.length > 0 ? (
                            attack.cost.map((c, ci) => (
                              <EnergyPip key={`${c}-${ci}`} type={c} />
                            ))
                          ) : (
                            <span className="attack-cost-none">—</span>
                          )}
                        </span>
                        <span className="attack-name">{attack.name}</span>
                        {attack.damage && (
                          <span className="attack-damage">{attack.damage}</span>
                        )}
                      </div>
                      {attack.text && <p className="attack-text">{attack.text}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* WEAKNESSES / RESISTANCES / RETREAT — a stat row; omit empties. */}
            {((card.weaknesses?.length ?? 0) > 0 ||
              (card.resistances?.length ?? 0) > 0 ||
              (card.retreat_cost?.length ?? 0) > 0) && (
              <section className="detail-section">
                <div className="stat-grid">
                  {card.weaknesses && card.weaknesses.length > 0 && (
                    <div className="stat-block">
                      <span className="stat-label">Weakness</span>
                      <div className="stat-values">
                        {card.weaknesses.map((w, i) => (
                          <TypePill
                            key={`${w.type}-${i}`}
                            type={w.type}
                            label={`${w.type} ${w.value}`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {card.resistances && card.resistances.length > 0 && (
                    <div className="stat-block">
                      <span className="stat-label">Resistance</span>
                      <div className="stat-values">
                        {card.resistances.map((r, i) => (
                          <TypePill
                            key={`${r.type}-${i}`}
                            type={r.type}
                            label={`${r.type} ${r.value}`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {card.retreat_cost && card.retreat_cost.length > 0 && (
                    <div className="stat-block">
                      <span className="stat-label">Retreat</span>
                      <div className="stat-values retreat-pips">
                        {card.retreat_cost.map((c, i) => (
                          <EnergyPip key={`${c}-${i}`} type={c} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* EVOLVES — from (if not null) / to (if non-empty); omit if empty.
                Each evolution NAME is a real <Link> to the global "related" grid
                (#/related/<name>) — every card across all categories matching
                that name. Names are URL-encoded (they can contain spaces, e.g.
                "Mr. Mime"). Real anchors → keyboard-accessible for free. */}
            {(card.evolves_from || (card.evolves_to?.length ?? 0) > 0) && (
              <section className="detail-section">
                <h3 className="detail-section-title">Evolves</h3>
                <div className="evolves-rows">
                  {card.evolves_from && (
                    <p className="evolves-row">
                      <span className="evolves-label">From</span>
                      <Link
                        to={`/related/${encodeURIComponent(card.evolves_from)}`}
                        className="chip chip-evolve"
                        aria-label={`Cards related to ${card.evolves_from}`}
                      >
                        {card.evolves_from}
                      </Link>
                    </p>
                  )}
                  {card.evolves_to && card.evolves_to.length > 0 && (
                    <p className="evolves-row">
                      <span className="evolves-label">To</span>
                      {card.evolves_to.map((e) => (
                        <Link
                          key={e}
                          to={`/related/${encodeURIComponent(e)}`}
                          className="chip chip-evolve"
                          aria-label={`Cards related to ${e}`}
                        >
                          {e}
                        </Link>
                      ))}
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* ROLE — tag chips, each a real <Link> to the global "by role" grid
                (#/role/<role>) — every card across all categories with that role.
                Optional-chained: `role` is typed required on CardDetail but is
                ABSENT on every specials.json record (which resolves here via the
                all-files detail index), so guard it to avoid a crash on those
                cards (a special then simply renders no Role section / no link).
                Role values are URL-encoded for safety. Anchors are
                keyboard-accessible for free. */}
            {(card.role?.length ?? 0) > 0 && (
              <section className="detail-section">
                <h3 className="detail-section-title">Role</h3>
                <div className="chip-row">
                  {card.role?.map((r) => (
                    // Display the role Capitalized, but link with the RAW value
                    // (the #/role/:role route matches roles case-insensitively
                    // against the raw data, and the aria-label reads the raw role).
                    <Link
                      key={r}
                      to={`/role/${encodeURIComponent(r)}`}
                      className="chip chip-role chip-link"
                      aria-label={`Cards with role ${r}`}
                    >
                      {formatRoleLabel(r)}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* PRINTINGS — set · № with a small thumbnail. Each row is a real
                <button> that swaps the hero preview to that printing's image
                (keyboard-activatable for free; aria-pressed marks the active
                one). The active row gets a gold ring + faint gold wash; because
                litewind ships no theme-color/arbitrary-value utilities (see the
                notes throughout index.css), the gold tint is applied via a tiny
                inline style that reuses the existing --gold* CSS vars, while
                layout/shape/ring-width stay litewind utility classes. */}
            {card.printings.length > 0 && (
              <section className="detail-section">
                <h3 className="detail-section-title">Printings</h3>
                <ul className="printings-list">
                  {card.printings.map((p) => {
                    const selected = p.id === hero?.id
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          // Reuse the existing .printing-row look, then layer on
                          // button-reset + interaction utilities. w-full + the
                          // row's own flex layout keep it visually identical to
                          // the old <li>, just clickable.
                          className={[
                            'printing-row',
                            'w-full',
                            'text-left',
                            'cursor-pointer',
                            'appearance-none',
                            'transition',
                            selected ? 'ring-2' : '',
                          ].join(' ')}
                          // Gold theme tint for the selected state (litewind has
                          // no theme-color utilities). --tw-ring-color colors the
                          // ring-2 utility; background/border lift the row.
                          style={
                            selected
                              ? {
                                  ['--tw-ring-color' as string]: 'var(--gold)',
                                  background: 'var(--gold-soft)',
                                  borderColor: 'var(--gold-line)',
                                }
                              : undefined
                          }
                          aria-pressed={selected}
                          aria-current={selected ? 'true' : undefined}
                          aria-label={`Show ${p.set} №${p.number} printing`}
                          onClick={() => setActivePrintingId(p.id)}
                        >
                          <img
                            className="printing-thumb"
                            src={p.image}
                            alt=""
                            loading="lazy"
                            decoding="async"
                          />
                          <span className="printing-meta">
                            <span className="printing-set">{p.set}</span>
                            <span className="printing-number">№ {p.number}</span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {/* SIMILAR — a curated list of SPECIFIC related cards. Each chip is a
                real <Link> straight to that card's detail page (#/card/<id>), so
                it's keyboard-accessible for free. We render the RESOLVED targets
                (similarLinks), not the raw card.similar tokens: those tokens are
                printing ids on pokemon.json but card NAMES on poketools.json, and
                #/card/:id only resolves printing ids — so resolveSimilar (in
                cardDetails.ts) maps every token to a concrete printing id + the
                target's display name. The chip label is that NAME (readable),
                not the bare id. Unresolvable tokens were dropped during resolve,
                and absent/empty similar resolves to [] — so this section renders
                only when there's at least one real, navigable target. */}
            {similarLinks.length > 0 && (
              <section className="detail-section">
                <h3 className="detail-section-title">Similar</h3>
                <div className="chip-row">
                  {similarLinks.map((s) => (
                    <Link
                      key={s.id}
                      to={`/card/${s.id}`}
                      className="chip chip-similar"
                      aria-label={`View ${s.name}`}
                    >
                      {s.name}
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        </article>
      </div>

      {/* Fullscreen lightbox — a modal overlay (not a route). Shows the
          CURRENTLY-SELECTED printing (`hero.image`, which the switcher drives),
          so opening it after switching printings shows that printing. Rendered
          only while open + while there's an image to show, so Poketool/specials
          cards with no holo-relevant fields still open fine (it's just an image
          + the holo layers). On close we restore focus to the hero button. */}
      {lightboxOpen && hero && (
        <CardLightbox
          src={hero.image}
          name={card.name}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </main>
  )
}
