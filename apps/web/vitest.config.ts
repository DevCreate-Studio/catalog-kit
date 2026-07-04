import { defineConfig } from "vitest/config";

/**
 * `environment: "jsdom"` because the config-store tests exercise
 * `window.localStorage` / `window.location.hash` hydration precedence
 * directly (no React rendering involved — this is store-only, not
 * component testing).
 */
export default defineConfig({
  test: {
    environment: "jsdom",
  },
});
