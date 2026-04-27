// =============================================================================
// Footer.tsx — site-wide footer line.
//
// Three pieces, separated by middle-dot bullets:
//   1. "LAST SYNC: Xm ago"  — relative time since `lastSync` prop, or
//      "AWAITING SYNC" when null. A 60-second tick re-renders so the label
//      ages without a full app re-render.
//   2. "UPDATED: MMM D, YYYY"  — build/deploy date pulled from the
//      `__BUILD_DATE__` global injected at build time by Vite (see
//      vite.config.ts and src/vite-env.d.ts).
//   3. GitHub source link  — opens the public repo. The icon is inlined as
//      SVG because lucide-react removed the GitHub brand mark in recent
//      versions and we don't want to pull in an icon-package just for this.
//
// Accessibility: anchor has `aria-label="View source on GitHub"`, the SVG
// has `aria-hidden="true"`, and the visible "SOURCE" text provides a
// secondary readable label.
// =============================================================================

import { useState, useEffect } from "react";

interface FooterProps {
  /** Epoch ms of the most recent successful sync, or null if the user has
   *  never synced. Drives the "LAST SYNC" / "AWAITING SYNC" label. */
  lastSync: number | null;
}

/**
 * Renders a relative time like "5m ago" / "2h 14m ago" / "3d ago".
 *
 * Granularity bands:
 *   - <60s         → "just now"
 *   - <60m         → "Xm ago"
 *   - <24h         → "Xh Ym ago"
 *   - otherwise    → "Xd ago"
 *
 * Note: caller uppercases the returned string for visual consistency with
 * the rest of the footer's tracked-uppercase aesthetic.
 */
function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function Footer({ lastSync }: FooterProps) {
  // We only need to re-render the relative-time label periodically — the
  // tick value itself is unused. The interval is 60s because that matches
  // the smallest visible unit of `formatTimeAgo`.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!lastSync) return;
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, [lastSync]);

  // Build date is constant for the lifetime of the bundle, so this could
  // be hoisted to module scope. Left in-component for readability.
  const buildDate = new Date(__BUILD_DATE__);
  const buildLabel = buildDate
    .toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
    .toUpperCase();

  return (
    <footer className="border-t border-slate-800/50 bg-slate-900/50 px-4 py-2.5 text-center">
      <div className="flex items-center justify-center gap-3 text-xs font-mono-data tracking-wide text-slate-600">
        <span>
          {lastSync
            ? `LAST SYNC: ${formatTimeAgo(lastSync).toUpperCase()}`
            : "AWAITING SYNC"}
        </span>
        <span className="text-slate-700">·</span>
        <span>UPDATED: {buildLabel}</span>
        <span className="text-slate-700">·</span>
        <a
          href="https://github.com/petethered/superplanner/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-slate-600 transition-colors hover:text-cyan-400"
          aria-label="View source on GitHub"
        >
          {/* Inlined GitHub mark — lucide-react no longer ships a Github
              icon, and pulling in @primer/octicons just for this would be
              overkill. Path data is the standard GitHub Octocat silhouette. */}
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1-.02-1.96-3.2.69-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.69 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18.92-.26 1.91-.39 2.89-.39.98 0 1.97.13 2.89.39 2.21-1.49 3.18-1.18 3.18-1.18.62 1.59.23 2.76.11 3.05.74.8 1.18 1.83 1.18 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.13 0 1.54-.01 2.78-.01 3.16 0 .31.21.68.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
          </svg>
          <span>SOURCE</span>
        </a>
      </div>
    </footer>
  );
}
