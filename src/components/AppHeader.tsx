import { Link } from 'react-router-dom'

// Chunky line-art Poké Ball — a friendly sticker glyph (sky-blue via CSS),
// thick rounded strokes to match the playful "kid" wordmark.
function PokeballGlyph() {
  return (
    <svg
      className="pokeball-glyph"
      width="34"
      height="34"
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="20.5" stroke="currentColor" strokeWidth="3.5" />
      <path d="M3.5 24h13" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M31.5 24H44.5" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="24" cy="24" r="7" stroke="currentColor" strokeWidth="3.5" />
      <circle cx="24" cy="24" r="2.8" fill="currentColor" />
    </svg>
  )
}

// The POKÉCARDS brand header. Shared across BOTH the tabbed grid views and the
// standalone card-detail view for brand consistency. The wordmark is a home link
// (→ /pokemon) so it doubles as a "back to the vault" affordance everywhere.
export default function AppHeader() {
  return (
    <header className="app-header flex-shrink-0 px-6 py-4">
      <Link to="/pokemon" className="brand-home flex w-fit items-center gap-3">
        <PokeballGlyph />
        <div>
          <h1 className="wordmark text-3xl">
            POKÉ<span className="wordmark-accent">CARDS</span>
          </h1>
          <p className="app-subtitle text-sm">Gotta collect &rsquo;em all!</p>
        </div>
      </Link>
    </header>
  )
}
