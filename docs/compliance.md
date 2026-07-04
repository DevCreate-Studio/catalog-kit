# Compliance — how to not get cut off

The Shopify Global Catalog is a live cross-merchant surface, and its
[usage guidelines](https://shopify.dev/docs/api/usage-guidelines) are the contract you
agree to by using it. Violate them and your access gets throttled or revoked. This page
is the practical version: what each rule *actually means* in code, and how the kit already
honors it so you don't have to relitigate it.

None of this is optional. The rules below are enforced (or made easy to follow) throughout
`catalog-kit` — this page tells you where the lines are so your own code stays on the
right side of them.

## No caching of search results

<a id="no-caching"></a>

**The rule:** you may not cache the results of catalog searches. Every search must hit the
live API.

**What that means practically:**

- ❌ No **Redis / Memcached** of result payloads.
- ❌ No **CDN caching** of your search API responses (no `s-maxage`, no edge cache of the
  proxy).
- ❌ No **Next.js ISR / `revalidate`** on routes that return catalog data, and no
  `unstable_cache` / `fetch(..., { next: { revalidate } })` wrapping a catalog call.
- ✅ **Per-request pass-through** — exactly like the kit's proxy: fetch live, return, set
  `Cache-Control: no-store`, keep nothing.
- ✅ **Pagination cursors are fine.** A cursor is an opaque position token, not result
  data. Holding one to fetch the next page is not caching results.

The kit's proxy route
([`apps/web/app/api/catalog/route.ts`](../apps/web/app/api/catalog/route.ts)) is
`export const dynamic = "force-dynamic"` and sets `Cache-Control: no-store` on **every**
response. There is no result cache anywhere in the kit — when you need to smooth over rate
limits, use a **rate-limit-aware queue**, not a cache.

> The one nuance — a **price watcher** ([recipe 5](./recipes.md#5-price-watcher)) storing
> *your own* observed price history (id + number + timestamp) for products you're actively
> watching is your data, not a cache of catalog payloads. The line: store the minimal
> fields you generate; never persist and re-serve the catalog's product objects, media, or
> offers. Draw it conservatively.

## No downloading or re-hosting product images

<a id="images"></a>

**The rule:** do not download product images and re-host them. Render them **hot-linked**
from Shopify's CDN, in real time.

**What that means practically:**

- ✅ Render `<img src="https://cdn.shopify.com/...">` **directly** from the `media[].url`
  the API returns. The playground and demo do exactly this.
- ❌ Don't fetch the image, save it to S3 / R2 / your `public/` folder, and serve your own
  copy.
- ⚠️ **Next.js `<Image>` caveat:** the default `next/image` loader **proxies and caches**
  remote images on your server — which is a form of re-hosting. Either use a plain `<img>`,
  or configure `next/image` with `unoptimized` (or a passthrough loader) for catalog media
  so the browser fetches straight from Shopify's CDN.

**The one sanctioned exception** is image similarity search. The `like` image API requires
**inline base64 bytes** and rejects hosted URLs
([probe findings](./probe-findings.md#like--similarity--multimodal-added-2026-07-04)), so
to search *by* an image the client must fetch it and encode it into the request. The kit
does this transiently: `resolveLikeEntries()`
([`config.ts`](../packages/catalog-client/src/config.ts)) fetches the reference image,
validates it (2xx, `image/*`, ≤2 MB), base64-encodes it into the request payload, and
keeps nothing. This is a **request payload, not storage** — the bytes exist only for the
duration of one search call. That's the whole exception; it does not license caching or
re-hosting anything the API returns.

## Rate limits

<a id="rate-limits"></a>

**The rule:** stay within your tier's rate limit; back off when throttled; don't hammer.

**The tiers** (full detail in [api-reference.md](./api-reference.md#auth-tiers)):

| Tier | How | Rate limit |
|---|---|---|
| **Anonymous (keyless)** | Default, no credentials | **Lowest tier** — and **cannot get increases**. |
| **Token (`client_credentials`)** | `SHOPIFY_CATALOG_CLIENT_ID` / `SECRET` | Higher limits. The only thing the token tier changes. |
| **Signed (RFC 9421)** | Not implemented in the kit | Spec'd, post-v1. |

Keyless is the lowest tier **by design and cannot be raised** — if you're hitting `429`s in
production, credentials are the fix, not retries.

**The client's retry policy** ([`transport.ts`](../packages/catalog-client/src/transport.ts)):
up to **3 retries** (4 attempts total) with **exponential backoff + full jitter** (base
800 ms, doubling per attempt). It retries **both** rate-limit signals — HTTP **429** *and*
the JSON-RPC `{"code":-32600,…,"data":"Rate limit exceeded"}` body that can arrive on an
HTTP 200 — plus 5xx. After retries are exhausted it throws `CatalogError` with code
`RATE_LIMITED`.

**Back off and don't hammer.** No `x-ratelimit-*` or `retry-after` headers are exposed
keyless, so you can't read your remaining budget — you only learn you're throttled by being
throttled. So: keep concurrency small (the [query-variant union](./recipes.md#2-query-variant-union)
fans out to just 2–3), let the client's backoff do its work, and move to the token tier
before you scale. Keep the `x-request-id` from responses for support tickets.

## ML-inferred fields may be missing or fuzzy — code defensively

<a id="ml-fields"></a>

Catalog response fields are **ML-inferred** — titles, descriptions, ratings, categories,
attributes are generated and **drift over time**. A field present today may be absent
tomorrow; a shape may shift.

**Code defensively:**

- The kit's response schemas are deliberately **lenient** — every field is `.optional()`
  and every object `.passthrough()`, so parsing never throws on a missing or unknown field,
  and unknown fields survive
  ([`schemas/responses.ts`](../packages/catalog-client/src/schemas/responses.ts)). That's
  *why* they're lenient — the API is inherently drifty.
- Treat every property as **possibly absent**: `product.title ?? "(untitled)"`,
  `variant.price?.amount ?? 0`. The recipes do this throughout.
- Don't assume presence from an example. Assume the *shape*, not the *guarantee*.

## Endpoint URLs may change

<a id="endpoints"></a>

Shopify's usage guidelines flag the Catalog endpoint URLs as **subject to change.** The kit
gives you a single pin point so a move is a one-line fix:

- **All URLs live only in
  [`endpoints.ts`](../packages/catalog-client/src/endpoints.ts)** — `globalCatalog`,
  `token`, and `storefrontCatalog()`. **Never hardcode a Catalog URL anywhere else.** If an
  endpoint moves, change it there and everything downstream follows.
- **`UCP_SPEC_VERSION` (`"2026-04-08"`)** pins the spec revision the client was built
  against, observed live as the `x-shopify-ucp-mcp-api-version` response header. If Shopify
  bumps it, re-probe (`pnpm probe --json`) and update the pin plus
  [probe-findings.md](./probe-findings.md).

## Usage guidelines — read the source

This page is the practical distillation; the authoritative text is Shopify's own:

- **[Shopify usage guidelines](https://shopify.dev/docs/api/usage-guidelines)** — the
  binding rules.
- **[Universal Commerce Protocol (UCP)](https://ucp.dev)** — the protocol the catalog
  speaks.

When in doubt, the guidelines win over anything here.

## The kit's own compliance choices, summarized

The kit is built to stay compliant so you inherit it for free:

| Choice | Where |
|---|---|
| **Proxy sets `no-store`, route is `force-dynamic`** | [`api/catalog/route.ts`](../apps/web/app/api/catalog/route.ts) |
| **No result cache anywhere** — rate-limit-aware queue instead | whole kit |
| **Images hot-linked from Shopify CDN**, never re-hosted | playground + demo product cards |
| **Transient base64 encode for `like` image search only** — a request payload, not storage | [`config.ts`](../packages/catalog-client/src/config.ts) `resolveLikeEntries()` |
| **All endpoint URLs isolated** in one file | [`endpoints.ts`](../packages/catalog-client/src/endpoints.ts) |
| **Lenient schemas** for drifty ML fields | [`schemas/responses.ts`](../packages/catalog-client/src/schemas/responses.ts) |

Follow the same choices in your own code — hot-link, pass through, never cache — and you
stay on the right side of the line.

---

_Verified against live probes: 2026-07-04._
