/**
 * Server-side environment resolution — fail loud, never a bare stack trace.
 *
 * Every misconfiguration thrown here names the exact env variable and links the
 * doc, so a first-run user gets an actionable message instead of a cryptic
 * transport failure deep inside the catalog client. Secrets are read here and
 * only here (server-side); they never reach a client component (see AGENTS.md
 * "Secrets never reach client components").
 */

/**
 * Known-working Shopify published sample profile. Served as
 * `application/json` and verified working keyless (2026-07-04). Mirrors the
 * value in the repo-root `.env.example`. Used as a DEV-only fallback when
 * `AGENT_PROFILE_URL` is unset so `pnpm dev` works with zero setup. Publish
 * your own profile identity before production (your deploy serves one at
 * `/agent-profile.json`).
 */
export const DEV_FALLBACK_PROFILE_URL =
  "https://shopify.dev/ucp/agent-profiles/2026-04-08/valid-with-capabilities.json";

const DOC_LINK = "docs/getting-started.md#agent-profile";

/** Resolved server environment for the catalog proxy. */
export interface ServerEnv {
  /** Public URL of the UCP agent profile, injected into every catalog request. */
  agentProfileUrl: string;
  /** Optional token-tier client id (raises rate limits). */
  clientId?: string;
  /** Optional token-tier client secret. Never sent to the browser. */
  clientSecret?: string;
}

/**
 * Read and validate the server environment.
 *
 * `agentProfileUrl` resolves to `process.env.AGENT_PROFILE_URL` when set,
 * otherwise falls back to {@link DEV_FALLBACK_PROFILE_URL} for local dev.
 *
 * Throws a descriptive error (naming the variable + linking {@link DOC_LINK})
 * when `AGENT_PROFILE_URL` points at localhost/127.0.0.1 — Shopify's servers
 * fetch the profile themselves and cannot reach your machine, so a localhost
 * URL can never work even though the dev server happily serves it.
 */
export function getServerEnv(): ServerEnv {
  const raw = process.env.AGENT_PROFILE_URL?.trim();
  const agentProfileUrl = raw && raw.length > 0 ? raw : DEV_FALLBACK_PROFILE_URL;

  if (/localhost|127\.0\.0\.1/i.test(agentProfileUrl)) {
    throw new Error(
      `AGENT_PROFILE_URL is set to a localhost URL (${agentProfileUrl}), which ` +
        `cannot work: Shopify's servers fetch the agent profile themselves and ` +
        `cannot reach your machine. Deploy the app and point AGENT_PROFILE_URL at ` +
        `<your-deploy-host>/agent-profile.json (this app self-hosts it), or use a ` +
        `public profile URL. Leave AGENT_PROFILE_URL unset for local dev to use the ` +
        `Shopify sample profile. See ${DOC_LINK}.`,
    );
  }

  const clientId = process.env.SHOPIFY_CATALOG_CLIENT_ID?.trim() || undefined;
  const clientSecret =
    process.env.SHOPIFY_CATALOG_CLIENT_SECRET?.trim() || undefined;

  return { agentProfileUrl, clientId, clientSecret };
}
