/**
 * TowerSitesNav — the shared bar linking Pete's The Tower tools:
 *   towersummary.com · moduletracker.com · effectivepathplanner.com
 *
 * SHARED FILE: the canonical copy lives in tower-summary-graphics at
 * src/shared/TowerSitesNav.tsx; identical copies live in moduleTracker and
 * planner (same path). Edit the canonical copy, then copy it over byte-for-byte
 * so the three sites stay in step.
 *
 * Self-contained on purpose: inline styles plus one scoped <style> block
 * (class names prefixed `tsn-`), no Tailwind classes, no icon library, no
 * props beyond `current`. It renders the same on every site regardless of
 * that site's theme or build setup. Render it once, first thing inside the
 * app's root element, above the site's own header.
 */

export type TowerSite = 'summary' | 'modules' | 'planner';

const SITES: { id: TowerSite; label: string; href: string }[] = [
  { id: 'summary', label: 'Generate Profile Images', href: 'https://towersummary.com/' },
  { id: 'modules', label: 'Track Your Mod Pulls', href: 'https://moduletracker.com/' },
  { id: 'planner', label: 'EP Lab Planner', href: 'https://effectivepathplanner.com/' },
];

const CSS = `
.tsn-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:4px 6px;
  padding:6px 12px;background:#0b0d24;border-bottom:1px solid rgba(62,232,255,.28);
  font:600 13px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.01em}
.tsn-link{display:inline-block;padding:5px 12px;border-radius:999px;color:#b9c0ee;
  text-decoration:none;border:1px solid transparent;transition:color .15s,border-color .15s,background .15s}
.tsn-link:hover{color:#eef1ff;border-color:rgba(62,232,255,.45)}
.tsn-link:focus-visible{outline:2px solid #3ee8ff;outline-offset:2px}
.tsn-current{color:#0b0d24;background:#3ee8ff;border-color:#3ee8ff}
.tsn-current:hover{color:#0b0d24}
@media (prefers-reduced-motion:reduce){.tsn-link{transition:none}}
`;

export function TowerSitesNav({ current }: { current: TowerSite }) {
  return (
    <nav className="tsn-bar" aria-label="The Tower tools">
      <style>{CSS}</style>
      {SITES.map((s) =>
        s.id === current ? (
          <span key={s.id} className="tsn-link tsn-current" aria-current="page">
            {s.label}
          </span>
        ) : (
          <a key={s.id} className="tsn-link" href={s.href}>
            {s.label}
          </a>
        ),
      )}
    </nav>
  );
}
