import type { NextConfig } from "next";

/**
 * Starter Content-Security-Policy.
 *
 * Pragmatic, not locked-down: Next 16 injects an inline bootstrap script and
 * inline styles, so `script-src`/`style-src` must include `'unsafe-inline'` for
 * the app to render (nonce-based hardening is a follow-up). `img-src` allows
 * `https:` because product images are hot-linked from arbitrary merchant CDNs —
 * Shopify compliance requires hot-linking, so we cannot enumerate hosts.
 * `connect-src 'self'` is enough for every client fetch in the app (all hit our
 * own origin: `/api/catalog`, `/taxonomy.json`).
 *
 * `'unsafe-eval'` is added to `script-src` in DEVELOPMENT ONLY: React's dev
 * build uses `eval()` for debugging features (callstack reconstruction) and
 * without it the dev console fills with CSP errors. React never uses `eval()`
 * in production, so the shipped (production) CSP stays strict — no `unsafe-eval`.
 */
const isDev = process.env.NODE_ENV !== "production";

const CSP = [
  "default-src 'self'",
  "img-src 'self' https: data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "connect-src 'self'",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: CSP },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
