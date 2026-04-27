/// <reference types="vite/client" />

// `__BUILD_DATE__` is injected at build time by Vite's `define` config (see
// vite.config.ts). It carries an ISO timestamp string captured when the
// build started. The Footer component reads this and renders an
// "UPDATED: MMM D, YYYY" line so each deploy advertises its own age.
//
// During `vite dev`, `define` runs once at server start, so the value will
// be the dev-server start time.
declare const __BUILD_DATE__: string;
