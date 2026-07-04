---
name: build-catalog-app
description: Use when building an app, page, or feature on the Shopify Global Catalog with catalog-kit — turns an app idea into a valid CatalogConfig and a working page.
---

# Build a Catalog app

Turn a user's app idea into a valid `CatalogConfig` and a working page on the Shopify Global
Catalog (UCP). One `CatalogConfig` JSON is the contract: produce a valid one and you have a
working app. Follow these steps in order.

## 1. Read the gotchas first

Read [`AGENTS.md`](../../../AGENTS.md) — specifically the **API gotchas** and **Compliance
rules** sections. They are live-verified; do not relitigate them. This skill lists only the
load-bearing gotchas inline (step 3); everything else lives in AGENTS.md.

## 2. Map the idea to the nearest preset

Start from the closest shipped preset in `examples/` and mutate it — don't build from a blank
config.

| Preset | Capability angle | Config highlight |
| --- | --- | --- |
| `gift-finder.config.json` | Intent-driven, well-reviewed, in-budget | `context.intent` + `filters.price.max` + `filters.rating.variant.min` |
| `comparison-shopper.config.json` | Same product across many sellers as offers | `view: "offer"` + `filters.ships_to` |
| `niche-marketplace.config.json` | Category-scoped storefront in one taxonomy branch | `filters.categories` (GID) + `filters.price_tier` |
| `dupe-finder.config.json` | Visually similar products from a reference image | `like: [{ image_url }]` (image search) |

## 3. Derive a CatalogConfig

Required fields: `version: 1`, a descriptive `name`, and `scope` (`{ "type": "global" }` for
the cross-merchant catalog). A search needs a `query` **or** a `like`.

Gotchas that bite (verified live — from AGENTS.md):

- **Filters don't stand alone.** A search with `filters` but no `query`/`like` errors with "A
  query is required". Pair categories/filters with a `query`.
- **`categories` are string GIDs only** — `["gid://shopify/TaxonomyCategory/hg-1"]`. The
  `{id}` object form is a hard tool error.
- **Prices are minor units.** `{ "amount": 5000, "currency": "USD" }` = $50.00.
- **`pagination.limit` clamps at 50** silently. Keep `limit ≤ 50`.
- **`like` is always an array**; each element is `{id}` **XOR** `{image:{content_type,data}}`.
  Bare strings and public image URLs are rejected. The kit adds a convenience shape
  `{ image_url }` in a config — the client fetches and base64-encodes it at request time (the
  one sanctioned image-fetch exception). Prefer `{ image_url }` in configs.
- **`ships_to` is an object** `{ "country": "US" }`; **`ships_from` is an array**
  `[{ "country": "CA" }]`.
- Supported attribute names are exactly **Color, Size, Target gender**; others are ignored and
  surface in `messages[]`.

## 4. Validate against the JSON Schema

Validate mechanically before wiring anything — no code execution needed:

```bash
# ajv-cli@3 pinned: the schema is draft-07, which newer ajv-cli majors reject
npx ajv-cli@3 validate \
  -s packages/catalog-client/schema/catalog-config.schema.json \
  -d examples/<your-name>.config.json
```

Or, if you added it under `examples/`, let the presets suite validate it:

```bash
pnpm --filter web test -- presets
```

`apps/web/lib/__tests__/presets.test.ts` parses, schema-validates, and checks `name`/`version`
for every `examples/*.config.json`. It must stay green.

## 5. Test the config live

Two ways to run a config against the real catalog:

- **Playground URL hash.** Base64url-encode the config into the playground's `#c=` hash and
  open `/playground#c=<base64url>`. Use `encodeConfigHash` from `apps/web/lib/config-hash.ts`
  to produce the hash (JSON → UTF-8 → base64url, no padding).
- **curl the proxy** (dev server running):

  ```bash
  curl -s http://localhost:3000/api/catalog \
    -H 'content-type: application/json' \
    -d '{"tool":"search","config":<your config JSON>}'
  ```

Nonsense queries return ~5 fuzzy fallbacks (never empty) — to test a true empty state use an
over-narrow **filter** combination (e.g. a `price.max` far below any matching product's price,
paired with a specific query), not a bad query.

## 6. Build the page

Copy `apps/web/app/(tools)/demo/page.tsx` as the template and swap in your preset/config. Keep the
proxy boundary: **all** catalog calls go through `POST /api/catalog` (secrets and
`Cache-Control: no-store` live server-side). Never call the catalog endpoint from a client
component. Follow the "add a preset" playbook in AGENTS.md (add the preset card, update the
README preset table).

## 7. Run the gates

```bash
pnpm lint && pnpm test && pnpm build
```

When you touched the client (`packages/catalog-client`), also run the live smoke gate:

```bash
pnpm --filter catalog-kit build
node packages/catalog-client/test/live-smoke.mjs
```

## Compliance (never violate)

- **No caching of search results** — the proxy is `no-store` and route handlers are
  `force-dynamic`. Don't add a results cache.
- **No downloading or re-hosting product images** — hot-link them from Shopify's CDN and render
  in real time. The only exception is the transient base64 encode of a *reference* image for a
  `like` search.
