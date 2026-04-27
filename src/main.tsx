// =============================================================================
// main.tsx — Vite entry point. Mounts <App /> into the #root element from
// index.html. Wrapped in <StrictMode> so React surfaces unsafe lifecycles
// and double-invokes effects in development (no impact in production).
//
// `index.css` here brings in Tailwind v4's stylesheet (configured via the
// @tailwindcss/vite plugin in vite.config.ts) plus any project-level utility
// classes such as `card-shimmer`, `animate-fade-up`, `stale-glow`, and
// `font-mono-data` / `font-display` font-family aliases used throughout the
// component tree.
// =============================================================================

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
