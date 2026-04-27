import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/",
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    passWithNoTests: true,
  },
});
