/**
 * Pinned Shopify Global Catalog (UCP) URLs and API-version pin.
 *
 * Shopify's usage guidelines flag these endpoint URLs as **subject to change**.
 * This is the ONLY file in the repo allowed to contain a Catalog/token URL —
 * never hardcode one of these anywhere else. If an endpoint moves, change it
 * here and everything downstream follows.
 *
 * Values verified against live probes 2026-07-04 (see docs/probe-findings.md).
 */

export const ENDPOINTS = {
  /** Global Catalog UCP MCP endpoint — JSON-RPC 2.0, MCP binding. */
  globalCatalog: "https://catalog.shopify.com/api/ucp/mcp",
  /** OAuth token exchange (Dev Dashboard client_credentials → JWT, ~60min TTL). */
  token: "https://api.shopify.com/auth/access_token",
} as const;

/**
 * UCP MCP API version, observed live as the
 * `x-shopify-ucp-mcp-api-version` response header. Pinned so the client is
 * explicit about the spec revision it was built against.
 */
export const UCP_SPEC_VERSION = "2026-04-08";

/**
 * Build the single-store (Storefront) UCP MCP endpoint for a shop domain.
 *
 * Accepts either a bare domain (`shop.example.com`) or a full URL
 * (`https://shop.example.com`); a leading scheme and any trailing slash are
 * stripped so the result is always `https://{domain}/api/ucp/mcp`.
 */
export function storefrontCatalog(storeDomain: string): string {
  const domain = storeDomain
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  return `https://${domain}/api/ucp/mcp`;
}
