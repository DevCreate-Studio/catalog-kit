# API reference

The catalog-kit client wraps the Shopify Global Catalog (UCP) — a JSON-RPC 2.0 endpoint
(`POST https://catalog.shopify.com/api/ucp/mcp`, MCP binding) exposing three tools. This
page documents the auth tiers, the three tools with **real** request/response shapes from
the recorded fixtures, and the error model.

All URLs and the API-version pin live **only** in
[`packages/catalog-client/src/endpoints.ts`](../packages/catalog-client/src/endpoints.ts)
(`UCP_SPEC_VERSION = "2026-04-08"`). Shopify flags these endpoints as subject to change —
see the [endpoint-change warning](#endpoint-change) at the bottom.

## Auth tiers

<a id="auth-tiers"></a>

The client speaks a tier ladder. Two tiers are implemented; a third is spec'd but not yet
built.

### Anonymous (default)

No credentials, no `Authorization` header. **Keyless works out of the box** — it's the
default and needs zero setup. Everything works: all three tools, the full search surface,
identical response shapes. The only difference is the **rate limit**, which is the
**lowest tier** — and **keyless cannot get rate-limit increases**. If you're hitting
`429`s in production, move to the token tier.

```ts
const client = createCatalogClient({ agentProfileUrl });
client.tier; // "anonymous"
```

### Token (`client_credentials`)

Opt-in via `SHOPIFY_CATALOG_CLIENT_ID` / `SHOPIFY_CATALOG_CLIENT_SECRET` (Dev Dashboard →
Catalog). Raises your rate limit; nothing else changes.

The client exchanges the credentials for a short-lived JWT (~60-minute TTL) via the
`client_credentials` grant. Per the Checkout MCP docs shape, the raw exchange is:

```bash
curl -X POST https://api.shopify.com/auth/access_token \
  -H "content-type: application/json" \
  -d '{
    "client_id": "your-client-id",
    "client_secret": "your-client-secret",
    "grant_type": "client_credentials"
  }'
# → { "access_token": "…", "expires_in": 3600, "scope": "…" }
```

You don't call this yourself — `createAuth()`
([`auth.ts`](../packages/catalog-client/src/auth.ts)) handles it. Its behavior:

- **Automatic caching** — the JWT is cached and reused across requests (the proxy keeps a
  module-level client singleton so the cache persists).
- **Early refresh** — refreshed **5 minutes** before expiry (`REFRESH_EARLY_MS`), so a
  request never races a just-expired token.
- **Refresh de-dup** — concurrent requests that trigger a refresh all await the **same**
  in-flight exchange rather than each firing their own.
- Failures throw `CatalogError` with code `AUTH_FAILED`.

```ts
const client = createCatalogClient({
  agentProfileUrl,
  auth: { clientId, clientSecret },
});
client.tier; // "token"
```

### Signed (RFC 9421) — not implemented

The UCP spec defines a signed request tier using
[HTTP Message Signatures (RFC 9421)](https://www.rfc-editor.org/rfc/rfc9421). **Status:
not implemented in the kit.** The client supports anonymous and token only; signed-tier
auth is post-v1 backlog. See the [UCP specification](https://ucp.dev) for the wire
format.

## The three tools

Every request is a JSON-RPC `tools/call` with the tool arguments under
`params.arguments.catalog` and the agent profile under
`params.arguments.meta['ucp-agent'].profile` — both required. The client builds this
envelope; you call the typed methods below.

> `tools/list` returns **HTTP 422 keyless** and is unusable. Call the three tools directly
> by name — they are the whole usable surface.

### `search_catalog`

**Purpose:** the primary tool — text, image, more-like-this, and multimodal search over
the cross-merchant catalog, with filters, context, and cursor pagination.

**Request arguments** — built from a `CatalogConfig` (see
[configuration.md](./configuration.md) for every field). The wire `arguments.catalog`:

```json
{
  "query": "wireless headphones",
  "filters": { "available": true, "price": { "max": 15000 } },
  "pagination": { "limit": 5 }
}
```

**Response shape** (real, trimmed — from `fixtures/search-basic.json`):

```json
{
  "ucp": { "version": "2026-04-08", "status": "success", "…": "…" },
  "products": [
    {
      "id": "gid://shopify/p/2jH1G1bSch4rBP21t4dUYw",
      "title": "E7 Active Noise Cancelling Headphones … Green",
      "description": { "plain": "Wireless over-ear headphones with advanced noise cancellation …" },
      "rating": { "value": 4.9, "scale_min": 1, "scale_max": 5, "count": 115 },
      "media": [{ "type": "image", "url": "https://cdn.shopify.com/s/files/…", "alt_text": "…" }],
      "variants": [
        {
          "id": "gid://shopify/ProductVariant/48748652429588",
          "price": { "amount": 6999, "currency": "USD" },
          "availability": { "available": true },
          "seller": { "id": "gid://shopify/Shop/77114245396", "name": "kibhousdirect", "url": "https://www.kibhousdirect.com", "domain": "795cb8.myshopify.com" },
          "checkout_url": "https://www.kibhousdirect.com/cart/48748652429588:1?_gsid=…",
          "condition": ["new"]
        }
      ]
    }
  ],
  "messages": [],
  "pagination": { "has_next_page": true, "total_count": 422, "cursor": "eyJvZmZzZXQiOjUs…" }
}
```

**Client method:**

```ts
searchCatalog(config: CatalogConfig, opts?: { cursor?: string }): Promise<SearchResult>;
```

**Cursor pagination:**

```ts
const first = await client.searchCatalog(config);
if (first.pagination?.has_next_page && first.pagination.cursor) {
  const next = await client.searchCatalog(config, { cursor: first.pagination.cursor });
}
```

`total_count` (`422` above) is an **estimate**. The `cursor` is an opaque base64 blob —
pass it back verbatim, don't decode it.

### `lookup_catalog`

**Purpose:** resolve a known set of ids to full products in one call — for price watching,
re-fetching saved items, etc.

**Request arguments:** `{ "ids": [ … ] }`. Accepted id types:

- **UPID product GIDs** — `gid://shopify/p/2jH1G1bSch4rBP21t4dUYw`
- **variant GIDs** — `gid://shopify/ProductVariant/48748652429588`
- **product URLs** — a storefront product URL

**Between 1 and 50 ids.** The client enforces the `1..50` bound client-side and throws
`CatalogError` `INVALID_CONFIG` before any network call.

**Response shape** (real, trimmed — from `fixtures/lookup.json`) — same product shape as
search, but **no pagination**:

```json
{
  "ucp": { "version": "2026-04-08", "status": "success", "…": "…" },
  "products": [
    {
      "id": "gid://shopify/p/2jH1G1bSch4rBP21t4dUYw",
      "title": "E7 Active Noise Cancelling Headphones … Green",
      "rating": { "value": 4.9, "scale_min": 1, "scale_max": 5, "count": 115 },
      "variants": [{ "id": "gid://shopify/ProductVariant/48748652429588", "price": { "amount": 6999, "currency": "USD" } }]
    }
  ],
  "messages": []
}
```

**Client method:**

```ts
lookupCatalog(args: { ids: string[] }): Promise<LookupResult>;
```

### `get_product`

**Purpose:** fetch one product with variant selection and buyer preferences applied.

**Request arguments:** `{ id, selected?, preferences? }`. `selected` and `preferences`
pass through **verbatim**; absent keys are omitted from the wire payload.

- **`id`** — a product GID (`gid://shopify/p/…`).
- **`selected`** — selected variant options. **Relaxation semantics:** the API resolves
  the closest match — it starts from your exact selection and progressively **relaxes** the
  least-constraining option until a valid variant is found, rather than returning nothing
  on an over-constrained selection. The response echoes the resolved options in
  `product.selected` (an array; `[]` when nothing was constrained).
- **`preferences`** — buyer preferences (currency, locale, …), forwarded untouched.

**Response shape** (real, trimmed — from `fixtures/get-product.json`) — singular
`product`, not `products`:

```json
{
  "ucp": { "version": "2026-04-08", "status": "success", "…": "…" },
  "product": {
    "id": "gid://shopify/p/2jH1G1bSch4rBP21t4dUYw",
    "title": "E7 Active Noise Cancelling Headphones … Green",
    "rating": { "value": 4.9, "scale_min": 1, "scale_max": 5, "count": 115 },
    "media": [{ "type": "image", "url": "https://cdn.shopify.com/s/files/…" }],
    "variants": [
      {
        "id": "gid://shopify/ProductVariant/48748652429588",
        "price": { "amount": 6999, "currency": "USD" },
        "availability": { "available": true },
        "checkout_url": "https://www.kibhousdirect.com/cart/48748652429588:1?_gsid=…"
      }
    ],
    "price_range": { "min": { "amount": 6999, "currency": "USD" }, "max": { "amount": 6999, "currency": "USD" } },
    "selected": []
  }
}
```

**Client method:**

```ts
getProduct(args: { id: string; selected?: unknown; preferences?: unknown }): Promise<GetProductResult>;
```

## Errors

The Catalog API surfaces failures in **two distinct wire shapes**, and the client checks
both.

### 1. Transport / discovery error — top-level JSON-RPC `error`, HTTP 422

Real example, from `fixtures/tools-list.json`:

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "error": {
    "code": -32001,
    "message": "UCP discovery failed",
    "data": {
      "code": "invalid_profile_url",
      "content": "Unable to fetch agent profile: Missing profile uri"
    }
  }
}
```

Also seen: `profile_malformed` / `"Invalid content type"` when the profile URL serves a
non-JSON content type (a gist raw URL does this — see
[getting-started.md](./getting-started.md#agent-profile)).

### 2. Tool-argument error — HTTP 200 with `result.isError`

Real example, from `fixtures/error-invalid-filter.json`:

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "content": [
      { "type": "text", "text": "Invalid arguments: value at `/catalog/filters/categories/0` is not a string" }
    ],
    "isError": true
  }
}
```

Note this is an **HTTP 200** — you must inspect `result.isError`, not just the status code.
The client does; both shapes normalize into a single `CatalogError`.

### `CatalogError` codes

Every client operation throws a normalized
[`CatalogError`](../packages/catalog-client/src/errors.ts) carrying a stable `code`, the
originating `httpStatus`, and — when relevant — the raw `jsonrpcError` and any
`messages[]`.

| Code | When it fires | Recommended handling |
|---|---|---|
| `INVALID_CONFIG` | Client-side validation fails (bad `CatalogConfig`, `lookup` id count outside 1–50). Thrown **before** any network call; `messages` carries the zod issues. | Fix the config. Surface the zod issues to the user/developer. |
| `LIKE_IMAGE_FETCH_FAILED` | An `image_url` reference image can't be fetched, isn't an image content-type, or exceeds the 2 MB cap. | Check the URL is reachable, is an image, and is under 2 MB. |
| `AUTH_FAILED` | Token exchange failed (bad credentials, non-2xx, or no `access_token` in the response). | Verify `SHOPIFY_CATALOG_CLIENT_ID`/`SECRET`. Fall back to keyless if needed. |
| `RATE_LIMITED` | HTTP 429, or a JSON-RPC rate-limit body, after retries are exhausted. | Back off; move to the token tier for higher limits. |
| `TOOL_ERROR` | The API rejected the arguments — either a JSON-RPC `error` (non-rate-limit) or an HTTP 200 `result.isError`. | Read `err.message`/`err.messages`; usually a bad filter shape (e.g. `categories` object form). |
| `TRANSPORT_ERROR` | Network failure, non-JSON response, or unclassified non-2xx / 5xx after retries. | Retry later; check connectivity and the endpoint. |
| `TIMEOUT` | The request exceeded the per-request timeout (default 12s). | Retry; raise `timeoutMs` if legitimately slow. |

### Checking errors — use `isCatalogError` + `code`, not `instanceof`

catalog-kit ships a **dual ESM/CJS** build, so two distinct `CatalogError` class objects
can coexist in one process (one dependency loads ESM, another CJS). In that case
`instanceof CatalogError` can be **false** for an error this package threw. Use the
brand-based structural check plus the `code` field:

```ts
import { CatalogError } from "catalog-kit";

try {
  await client.searchCatalog(config);
} catch (err) {
  if (CatalogError.isCatalogError(err) && err.code === "RATE_LIMITED") {
    // back off and retry, or upgrade to the token tier
  } else {
    throw err;
  }
}
```

`isCatalogError` checks a `Symbol.for("catalog-kit.CatalogError")` brand from the global
registry, so it holds across module/build boundaries where `instanceof` doesn't.

## Rate limits

Observed behavior, keyless (see [probe-findings.md](./probe-findings.md)):

- **No rate-limit headers keyless.** No `x-ratelimit-*`, `ratelimit-*`, or `retry-after`
  on 2xx responses. The only Shopify-specific headers are
  `x-shopify-ucp-mcp-api-version`, `shopify-complexity-score`, and `x-request-id` (keep
  the request id for support tickets). Rate limiting is only observable when you're
  actually throttled.
- **Throttling has two signals**, both retried by the transport: HTTP **429**, and a
  JSON-RPC `{"code":-32600,"message":"Invalid Request","data":"Rate limit exceeded"}`
  body on an HTTP 200. (The `-32600` code alone is generic "Invalid Request" — the client
  keys on the `"rate limit"` text, not the code.)
- **Transport retry policy:** up to **3 retries** (4 attempts total) with **exponential
  backoff + full jitter** (base 800 ms, doubling per attempt). 5xx is retried too.
  Configurable via `maxRetries` on `createCatalogClient()`.

**Compliance:** the kit **never caches search results** (a Shopify usage-guideline
requirement). The proxy route is `force-dynamic` and sets `Cache-Control: no-store` on
every response. Do not add a results cache — use a rate-limit-aware queue instead.

## The `messages[]` contract

<a id="messages"></a>

Successful responses can carry a `messages[]` array reporting things the API **accepted
but adjusted** — it is **not** an error channel. Two things surface here:

- **Ignored filters** — a filter the API chose not to apply.
- **Unsupported attribute names** — an `attributes` entry whose `name` isn't one of
  `Color`, `Size`, `Target gender`. The attribute is **ignored** (not rejected) and
  reported:

```json
{
  "type": "info",
  "code": "not_found",
  "path": "$.filters.attributes[0]",
  "content": "Attribute \"…\" is not supported and was ignored. Supported attributes: Color, Size, Target gender."
}
```

Always surface `result.messages` to your user/UI — a "no results" run with a `messages[]`
entry usually means a filter was silently dropped, not that the catalog is empty.

> **`path` format differs by source.** API `messages[]` entries use a string JSON-pointer
> (`"$.filters.attributes[0]"`). An `INVALID_CONFIG` error's `messages` instead carries raw
> zod issues, where `path` is an **array** of segments. Handle both if you inspect `path`.

## ML-inferred fields caveat

Response fields are **ML-inferred and drift over time.** That's why the client's response
schemas are deliberately lenient — **every field is `.optional()` and every object
`.passthrough()`**, so parsing never throws on a missing or unknown field and unknown keys
survive. Treat every response property as **possibly absent** (`product.title ?? "…"`),
and don't assume a field's presence from these examples — assume the shape, not the
guarantee.

## Endpoint-change warning

<a id="endpoint-change"></a>

Shopify's usage guidelines flag the Catalog endpoint URLs as **subject to change.** The
kit isolates that risk:

- **All URLs live only in
  [`endpoints.ts`](../packages/catalog-client/src/endpoints.ts)** — `globalCatalog`,
  `token`, and `storefrontCatalog()`. Never hardcode a Catalog URL anywhere else. If an
  endpoint moves, change it there and everything downstream follows.
- **`UCP_SPEC_VERSION` (`"2026-04-08"`)** pins the spec revision the client was built
  against, observed live as the `x-shopify-ucp-mcp-api-version` response header. If Shopify
  bumps the API version, re-probe (`pnpm probe --json`) and update the pin plus
  [probe-findings.md](./probe-findings.md).

---

_Verified against live probes: 2026-07-04._
