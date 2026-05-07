// =============================================================================
// vite.config.ts — Vite + Vitest config.
//
// Single source of truth for build and test configuration. Imported from
// `vitest/config` (which re-exports defineConfig from vite/config and adds
// `test`) so this one file covers both `vite build` and `vitest run`.
//
// Plugins:
//   - @vitejs/plugin-react       — JSX/TSX, fast refresh
//   - @tailwindcss/vite          — Tailwind v4 (CSS-first config; pulls in
//                                  lightningcss). The MPL-2.0 in our
//                                  license scan comes from lightningcss
//                                  via this plugin.
//
// `base: "/"` — site is served from the root of effectivepathplanner.com
// (custom domain via CNAME). DO NOT set this back to a subpath like
// "/superplanner/"; that broke production routing in a previous deploy
// and was reverted in commit 501d6dc.
//
// `server.port: 5666` / `preview.port: 5666` — pinned dev/preview port so
// the URL is stable across restarts. `strictPort: true` makes Vite fail
// fast instead of silently bumping to the next free port if 5666 is in
// use, which would otherwise mask "old dev server still running" bugs.
//
// `define.__BUILD_DATE__` — injects the current ISO timestamp as a string
// literal at build time. Footer.tsx reads this global to render the
// "UPDATED: <date>" line. The replacement happens once per process, so
// during `vite dev` the value is the dev-server start time. See
// src/vite-env.d.ts for the global declaration.
//
// Test config:
//   - environment: "jsdom"   — gives us a DOM for React component tests
//   - globals: true          — `describe`/`it`/`expect` available without
//                              imports (we still import them explicitly
//                              for clarity)
//   - setupFiles: []         — none needed yet
//   - passWithNoTests: true  — keeps CI green if a workspace adds a test
//                              dir but hasn't filled it in yet
// =============================================================================

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/",
  server: {
    port: 5666,
    strictPort: true,
  },
  preview: {
    port: 5666,
    strictPort: true,
  },
  define: {
    // Captured at build/dev-server start. JSON.stringify wraps the ISO
    // string in quotes so the textual replacement in source files turns
    // into a valid JS string literal.
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    passWithNoTests: true,
  },
});
