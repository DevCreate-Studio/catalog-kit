/**
 * catalog-kit — typed client for the Shopify Global Catalog (UCP).
 *
 * Public barrel: the {@link createCatalogClient} factory plus every public
 * primitive (schemas, types, `buildSearchArguments`, `resolveLikeEntries`,
 * `CatalogError`, `ENDPOINTS`, `UCP_SPEC_VERSION`, `storefrontCatalog`,
 * `createAuth`, `createTransport`). Keyless anonymous is the default — no API
 * key required.
 */

import { ENDPOINTS, storefrontCatalog } from "./endpoints";
import { createAuth, type AuthTier } from "./auth";
import { createTransport } from "./transport";
import { CatalogError } from "./errors";
import type { CatalogConfig } from "./config";
import { searchCatalog, type ToolDeps } from "./tools/search";
import { lookupCatalog } from "./tools/lookup";
import { getProduct, type GetProductArgs } from "./tools/get-product";
import type {
  SearchResult,
  LookupResult,
  GetProductResult,
} from "./schemas/responses";

// ── Re-exports: endpoints & version ────────────────────────────────────────
export {
  ENDPOINTS,
  UCP_SPEC_VERSION,
  storefrontCatalog,
} from "./endpoints";

// ── Re-exports: errors ─────────────────────────────────────────────────────
export {
  CatalogError,
  CATALOG_ERROR_CODES,
  type CatalogErrorCode,
  type CatalogErrorExtras,
} from "./errors";

// ── Re-exports: auth & transport ───────────────────────────────────────────
export {
  createAuth,
  type Auth,
  type AuthTier,
  type CreateAuthOptions,
} from "./auth";
export {
  createTransport,
  type Transport,
  type CreateTransportOptions,
} from "./transport";

// ── Re-exports: config (request building) ──────────────────────────────────
export {
  buildSearchArguments,
  resolveLikeEntries,
  assertPublicHttpUrl,
  catalogConfigSchema,
  type CatalogConfig,
  type ApiLikeEntry,
} from "./config";

// ── Re-exports: response schemas & types (all lenient) ─────────────────────
export {
  moneySchema,
  ratingSchema,
  mediaSchema,
  variantSchema,
  productSchema,
  messageSchema,
  paginationSchema,
  searchResultSchema,
  lookupResultSchema,
  getProductResultSchema,
  type CatalogProduct,
  type SearchResult,
  type LookupResult,
  type GetProductResult,
} from "./schemas/responses";

// ── Re-exports: the three typed tools (for advanced/composed use) ──────────
export { searchCatalog, type ToolDeps } from "./tools/search";
export { lookupCatalog } from "./tools/lookup";
export { getProduct, type GetProductArgs } from "./tools/get-product";

/** Scope selector: the whole Global Catalog, or a single storefront. */
export type CatalogScope =
  | { type: "global" }
  | { type: "storefront"; storeDomain: string };

/** Options for {@link createCatalogClient}. */
export interface CreateCatalogClientOptions {
  /**
   * Public URL of your UCP agent profile, injected into every request. Required.
   * Must be served with `Content-Type: application/json` (see AGENTS.md).
   */
  agentProfileUrl: string;
  /**
   * Optional token-tier credentials (Dev Dashboard `client_credentials`). Omit
   * for keyless anonymous access — the default, no API key required.
   */
  auth?: { clientId: string; clientSecret: string };
  /**
   * Scope. `{type:"storefront"}` targets a single shop's catalog endpoint;
   * `{type:"global"}` (default) targets the cross-merchant Global Catalog.
   */
  scope?: CatalogScope;
  /**
   * Explicit endpoint override. Highest precedence — beats `scope` and the
   * default (see the endpoint precedence note below).
   */
  endpoint?: string;
  /** Injectable fetch (defaults to the global `fetch`). */
  fetch?: typeof fetch;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
  /** Max retries on rate-limit / 5xx. */
  maxRetries?: number;
}

/** A ready-to-use catalog client bound to one endpoint, profile, and auth tier. */
export interface CatalogClient {
  /**
   * Run a `search_catalog` call from a {@link CatalogConfig}.
   *
   * Note: the client's endpoint is fixed at construction. If the passed config
   * carries `scope.type === "storefront"`, that per-call scope does **not**
   * re-target the endpoint — the client-level endpoint always wins. Construct a
   * separate client (or pass `endpoint`/`scope` at construction) to hit a
   * different storefront.
   */
  searchCatalog(
    config: CatalogConfig,
    opts?: { cursor?: string },
  ): Promise<SearchResult>;
  /** Run a `lookup_catalog` call for 1–50 product ids. */
  lookupCatalog(args: { ids: string[] }): Promise<LookupResult>;
  /** Run a `get_product` call for a single product. */
  getProduct(args: GetProductArgs): Promise<GetProductResult>;
  /** The resolved auth tier — `"anonymous"` (keyless) or `"token"`. */
  readonly tier: AuthTier;
}

/**
 * Validate `agentProfileUrl` locally, before any network call, so a missing or
 * unreachable profile fails fast with an actionable `INVALID_CONFIG` instead of
 * a cryptic HTTP 422 from Shopify (findings #3, #4dx). Rejects:
 *  - empty / whitespace-only values (the README hands consumers
 *    `process.env.AGENT_PROFILE_URL!`, which is `""` when unset); and
 *  - `localhost` / `127.0.0.1` hosts — Shopify fetches the profile server-side
 *    and cannot reach your machine.
 */
function assertUsableAgentProfileUrl(agentProfileUrl: unknown): void {
  const DOC = "docs/getting-started.md#agent-profile";
  if (typeof agentProfileUrl !== "string" || agentProfileUrl.trim() === "") {
    throw new CatalogError(
      "INVALID_CONFIG",
      `agentProfileUrl is required — pass the public URL of your UCP agent profile ` +
        `(served as application/json). See ${DOC}.`,
    );
  }
  const lower = agentProfileUrl.toLowerCase();
  if (lower.includes("localhost") || lower.includes("127.0.0.1")) {
    throw new CatalogError(
      "INVALID_CONFIG",
      `agentProfileUrl must be a publicly reachable URL — Shopify fetches it ` +
        `server-side and cannot reach localhost/127.0.0.1. Deploy the profile ` +
        `(or use a tunnel) and use that host. See ${DOC}.`,
    );
  }
}

/**
 * Create a catalog client.
 *
 * **Endpoint precedence** (highest first): explicit `endpoint` > storefront
 * `scope` (via {@link storefrontCatalog}) > the Global Catalog default
 * ({@link ENDPOINTS.globalCatalog}).
 *
 * **Auth**: keyless anonymous by default (no `Authorization` header). Pass
 * `auth: {clientId, clientSecret}` to opt into the higher-rate-limit token tier.
 *
 * Throws `CatalogError` `INVALID_CONFIG` immediately (before any network) if
 * `agentProfileUrl` is missing/empty or points at localhost — see
 * {@link assertUsableAgentProfileUrl}.
 */
export function createCatalogClient(
  options: CreateCatalogClientOptions,
): CatalogClient {
  assertUsableAgentProfileUrl(options.agentProfileUrl);

  const endpoint =
    options.endpoint ??
    (options.scope?.type === "storefront"
      ? storefrontCatalog(options.scope.storeDomain)
      : ENDPOINTS.globalCatalog);

  const auth = createAuth({
    clientId: options.auth?.clientId,
    clientSecret: options.auth?.clientSecret,
    fetch: options.fetch,
  });

  const transport = createTransport({
    endpoint,
    agentProfileUrl: options.agentProfileUrl,
    auth,
    fetch: options.fetch,
    timeoutMs: options.timeoutMs,
    maxRetries: options.maxRetries,
  });

  const deps: ToolDeps = {
    transport,
    fetch: options.fetch,
    imageFetchTimeoutMs: options.timeoutMs,
  };

  return {
    tier: auth.tier,
    searchCatalog: (config, opts) => searchCatalog(deps, config, opts),
    lookupCatalog: (args) => lookupCatalog(deps, args),
    getProduct: (args) => getProduct(deps, args),
  };
}
