# Shopify Global Catalog (UCP) — live probe findings

**Endpoint:** `POST https://catalog.shopify.com/api/ucp/mcp` (JSON-RPC 2.0, MCP binding)
**Auth tier probed:** Anonymous / keyless (no `Authorization` header)
**Profile used:** `https://shopify.dev/ucp/agent-profiles/2026-04-08/valid-with-capabilities.json`
**Verified live: 2026-07-04**

Reproduce with: `AGENT_PROFILE_URL=<url> node scripts/probe.mjs` (add `--json` for the machine report).

---

## Request envelope (the thing that actually works)

Every request is a JSON-RPC `tools/call`. The agent profile URL is injected into
**`params.arguments.meta['ucp-agent'].profile`**, and the tool payload goes under
**`params.arguments.catalog`**:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "id": 1,
  "params": {
    "name": "search_catalog",
    "arguments": {
      "meta": { "ucp-agent": { "profile": "https://…/agent-profile.json" } },
      "catalog": { "query": "wireless headphones", "pagination": { "limit": 5 } }
    }
  }
}
```

This matches the Vinyl reference client (`app/lib/server/ucp.ts`) exactly. The
`catalog` wrapper is required — the tool arguments are **not** placed directly
under `arguments`.

---

## Verified facts

| # | Fact (prior expectation) | Result | Observed value |
|---|---|---|---|
| 1 | Prices in minor units | **CONFIRMED** | `price: {"amount":2500,"currency":"USD"}` — 2500 = $25.00 |
| 2 | `pagination.limit` caps at 50 | **CONFIRMED** | `limit:51` → HTTP 200, `products.length == 50` (silently clamped, no error, no message) |
| 3 | Cursor pagination `{has_next_page, cursor, total_count}` | **CONFIRMED** | `pagination: {"has_next_page":true,"total_count":379,"cursor":"eyJvZmZzZXQiOjUx…"}` — cursor is base64 `{offset,total_count,returned}` |
| 4 | `total_count` is an estimate | **CONFIRMED (consistent with)** | 379 returned for a broad "headphones" query; treat as estimate per docs |
| 5 | categories match as **string GID** `"gid://shopify/TaxonomyCategory/…"` | **CONFIRMED** | string form → HTTP 200, results returned, no message |
| 6 | categories documented **object `{id}`** form | **CHANGED** | Previously returned 0 results silently. **Now a hard tool error**: `{"content":[{"type":"text","text":"Invalid arguments: value at \`/catalog/filters/categories/0\` is not a string"}],"isError":true}`. So the object form is now rejected outright, not ignored. Use string GIDs only. |
| 7 | `filters.rating` shape `{variant:{min,min_count}}` | **CONFIRMED** | Accepted, HTTP 200, no ignored-filter message. Product ratings returned as `rating: {value, scale_min, scale_max, count}` |
| 8 | `filters.ships_to` is an object `{country:"US"}` | **CONFIRMED** | Accepted, no message |
| 9 | `filters.ships_from` is an array `[{country:"CA"}]` | **CONFIRMED** | Accepted, no message |
| 10 | `messages[]` reports ignored/unsupported filters | **CONFIRMED** | Unsupported attribute name → `messages: [{"type":"info","code":"not_found","path":"$.filters.attributes[0]","content":"Attribute \"…\" is not supported and was ignored. Supported attributes: Color, Size, Target gender."}]`. Note the **supported attribute names are Color, Size, Target gender** (surfaced by the error). |
| 11 | Empty-results behavior | **NEW FINDING** | A nonsense text query alone (e.g. `"xzqvwkjhgfdsa"`) does **not** return zero — the catalog returns ~5 fuzzy fallback matches. A genuinely empty result (`products:[], total_count:0`) requires an impossible **filter** (e.g. `price.max:1`). The `search-empty.json` fixture uses the nonsense query + `price.max:1`. |

---

## Tool results (keyless)

| Tool | HTTP | Latency (observed) | Result keys | Notes |
|---|---|---|---|---|
| `search_catalog` | 200 | ~410–500 ms | `ucp, products, messages, pagination` | 5 products for `wireless headphones` + `available:true` + `price.max:15000` |
| `lookup_catalog` | 200 | ~500 ms | `ucp, products, messages` | Takes `{ids:[…]}`; 1 id → 1 product |
| `get_product` | 200 | ~400 ms | `ucp, product` | Singular `product` key (not `products`). Accepts `{id, selected?}` |
| `tools/list` | **422** | — | — | **Does not work keyless via any profile placement tried** (params.meta, arguments.meta, params.profile, header). Returns `-32001 "UCP discovery failed" / "Missing profile uri"`. Tools are exercised directly by name; the three catalog tools above are the usable surface. |

Overall latency range across all calls: **~400–510 ms**.

---

## Error shapes (two distinct kinds)

1. **Transport / discovery error** — top-level JSON-RPC `error`, HTTP 422:
   ```json
   {"jsonrpc":"2.0","id":1,"error":{"code":-32001,"message":"UCP discovery failed",
     "data":{"code":"invalid_profile_url","content":"Unable to fetch agent profile: Missing profile uri"}}}
   ```
   Also seen: `profile_malformed` / `"Invalid content type"` when the profile URL
   serves a non-JSON content type (see hosting note below).

2. **Tool-argument error** — HTTP 200, but `result.isError === true` and no
   `structuredContent`:
   ```json
   {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text",
     "text":"Invalid arguments: value at `/catalog/filters/categories/0` is not a string"}],
     "isError":true}}
   ```
   The client must check `result.isError` in addition to top-level `error`.

---

## Rate-limit headers

**None exposed keyless.** No `x-ratelimit-*`, `ratelimit-*`, or `retry-after`
headers on any 2xx response. The only Shopify-specific headers observed:

- `x-shopify-ucp-mcp-api-version: 2026-04-08`
- `shopify-complexity-score: 0`
- `x-request-id: <uuid-epoch>` (useful for support tickets)

Rate limiting is therefore only observable via a `429` when actually throttled.
Consistent with docs: keyless is the lowest tier and cannot get increases.

---

## Profile hosting caveat (verified this session)

Shopify's fetcher requires the profile be served with `Content-Type:
application/json`. A **GitHub gist raw URL serves `text/plain`** and is rejected
with `profile_malformed / "Invalid content type"` (tested against
`gist.githubusercontent.com/.../raw/agent-profile.json`, 2026-07-04). Shopify's
own sample profile at `shopify.dev` is served as `application/json` and works.
Host your profile somewhere that sets the JSON content type (your own deploy —
`apps/web` serves `/agent-profile.json` — a CDN, or an object store).

---

## Token tier

**Not probed** — no Shopify Dev Dashboard `client_credentials` available in this
environment. Token exchange (`POST https://api.shopify.com/auth/access_token`)
and the higher rate limits it unlocks remain unverified. The kit works fully
keyless regardless; token is opt-in.

---

## like / similarity / multimodal (added 2026-07-04)

Task 0.5. `search_catalog`'s `like` field ("an item ref or image for
similarity / multimodal search" per the docs) was systematically probed for
its accepted request shape, using a real product id / variant GID / image URL
taken live from a prior `search_catalog` call in the same run. Reproduce with
`node scripts/probe.mjs` (the new probe group logs as `LIKE / SIMILARITY /
MULTIMODAL PROBES`) or inspect the recorded fixtures directly.

**Headline finding: `like` is always an array, and each array element is one
of two mutually exclusive object shapes — `{id}` for an item ref, or
`{image: {content_type, data}}` for an inline base64 image.** No shape
accepts a bare string, a plain (non-array) object, or a public image URL.

| Mode | Accepted shape | Result | Error texts seen for wrong shapes |
|---|---|---|---|
| **item ref** | `{"like": [{"id": "gid://shopify/p/…"}], "pagination": {...}}` — array of `{id}` objects | **WORKS.** HTTP 200, `isError` absent, `products[]` returned (5/5 requested). The seed product itself is **excluded** from its own similarity results. No similarity score/ordering field is exposed on returned products — just the normal product shape. `messages: []` (nothing flagged as ignored). | `like: "<id>"` (bare string) → `Invalid arguments: value at \`/catalog/like\` is not an array`. `like: {"id": "<id>"}` (plain object, not wrapped in an array) → same "`/catalog/like` is not an array" error. `like: ["<id>"]` (array of bare strings) → `Invalid arguments: value at \`/catalog/like/0\` does not match exactly one \`oneOf\` schema, value at \`/catalog/like/0\` is not an object` — confirms each array element must itself be an object, and the object schema is a `oneOf` (hence the two shapes below). A variant GID (`gid://shopify/ProductVariant/…`) was **not needed** — the product GID form succeeded on the first array-of-object attempt, so the variant-GID fallback path was never exercised. |
| **image (public URL)** | **Not supported as a URL.** Every URL-based shape tried was rejected. | **REJECTED.** No shape accepting a public image URL was found after trying: bare string URL, `{image_url: "…"}`, `{url: "…"}`, `{image: {url: "…"}}`, and array forms of all four. | `like: "<url>"` / `{image_url}` / `{url}` / `{image:{url}}` (all non-array) → same `"/catalog/like` is not an array"` error as above. `like: ["<url>"]` (array of bare strings) → same "not an object" `oneOf` error as the item-ref bare-string-array case. `like: [{image_url: "<url>"}]` (array of object, wrong key) → `Invalid arguments: object property at \`/catalog/like/0/image_url\` is a disallowed additional property, object at \`/catalog/like/0\` is missing required properties: id, object property at \`/catalog/like/0/image_url\` is a disallowed additional property, object at \`/catalog/like/0\` is missing required properties: image` — this is the error that revealed the array element's `oneOf` is exactly `{id}` **or** `{image}`. `like: [{image: {url: "<url>"}}]` (array of object, right key, wrong inner shape) → `Invalid arguments: object property at \`/catalog/like/0/image\` is a disallowed additional property, object at \`/catalog/like/0\` is missing required properties: id, object property at \`/catalog/like/0/image/url\` is a disallowed additional property, object at \`/catalog/like/0/image\` is missing required properties: content_type, data` — this second error is what revealed the *actual* required shape below. |
| **image (inline base64)** | `{"like": [{"image": {"content_type": "image/jpeg", "data": "<base64>"}}], "pagination": {...}}` | **WORKS.** Fetched a real product image (`cdn.shopify.com/...jpg`, ~113 KB), base64-encoded it client-side, and sent it inline. HTTP 200, `isError` absent, `products[]` returned (5/5). The API does **not** accept a hosted URL for image search — the caller must download and inline the bytes. This has real cost/latency implications for the dupe-finder preset (Task 4/5): the client must fetch and base64-encode any reference image before calling `search_catalog`. | (see above — discovered via the array-of-object error texts) |
| **multimodal** (`query` + `like` together) | `{"query": "minimalist", "like": [{"id": "…"}], "pagination": {...}}` — and the same with `like: [{"image": {...}}]` | **WORKS**, both combinations (query + item-ref, query + image). HTTP 200, no error, `products[]` returned (5/5), `messages: []`. **Surprising:** combining `query:"minimalist"` with an item-ref `like` produced results that overlapped heavily with the pure item-ref `like` search (the text query appears to have limited pull once an item-ref is present). Combining `query:"minimalist"` with an **image** `like`, by contrast, visibly steered results — several returned product titles literally contained the word "Minimalist" — suggesting `query` has more influence alongside image-based `like` than alongside item-ref-based `like`. Neither combination returned any `messages[]` warning that one input was ignored, so both appear to be genuinely blended rather than one silently winning. | n/a — no rejected shape once the base shapes above were established. |

**Bonus finding (not asked for, but discovered while isolating the error
texts above):** a single `like` array can mix an `{id}` entry and an
`{image}` entry in the same request (e.g. `like: [{id: "…"}, {image: {...}}]`)
without a schema error — the API does not appear to enforce "one ref type per
call." Behavior in that case tracked the item-ref-only result set in ad hoc
testing; this combined-array case was not additionally recorded as a fixture
and deserves its own probe if the dupe-finder preset ever needs to combine
both ref types.

**Rate limiting note:** repeated `like` probing during this session tripped
the anonymous rate limit multiple times — both as HTTP 429 and as a JSON-RPC
`{"code":-32600,"message":"Invalid Request","data":"Rate limit exceeded"}`
body on an HTTP 200 response. `scripts/probe.mjs`'s new probe group now
retries on either signal with backoff before recording an attempt as
failed/succeeded, since a 429 is a transport artifact, not a verdict on the
request shape being tested. Anyone re-running these probes back-to-back
should expect to see (and can safely ignore) `(rate limited, retrying...)`
lines.

**Fixtures recorded:** `search-like-item.json` (item-ref `like`),
`search-like-image.json` (inline-base64 image `like`), and
`search-multimodal.json` (`query` + item-ref `like`) — all three are
successful (non-error) responses; no mode required recording a rejection as
the "fixture," since all three ultimately succeeded once given their correct
shape.

_Verified against live probes: 2026-07-04._

## filters require a query or like (added 2026-07-04, found in Phase 5)

| Probe | Result |
|---|---|
| `search_catalog` with only `filters.categories` + `price_tier` (no `query`/`like`) | Tool error: "A query is required". Filters refine a search; they cannot BE the search. Presets that are category-scoped must carry a query (see `examples/niche-marketplace.config.json`). |

_Verified against live probes: 2026-07-04._
