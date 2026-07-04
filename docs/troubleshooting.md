# Troubleshooting

Symptom → cause → fix, with the **exact error text** the API and client produce so you can
match on it. Everything here is verified against live probes
([probe-findings.md](./probe-findings.md)); the client behavior referenced is in
[api-reference.md](./api-reference.md#errors).

## Quick reference

| Symptom | Likely cause | Fix |
|---|---|---|
| Empty results | Filter too strict, or `query` missing, or `categories` object form | Loosen the filter; add a `query`; use string GIDs. [→](#empty-results) |
| `"A query is required"` | Filters with no `query`/`like` | Add a `query` or `like`. [→](#query-required) |
| `429` / `-32600 "Rate limit exceeded"` | Keyless lowest tier, throttled | Back off; add credentials. [→](#rate-limited) |
| `profile_malformed` / `"Invalid content type"` | Profile served as `text/plain` (gist) | Host with `application/json`. [→](#profile-fetch) |
| `"Unable to fetch agent profile"` | Unreachable / `localhost` profile URL | Use a public URL. [→](#profile-fetch) |
| `INVALID_CONFIG` | Client-side zod validation failed | Read the issue paths. [→](#invalid-config) |
| `LIKE_IMAGE_FETCH_FAILED` | Reference image unfetchable / not an image / >2 MB | Check URL, type, size. [→](#like-image) |
| Works local, fails deployed | Env vars / profile URL points at localhost | Set prod env vars. [→](#local-vs-deployed) |
| `tools/list` returns 422 | Expected keyless | Call tools by name. [→](#tools-list) |
| `pnpm` build/dev failures | Wrong pnpm/Node, or blocked build scripts | Match versions; allow builds. [→](#build-dev) |

---

## Empty results

<a id="empty-results"></a>

**A `products: []` with `total_count: 0` almost always means a filter, not the catalog.**

- **A nonsense text query does NOT return empty** — it returns ~5 fuzzy fallback matches.
  So if you got zero, it wasn't the query text alone; it was an **over-narrow filter
  combination** (e.g. a `price.max` set far below any matching product's price, an
  over-narrow `rating`, or a `shop_ids` list that excludes everything) — especially when
  paired with a query specific enough that fuzzy fallback has nothing to match against.
  Loosen or drop filters one at a time.
- **`categories` in the object `{id}` form is a hard error now** (was previously a silent
  0-results). If you passed `categories: [{ id: "gid://..." }]`, the API returns:
  ```
  Invalid arguments: value at `/catalog/filters/categories/0` is not a string
  ```
  Use **string GIDs only**: `categories: ["gid://shopify/TaxonomyCategory/hg-1"]`.
- **Always check the response `messages[]` array** (the playground surfaces it in a
  **Messages** tab with a count badge). A "no results" run with a `messages[]` entry usually
  means a filter was **silently dropped** — e.g. an unsupported attribute name:
  ```json
  { "type": "info", "code": "not_found", "path": "$.filters.attributes[0]",
    "content": "Attribute \"…\" is not supported and was ignored. Supported attributes: Color, Size, Target gender." }
  ```
  Supported attribute names are exactly **`Color`, `Size`, `Target gender`.**

## "A query is required"

<a id="query-required"></a>

**Cause:** you sent `filters` (and/or a saved-catalog scope) with **no `query` and no
`like`.** Filters *refine* a search; they can't *be* one. The tool errors with:

```
A query is required
```

**Fix:** add a `query` or a `like` alongside the filters. A category-scoped search still
needs a query — see [`examples/niche-marketplace.config.json`](../examples/niche-marketplace.config.json),
which pairs `categories` with `query: "coffee mug"`.

## `429` / rate limited

<a id="rate-limited"></a>

**Cause:** you're keyless, which is the **lowest rate-limit tier**, and you've been
throttled. Throttling shows up two ways — the client retries **both**:

- HTTP **429**.
- A JSON-RPC body on an HTTP **200**:
  `{"code":-32600,"message":"Invalid Request","data":"Rate limit exceeded"}`.

After the client's retries (3, exponential backoff + jitter) are exhausted, it throws
`CatalogError` with code `RATE_LIMITED`.

**Fix:**

1. **Back off** — let the client's backoff work; don't tighten a retry loop around it.
2. **Reduce concurrency** — a query-variant union should fan out to 2–3, not 20.
3. **Get credentials** — keyless **cannot get rate-limit increases**. Create a
   `client_credentials` key (Dev Dashboard → Catalog), set
   `SHOPIFY_CATALOG_CLIENT_ID` / `SECRET`, and the client moves to the token tier
   automatically (`client.tier === "token"`). This is the real fix for production `429`s.

No `x-ratelimit-*` / `retry-after` headers are exposed keyless, so you can't read your
budget — keep the `x-request-id` from responses for support tickets.

## Profile fetch failures

<a id="profile-fetch"></a>

All three surface as an HTTP **422** with a top-level JSON-RPC `error` (code `-32001`,
`"UCP discovery failed"`):

- **`text/plain` content-type trap:**
  ```
  profile_malformed / "Invalid content type"
  ```
  Your profile URL serves `text/plain`. **A GitHub gist raw URL does this** and is rejected
  (verified live 2026-07-04). Host it somewhere that sets `Content-Type: application/json` —
  your own deploy's `/agent-profile.json`, a CDN, or an object store.
- **`localhost` URL:** Shopify fetches the profile from **its own servers**, which can't
  reach your machine. `http://localhost:3000/agent-profile.json` is valid JSON that Shopify
  simply can't retrieve. The kit fails loud on this — `getServerEnv()` throws a descriptive
  error naming the variable if `AGENT_PROFILE_URL` points at `localhost` / `127.0.0.1`.
- **Unreachable host:** any URL Shopify's fetcher can't reach returns:
  ```
  Unable to fetch agent profile: Missing profile uri
  ```
  (or a fetch failure). Confirm the URL is public, resolves, and returns 200 with JSON.

See [getting-started.md](./getting-started.md#agent-profile) for the full agent-profile
walkthrough.

## `INVALID_CONFIG` (zod validation)

<a id="invalid-config"></a>

**Cause:** the `CatalogConfig` failed client-side validation — thrown **before** any network
call, so it's fast and local. The error carries the raw **zod issues** in `err.messages`.

**Fix: read the issue paths.** Each zod issue has a `path` (an **array** of segments, e.g.
`["filters", "categories", 0]`) and a `message`. The path points straight at the bad field.
Common ones:

- `categories` not matching the `gid://shopify/TaxonomyCategory/` prefix (the schema enforces
  string GIDs).
- `pagination.limit` out of the 1–50 range.
- `context.address_country` not exactly 2 chars, or `context.currency` not exactly 3.
- a `like` entry that's neither `{id}`, `{image}`, nor `{image_url}`.

```ts
import { CatalogError } from "catalog-kit";
try {
  await client.searchCatalog(config);
} catch (err) {
  if (CatalogError.isCatalogError(err) && err.code === "INVALID_CONFIG") {
    console.error(err.messages); // zod issues — path + message
  }
}
```

> Note the `path` format differs by source: **`INVALID_CONFIG`** issues carry `path` as an
> **array**; API **`messages[]`** entries use a **string** JSON-pointer
> (`"$.filters.attributes[0]"`). Handle both if you inspect `path`.

## `LIKE_IMAGE_FETCH_FAILED`

<a id="like-image"></a>

**Cause:** a `like` `{image_url}` reference image couldn't be turned into inline bytes.
Three reasons, each with its own message:

- **Over the 2 MB cap:** `Reference image … is <n> bytes, over the 2097152-byte (2 MB) cap.`
- **Not an image content-type:** `Reference image … has a non-image content-type: "…".`
- **Unreachable / non-2xx:** `Failed to fetch reference image …: HTTP <status>.` or a fetch
  failure.

**Fix:** confirm the URL is reachable, returns an `image/*` content-type, and the file is
under 2 MB. Already have raw bytes? Skip the fetch and pass the wire shape directly:
`like: [{ image: { content_type: "image/jpeg", data: "<base64>" } }]`.

## Works local, fails deployed

<a id="local-vs-deployed"></a>

Almost always **environment**:

- **`AGENT_PROFILE_URL` still points at `localhost`** (or is unset and you're relying on the
  dev fallback in prod). Set it to `https://<your-deploy>/agent-profile.json` in your host's
  env and redeploy. The kit throws a descriptive error for a `localhost` value.
- **Missing env vars on the host.** Local reads `apps/web/.env.local`; your host reads its
  own env settings — set `AGENT_PROFILE_URL` (and optional credentials) there too. See the
  [deployment env table](./deployment.md#env-vars).
- **Credentials present locally, absent in prod** → prod silently runs keyless and hits
  `429`s under load. Set `SHOPIFY_CATALOG_CLIENT_ID` / `SECRET` in the host.

## `tools/list` returns 422

<a id="tools-list"></a>

**This is expected keyless — not a bug.** `tools/list` returns **HTTP 422**
(`-32001 "UCP discovery failed"`) through every profile placement tried. Don't rely on
discovery. **Call the three catalog tools directly by name** — `search_catalog`,
`lookup_catalog`, `get_product` — which is exactly what the client's `searchCatalog`,
`lookupCatalog`, and `getProduct` methods do. Those three are the entire usable surface.

## Build / dev issues

<a id="build-dev"></a>

- **pnpm version.** This is a **pnpm 11 / Node 24** monorepo. `npm` or `yarn` won't resolve
  the workspace. Enable pnpm with `corepack enable` (or `npm i -g pnpm`). Node 20.19+ / 22.12+ /
  24 is the floor; CI runs on 24.
- **Blocked build scripts (`allowBuilds`).** pnpm may refuse to run a dependency's install
  scripts by default, printing an "ignored build scripts" warning. If a native dep needs its
  postinstall (e.g. to compile), approve it — run `pnpm approve-builds`, or add the package
  to `onlyBuiltDependencies` / `pnpm.allowBuilds` in the workspace config — then reinstall.
- **Stale install after a pull.** `rm -rf node_modules && pnpm install` from the repo root
  clears most "module not found" oddities.

---

_Verified against live probes: 2026-07-04._
