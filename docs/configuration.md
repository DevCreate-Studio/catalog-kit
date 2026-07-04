# Configuration

The whole kit runs on one JSON object: the **`CatalogConfig`**. The configurator emits
it; the playground, demo, exported snippet, and
[`buildSearchArguments()`](../packages/catalog-client/src/config.ts) all consume it. This
page documents every field, with a **real** payload for each and the gotchas that only
show up against the live API.

Every shape here is verified against live probes ([probe-findings.md](./probe-findings.md))
and matches the zod contract in
[`packages/catalog-client/src/schemas/requests.ts`](../packages/catalog-client/src/schemas/requests.ts).

## Capability coverage matrix

Every capability of the current Catalog API surface is bundled — toggleable in the
configurator, exercisable in the playground, and documented here.

| Capability | Config field | Where to try it |
|---|---|---|
| Text search | `query` | Configurator search mode: Text → Playground Search tool |
| Image search | `like: [{ image_url }]` / `[{ image }]` | Search mode: Image → dupe-finder preset |
| More-like-this | `like: [{ id }]` | Search mode: More like this → "Similar" on demo cards |
| Multimodal | `query` + `like` | Search mode: Text + Image → recipes |
| Buyer context incl. intent | `context` | Context block → gift-finder preset |
| All 10 filters | `filters.*` | One toggle each → across presets |
| Pagination (cursor + limit) | `pagination.limit` + cursor | Limit slider / Load more → demo load-more |
| Offer view | `view: "offer"` | Toggle → comparison-shopper preset |
| Saved catalog | `scope.savedCatalogSlug` | Input → documented below |
| Lookup (≤50 ids) | — (`lookupCatalog({ ids })`) | Playground Lookup tab → price-watcher recipe |
| Product + selected/preferences | — (`getProduct({ id, selected, preferences })`) | Product inspector → demo product detail |

**Documented but not built** (each marked with status): `placements: ["affiliate"]`
(invite-only preview), shop sign-in personalization (not yet released), signed-tier
RFC 9421 auth (see [api-reference.md](./api-reference.md#auth-tiers)).

## Validated behavior

These are the live-verified facts the whole contract is built on. Do not relitigate them
without re-probing (`pnpm probe --json`).

| Behavior | What actually happens |
|---|---|
| **Prices are minor units** | `{"amount":2500,"currency":"USD"}` = $25.00. Applies to `filters.price` (integer minor units) and all response prices. |
| **`pagination.limit` clamps at 50** | `limit:51` → HTTP 200, 50 products, **silently** — no error, no message. The client's schema caps it at 50 client-side. |
| **Cursor pagination** | Response `pagination` is `{has_next_page, total_count, cursor}`. The `cursor` is an opaque base64 blob; pass it back to page forward. |
| **`total_count` is an estimate** | Treat it as approximate, not a guaranteed count. |
| **`categories` are string GIDs only** | `["gid://shopify/TaxonomyCategory/…"]`. The object `{id}` form is a **hard tool error** now (was previously a silent 0 results). |
| **Filters require a query or like** | Filters *refine* a search; they can't *be* one. Filters with no `query`/`like` → tool error `"A query is required"`. |
| **`rating` shape** | Request: `{variant:{min, min_count}}`. Response product rating: `{value, scale_min, scale_max, count}`. |
| **`ships_to` / `ships_from` shapes** | `ships_to` is an **object** `{country:"US"}`; `ships_from` is an **array** `[{country:"CA"}]`. |
| **Supported attribute names** | Exactly **`Color`, `Size`, `Target gender`**. Others are **ignored** (not an error) and reported in `messages[]`. |
| **`like` entry shapes** | Always an array; each element is `{id}` **XOR** `{image:{content_type, data}}` (base64). Bare strings and public URLs are rejected. |
| **`image_url` kit convenience** | The kit resolves a config `{image_url}` → `{image:{content_type,data}}` at request time (fetch → base64, ≤2 MB cap). Sanctioned exception to the no-image-download rule. |
| **Multimodal** | `query` + `like` works with either `like` shape; neither input is silently dropped. |
| **Nonsense-query fallback** | A nonsense text query returns ~5 fuzzy fallbacks, **never empty**. To test a true empty state use an impossible **filter** (e.g. `price.max:1`). |
| **Two error shapes** | (1) transport/discovery — top-level JSON-RPC `error` at HTTP **422**; (2) tool-argument — HTTP **200** with `result.isError === true`. The client checks both. |
| **Rate limiting** | Surfaces as HTTP **429** *and* as a JSON-RPC `{"code":-32600,…,"data":"Rate limit exceeded"}` body on an HTTP 200. No `x-ratelimit-*` headers keyless; `x-request-id` is useful for support. |

Full detail, including every rejected `like` shape and its error text, is in
[probe-findings.md](./probe-findings.md).

## Fields

### `version` / `scope` / `name`

```json
{ "version": 1, "name": "gift-finder", "scope": { "type": "global" } }
```

- **`version`** — always `1`. Pins the config contract revision.
- **`name`** — optional label for your own bookkeeping (used by the configurator/demo).
- **`scope`** — a discriminated union:
  - `{ "type": "global" }` — the cross-merchant Global Catalog (default).
  - `{ "type": "global", "savedCatalogSlug": "curated-2026" }` — scope to a saved
    catalog. On the wire this is hoisted to a top-level `saved_catalog_slug`
    (see mapping below). **Precedence:** the slug only applies when `scope.type` is
    `"global"`; it is omitted for storefront scope.
  - `{ "type": "storefront", "storeDomain": "shop.example.com" }` — a single shop's
    catalog. Supported by the client via an **endpoint swap** (`storefrontCatalog()`
    builds `https://{domain}/api/ucp/mcp`). The client's endpoint is fixed at
    construction, so pass storefront scope (or an explicit `endpoint`) at
    `createCatalogClient()` time.

> `scope`, `version`, and `name` are **kit-only** — `buildSearchArguments()` never leaks
> them into the wire payload.

### `query`

Free-text search. Optional on its own, but a config must include **at least one** of
`query` or `like`.

```json
{ "query": "wireless headphones" }
```

**Gotcha:** a nonsense query (`"xzqvwkjhgfdsa"`) returns ~5 fuzzy fallbacks, not zero.
Filters, not bad queries, produce genuinely empty results.

### `like` — similarity & multimodal

Always an **array**, `min` length 1. Each element is one of three entry shapes (the first
two are the wire shapes; the third is a kit convenience):

**1. Item ref** — "more like this":

```json
{ "like": [{ "id": "gid://shopify/p/2jH1G1bSch4rBP21t4dUYw" }] }
```

The seed product is excluded from its own results. No similarity score is exposed.

**2. Inline base64 image** — the wire shape for image search:

```json
{ "like": [{ "image": { "content_type": "image/jpeg", "data": "<base64-bytes>" } }] }
```

**3. `image_url` (kit convenience)** — you give a URL; the client fetches it, validates
(2xx, image content-type, ≤2 MB), base64-encodes it, and swaps it to shape #2 at request
time. This is the sanctioned exception to the no-image-download rule.

```json
{ "like": [{ "image_url": "https://cdn.shopify.com/s/files/1/1726/0467/files/921fa5a3-16fb-49ab-a25b-417df1178ca5.jpg" }] }
```

**Gotchas:** bare strings (`"gid://…"`), non-array objects, and **public image URLs on
the wire** are all rejected by the API — the API only accepts inline bytes, which is why
`image_url` is resolved client-side. `query` + `like` may coexist for multimodal search.

### `context`

Buyer context that steers ranking. All fields optional.

```json
{
  "context": {
    "intent": "Find a thoughtful, well-reviewed gift for someone who loves coffee, under $50.",
    "address_country": "US",
    "address_region": "CA",
    "postal_code": "94103",
    "language": "en",
    "currency": "USD"
  }
}
```

- **`intent`** — a natural-language description of what the shopper wants. This is the
  single most impactful context field.
  - **Good:** `"Find a thoughtful, well-reviewed gift for someone who loves coffee, under $50."`
    — a full sentence describing the goal.
  - **Bad:** `"gift"` — a bare keyword duplicates `query` and adds no steering signal.
- **`address_country`** — ISO-2 country code (exactly 2 chars).
- **`address_region`** / **`postal_code`** — buyer location refinement.
- **`language`** — locale hint.
- **`currency`** — ISO-3 currency code (exactly 3 chars).

### Filters

All under `filters`, all optional — but remember filters **require** a `query` or `like`
alongside them (they refine, they don't search).

**`available`** — in-stock only.

```json
{ "filters": { "available": true } }
```

**`price`** — integer **minor units** (`5000` = $50.00). `min` and/or `max`.

```json
{ "filters": { "price": { "max": 5000 } } }
```

**`condition`** — array of `"new"` / `"secondhand"`.

```json
{ "filters": { "condition": ["new", "secondhand"] } }
```

**`ships_to`** — an **object** with an ISO-2 `country`, optional `region`/`postal_code`.

```json
{ "filters": { "ships_to": { "country": "US" } } }
```

**`ships_from`** — an **array** of `{country}` objects (note the shape asymmetry with
`ships_to`).

```json
{ "filters": { "ships_from": [{ "country": "CA" }] } }
```

**`shop_ids`** — array of shop GIDs to restrict to (max 1000).

```json
{ "filters": { "shop_ids": ["gid://shopify/Shop/77114245396"] } }
```

**`attributes`** — array of `{name, values}`. **Only `Color`, `Size`, `Target gender`
are supported.**

```json
{ "filters": { "attributes": [{ "name": "Color", "values": ["Green", "Black"] }] } }
```

**Gotcha:** an unsupported attribute name is **ignored, not rejected**, and surfaces in
`messages[]` (see the messages contract in
[api-reference.md](./api-reference.md#messages)):

```json
{
  "type": "info",
  "code": "not_found",
  "path": "$.filters.attributes[0]",
  "content": "Attribute \"…\" is not supported and was ignored. Supported attributes: Color, Size, Target gender."
}
```

**In the configurator:** for the three supported names the value field is a
multi-select fed by the canonical value lists Shopify publishes in the Standard
Product Taxonomy (Color, Size, and Target gender values), with a free-text escape
hatch for custom values (the API tolerates unknown values). Those lists are
generated into `apps/web/lib/attribute-values.json` from the pinned taxonomy
version (see [`categories`](#categories--the-taxonomy-picker) below) by
`pnpm taxonomy` — bump the pin and re-run to refresh them.

**`rating`** — variant-level rating gate. Shape `{variant:{min, min_count}}`.

```json
{ "filters": { "rating": { "variant": { "min": 4 } } } }
```

**`price_tier`** — array of `"low"` / `"medium"` / `"high"`.

```json
{ "filters": { "price_tier": ["low", "medium"] } }
```

<h4 id="categories--the-taxonomy-picker"><code>categories</code> — the taxonomy picker</h4>

**`categories`** — array of **string GIDs only**.

```json
{ "filters": { "categories": ["gid://shopify/TaxonomyCategory/hg-1"] } }
```

**In the configurator:** the categories filter is a searchable + browsable
picker over Shopify's Standard Product Taxonomy. Type to search across category
names and breadcrumb paths, or browse the top-level verticals and drill into any
level (every level is selectable). Selecting a category adds its string GID to the
array and shows a friendly breadcrumb chip; a "paste a GID manually" affordance
stays for entering GIDs directly (unknown-but-valid GIDs render as raw removable
chips). The config still stores plain string GIDs — the picker is pure UI sugar.

Remember filters **pair with a query**: a search with `categories` but no
`query`/`like` errors with "A query is required".

The picker data is pinned to a specific taxonomy release for reproducibility
(currently **`v2026-05`**, Shopify Standard Product Taxonomy). It is generated by
`scripts/build-taxonomy.mjs` into `apps/web/public/taxonomy.json` (lazy-loaded on
first open, never in the initial bundle) plus `apps/web/lib/taxonomy-meta.json`.
To adopt a newer taxonomy version, bump `TAXONOMY_TAG` in that script and run
`pnpm taxonomy` (both files are committed; `node scripts/build-taxonomy.mjs --check`
guards against drift in CI). Source:
[github.com/Shopify/product-taxonomy](https://github.com/Shopify/product-taxonomy).

**Gotcha:** the object `{id}` form is a **hard tool error** now:
`Invalid arguments: value at \`/catalog/filters/categories/0\` is not a string`. The
client's schema enforces the `gid://shopify/TaxonomyCategory/` prefix and throws
`INVALID_CONFIG` before any network call.

### `pagination`

```json
{ "pagination": { "limit": 12 } }
```

- **`limit`** — 1–50. The API **silently clamps** anything over 50; the client's schema
  caps it at 50 so you find out at build time instead.

**Cursor flow.** To page forward, read the response `pagination.cursor` and pass it back:

```ts
const first = await client.searchCatalog(config);
// first.pagination → { has_next_page: true, total_count: 422, cursor: "eyJvZmZzZXQiOjUs…" }

if (first.pagination?.has_next_page && first.pagination.cursor) {
  const next = await client.searchCatalog(config, { cursor: first.pagination.cursor });
}
```

`buildSearchArguments(config, { cursor })` merges the cursor into `pagination` for you.
`total_count` is an estimate — don't build exact "page N of M" UI on it.

### `view: "offer"`

Request offer-shaped results (seller, checkout URL, per-variant price/availability).

```json
{ "view": "offer" }
```

The comparison-shopper preset uses this. Offer fields on a returned variant look like:

```json
{
  "id": "gid://shopify/ProductVariant/48748652429588",
  "price": { "amount": 6999, "currency": "USD" },
  "availability": { "available": true },
  "seller": {
    "id": "gid://shopify/Shop/77114245396",
    "name": "kibhousdirect",
    "url": "https://www.kibhousdirect.com",
    "domain": "795cb8.myshopify.com"
  },
  "checkout_url": "https://www.kibhousdirect.com/cart/48748652429588:1?_gsid=…"
}
```

## CatalogConfig ↔ wire mapping

`buildSearchArguments()` turns a `CatalogConfig` into the exact object that goes under
`params.arguments.catalog` on the wire. It:

- **drops** the kit-only keys `version`, `name`, `scope`;
- **hoists** `scope.savedCatalogSlug` → top-level `saved_catalog_slug`;
- **merges** a `{ cursor }` into `pagination`;
- **omits** every absent key entirely (no `undefined` survives — the output round-trips
  through JSON cleanly).

Everything else (`query`, `like`, `context`, `filters`, `view`) passes through unchanged.

**Before — the `CatalogConfig`** (from
[`config.test.ts`](../packages/catalog-client/test/config.test.ts)):

```json
{
  "version": 1,
  "name": "gift-finder",
  "scope": { "type": "global" },
  "query": "cozy gift under 25",
  "context": { "intent": "gift" },
  "filters": {
    "available": true,
    "price": { "max": 2500 },
    "rating": { "variant": { "min": 4 } }
  },
  "pagination": { "limit": 12 }
}
```

**After — the wire `arguments.catalog`** (the exact `toEqual` expectation the test
asserts):

```json
{
  "query": "cozy gift under 25",
  "context": { "intent": "gift" },
  "filters": {
    "available": true,
    "price": { "max": 2500 },
    "rating": { "variant": { "min": 4 } }
  },
  "pagination": { "limit": 12 }
}
```

Note `version`, `name`, and `scope` are gone. (With `scope.savedCatalogSlug` set, a
top-level `"saved_catalog_slug"` would appear here; with `{ cursor }` passed,
`pagination` would gain a `"cursor"` key.)

## JSON Schema

A generated JSON Schema for the full contract lives at
[`packages/catalog-client/schema/catalog-config.schema.json`](../packages/catalog-client/schema/catalog-config.schema.json).
It is regenerated from the zod schema on `pnpm build`. Point your editor (or an agent) at
it for autocomplete and validation before you ever hit the network.

---

_Verified against live probes: 2026-07-04._
