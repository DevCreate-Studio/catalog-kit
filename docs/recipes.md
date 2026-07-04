# Recipes

Full, runnable patterns built on the `catalog-kit` client. Each section is
self-contained: drop the TypeScript into a file, set `AGENT_PROFILE_URL`, and run it
with `npx tsx <file>.ts`. Every snippet compiles against the real client surface — see
[api-reference.md](./api-reference.md) for the method signatures and
[configuration.md](./configuration.md) for the `CatalogConfig` contract. Setup (profile
URL, keyless vs. token) is covered in [getting-started.md](./getting-started.md); this
page is about *what to build*.

These recipes obey the [compliance rules](./compliance.md) — no result caching, no image
re-hosting. Where a pattern brushes up against that line (recipe 5), it says so
explicitly.

## Contents

1. [Gift finder — intent + quality gates](#1-gift-finder)
2. [Query-variant union — the flagship](#2-query-variant-union)
3. [Dupe finder / visual search](#3-dupe-finder)
4. [More like this](#4-more-like-this)
5. [Price watcher](#5-price-watcher)
6. [Variant picker UX](#6-variant-picker)
7. [Pagination done right](#7-pagination)

---

## 1. Gift finder — intent + quality gates

<a id="1-gift-finder"></a>

A gift finder leans on two things the catalog does well: a natural-language **`intent`**
(the single most impactful context field) and **filters as quality gates** (price
ceiling, rating floor). But the API's price filter operates per-variant and can still
surface a product whose *cheapest* variant is over budget, so a real gift finder adds a
**hard post-filter** on the client side.

> Pattern credit: distilled from a production gift-finder build. The lesson that mattered
> — never trust `variants[0]` for "the price"; a product's entry price is the **lowest**
> variant price, and that's what a budget promise must be measured against.

```ts
import { createCatalogClient, type CatalogConfig, type CatalogProduct } from "catalog-kit";

const BUDGET_MINOR = 5000; // $50.00 in minor units

const config: CatalogConfig = {
  version: 1,
  name: "gift-finder",
  scope: { type: "global" },
  query: "cozy gift for a coffee lover",
  context: {
    // A full sentence steers ranking; a bare keyword ("gift") does not.
    intent: "Find a thoughtful, well-reviewed gift for someone who loves coffee, under $50.",
  },
  filters: {
    available: true,
    price: { max: BUDGET_MINOR }, // soft gate — the API applies it per-variant
    rating: { variant: { min: 4 } },
  },
  pagination: { limit: 24 },
};

/** Lowest variant price in minor units, or null if none is priced. */
function lowestVariantPriceMinor(product: CatalogProduct): number | null {
  const prices = (product.variants ?? [])
    .map((v) => v.price?.amount)
    .filter((a): a is number => typeof a === "number");
  return prices.length ? Math.min(...prices) : null;
}

/**
 * Hard budget reject + de-dupe. The catalog is cross-merchant, so the same
 * product can appear from multiple sellers — de-dupe by title + seller so you
 * don't show the "same" gift five times.
 */
function applyQualityGates(products: CatalogProduct[], budgetMinor: number): CatalogProduct[] {
  const seen = new Set<string>();
  const out: CatalogProduct[] = [];

  for (const product of products) {
    const lowest = lowestVariantPriceMinor(product);
    // Reject if we can't confirm the entry price is within budget.
    if (lowest === null || lowest > budgetMinor) continue;

    // `seller` is a loose passthrough object — read its `name` defensively.
    const seller = product.variants?.[0]?.seller as { name?: string } | undefined;
    const sellerName = seller?.name ?? "";
    const key = `${(product.title ?? "").toLowerCase()}::${sellerName.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push(product);
  }
  return out;
}

async function main() {
  const agentProfileUrl = process.env.AGENT_PROFILE_URL;
  if (!agentProfileUrl) throw new Error("Set AGENT_PROFILE_URL — see docs/getting-started.md#agent-profile.");

  const client = createCatalogClient({ agentProfileUrl });
  const result = await client.searchCatalog(config);

  const gifts = applyQualityGates(result.products ?? [], BUDGET_MINOR);
  console.log(`${gifts.length} gifts within budget (from ${result.products?.length ?? 0} raw):`);
  for (const g of gifts) {
    const lowest = lowestVariantPriceMinor(g);
    console.log(`- ${g.title ?? g.id} — $${((lowest ?? 0) / 100).toFixed(2)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

The shipped [`examples/gift-finder.config.json`](../examples/gift-finder.config.json) is
the config half of this recipe; the post-filter is the part the raw API can't do for you.

---

## 2. Query-variant union — the flagship

<a id="2-query-variant-union"></a>

**The single most valuable pattern in this doc.** If you need broad coverage of a
catalog for a query, do **not** paginate one query deep. Run **2–3 complementary query
variants concurrently** and merge them.

**Why deep pagination decays.** Measured in one production build (not a benchmark — one
real app, one catalog, one afternoon of measuring): a *single* query paginated five pages
deep held only **~58–69% usable results** by the deep pages — relevance rots as you
descend, because the tail of one query is where the fuzzy, off-intent matches live. A
**union of two complementary query variants**, each read shallow, held **96–100% usable
results** over the same total result count. Same number of products fetched; far higher
quality. Frame this honestly to yourself: it's a measurement from one build, not a
guaranteed law — but the mechanism (query tails decay; independent queries don't share a
tail) is sound and has held up across catalogs.

```ts
import { createCatalogClient, type CatalogConfig, type CatalogProduct } from "catalog-kit";

// 2–3 complementary phrasings of the same intent. They should overlap in goal
// but differ in wording so their result *tails* don't coincide.
const VARIANTS = [
  "wireless noise cancelling headphones",
  "over-ear bluetooth headphones with mic",
  "premium ANC headphones long battery",
];

function baseConfig(query: string): CatalogConfig {
  return {
    version: 1,
    name: "union-search",
    scope: { type: "global" },
    query,
    filters: { available: true },
    pagination: { limit: 24 }, // shallow: one page per variant, not five pages of one
  };
}

/** Merge multiple result sets, de-duping by product id (first occurrence wins). */
function unionById(sets: CatalogProduct[][]): CatalogProduct[] {
  const seen = new Set<string>();
  const out: CatalogProduct[] = [];
  for (const set of sets) {
    for (const product of set) {
      const id = product.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(product);
    }
  }
  return out;
}

async function main() {
  const agentProfileUrl = process.env.AGENT_PROFILE_URL;
  if (!agentProfileUrl) throw new Error("Set AGENT_PROFILE_URL — see docs/getting-started.md#agent-profile.");

  const client = createCatalogClient({ agentProfileUrl });

  // Run the variants concurrently — one round-trip's worth of latency, N× the coverage.
  const results = await Promise.all(
    VARIANTS.map((q) => client.searchCatalog(baseConfig(q))),
  );

  const merged = unionById(results.map((r) => r.products ?? []));
  console.log(`Union of ${VARIANTS.length} variants → ${merged.length} unique products`);
  for (const p of merged) console.log("-", p.title ?? p.id);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

**Result-quality vs. depth, stated plainly:** a shallow union beats a deep single query.
If you find yourself reaching for page 4 of one query (recipe 7), that's the signal to
switch to a union instead. Mind the [rate limits](./compliance.md#rate-limits) —
concurrent variants are concurrent requests; keyless is the lowest tier, so keep the fan
small (2–3) and back off on `429`.

---

## 3. Dupe finder / visual search

<a id="3-dupe-finder"></a>

Search by **image**: give the client an image URL, it fetches the bytes, base64-encodes
them, and sends them inline (the API rejects hosted URLs and requires inline bytes — see
the [`like` findings](./probe-findings.md#like--similarity--multimodal-added-2026-07-04)).
This is the sanctioned exception to the no-image-download rule: a **transient encode of a
reference image for one request**, never storage.

```ts
import { createCatalogClient, type CatalogConfig } from "catalog-kit";

// The kit-convenience `image_url` entry: the client fetches, validates
// (2xx, image content-type, ≤2 MB), base64-encodes, and swaps it to the wire
// shape { image: { content_type, data } } at request time.
const config: CatalogConfig = {
  version: 1,
  name: "dupe-finder",
  scope: { type: "global" },
  like: [
    {
      image_url:
        "https://cdn.shopify.com/s/files/1/1726/0467/files/921fa5a3-16fb-49ab-a25b-417df1178ca5.jpg",
    },
  ],
  pagination: { limit: 12 },
};

async function main() {
  const agentProfileUrl = process.env.AGENT_PROFILE_URL;
  if (!agentProfileUrl) throw new Error("Set AGENT_PROFILE_URL — see docs/getting-started.md#agent-profile.");

  const client = createCatalogClient({ agentProfileUrl });
  const result = await client.searchCatalog(config);
  for (const p of result.products ?? []) console.log("-", p.title ?? p.id);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

**The base64 transform & 2 MB cap.** If the reference image can't be fetched, isn't an
`image/*` content-type, or exceeds **2 MB**, the client throws `CatalogError` with code
`LIKE_IMAGE_FETCH_FAILED` *before* any catalog call — so you fail fast, locally, with a
clear message. Already have raw bytes? Skip the fetch and pass the wire shape directly:
`like: [{ image: { content_type: "image/jpeg", data: "<base64>" } }]`.

**Multimodal variant (live-verified).** Add a `query` alongside the image and the text
*steers* the visual results — verified live: pairing an image with `query: "minimalist"`
returned products whose titles literally contained "Minimalist"
([probe findings](./probe-findings.md#like--similarity--multimodal-added-2026-07-04)):

```ts
const multimodal: CatalogConfig = {
  version: 1,
  name: "dupe-finder-steered",
  scope: { type: "global" },
  query: "minimalist",
  like: [
    { image_url: "https://cdn.shopify.com/s/files/1/1726/0467/files/921fa5a3-16fb-49ab-a25b-417df1178ca5.jpg" },
  ],
  pagination: { limit: 12 },
};
```

[`examples/dupe-finder.config.json`](../examples/dupe-finder.config.json) is the image-only
config; the demo's dupe-finder preset renders exactly this.

---

## 4. More like this

<a id="4-more-like-this"></a>

The item-ref form of `like`: pass a product **id** from any prior result and get similar
products. The seed product is excluded from its own results, and no similarity score is
exposed — you get the normal product shape back, ranked by similarity.

```ts
import { createCatalogClient, type CatalogConfig } from "catalog-kit";

async function moreLikeThis(client: ReturnType<typeof createCatalogClient>, id: string) {
  const config: CatalogConfig = {
    version: 1,
    name: "more-like-this",
    scope: { type: "global" },
    like: [{ id }], // any product id from a search / lookup / get_product result
    pagination: { limit: 12 },
  };
  const result = await client.searchCatalog(config);
  return result.products ?? [];
}

async function main() {
  const agentProfileUrl = process.env.AGENT_PROFILE_URL;
  if (!agentProfileUrl) throw new Error("Set AGENT_PROFILE_URL — see docs/getting-started.md#agent-profile.");

  const client = createCatalogClient({ agentProfileUrl });

  // 1. Get a seed product from a normal search.
  const seed = await client.searchCatalog({
    version: 1, name: "seed", scope: { type: "global" },
    query: "wireless headphones", pagination: { limit: 1 },
  });
  const seedId = seed.products?.[0]?.id;
  if (!seedId) throw new Error("No seed product.");

  // 2. Find more like it.
  const similar = await moreLikeThis(client, seedId);
  console.log(`Products similar to ${seedId}:`);
  for (const p of similar) console.log("-", p.title ?? p.id);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

**UI note:** the demo's **Similar** button on each product card does exactly this — one
click re-searches with `like: [{ id }]` for the clicked product
([`apps/web/components/demo/product-card.tsx`](../apps/web/components/demo/product-card.tsx)).
It's the smallest possible "recommendations" feature: no model to train, one field to set.

---

## 5. Price watcher

<a id="5-price-watcher"></a>

Watch a **saved list of product ids** for price changes using `lookupCatalog` (1–50 ids
per call) on a schedule, comparing each product's current price against the last price you
recorded.

**The compliance line — read this before you build it.** Caching *catalog results* is
prohibited: you must not store the products, images, descriptions, or offers the API
returns and re-serve them. But tracking **your own price history for specific products you
are watching is your data.** The distinction is:

- ✅ **Allowed:** store the minimal fields *you* need to detect a change — the product
  `id`, the price you observed, and a timestamp. That's a log you generated.
- ❌ **Not allowed:** persist and re-host the catalog payload — titles, descriptions,
  media URLs, seller info, the full product objects — as a substitute for calling the
  live API. That's caching results.

Draw the line conservatively: **store the id, the number, and the time; re-fetch
everything else live.** Don't republish catalog data.

```ts
import { createCatalogClient, type CatalogProduct } from "catalog-kit";

/** Minimal tracked record — YOUR data, not a cache of catalog payloads. */
interface PricePoint {
  productId: string;
  lowestMinor: number; // lowest variant price, minor units
  observedAt: string;  // ISO timestamp
}

// In production this is a DB row keyed by productId. In-memory here for the example.
const lastSeen = new Map<string, PricePoint>();

function lowestVariantPriceMinor(product: CatalogProduct): number | null {
  const prices = (product.variants ?? [])
    .map((v) => v.price?.amount)
    .filter((a): a is number => typeof a === "number");
  return prices.length ? Math.min(...prices) : null;
}

/** One watch pass over the ids you're tracking. */
async function checkPrices(
  client: ReturnType<typeof createCatalogClient>,
  watchedIds: string[],
): Promise<void> {
  // lookupCatalog takes 1–50 ids; chunk if you watch more.
  const result = await client.lookupCatalog({ ids: watchedIds });

  for (const product of result.products ?? []) {
    const id = product.id;
    const lowest = lowestVariantPriceMinor(product);
    if (!id || lowest === null) continue;

    const prev = lastSeen.get(id);
    if (prev && lowest < prev.lowestMinor) {
      const drop = ((prev.lowestMinor - lowest) / 100).toFixed(2);
      console.log(`↓ ${product.title ?? id} dropped $${drop} → $${(lowest / 100).toFixed(2)}`);
      // notify(...) here
    }

    // Record the minimal point. Do NOT store the product object.
    lastSeen.set(id, { productId: id, lowestMinor: lowest, observedAt: new Date().toISOString() });
  }
}

async function main() {
  const agentProfileUrl = process.env.AGENT_PROFILE_URL;
  if (!agentProfileUrl) throw new Error("Set AGENT_PROFILE_URL — see docs/getting-started.md#agent-profile.");

  const client = createCatalogClient({ agentProfileUrl });
  const watchedIds = ["gid://shopify/p/2jH1G1bSch4rBP21t4dUYw"]; // your saved list

  // Cron-agnostic: a plain interval works locally; use a real scheduler in prod.
  const HOUR = 60 * 60 * 1000;
  await checkPrices(client, watchedIds);
  setInterval(() => checkPrices(client, watchedIds).catch(console.error), HOUR);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

**Scheduling in production:** `setInterval` only runs while a process is alive. For a
serverless deploy, use a scheduled trigger instead — **Vercel Cron** or **Cloudflare
Workers Cron Triggers** call a route on a schedule. See
[deployment.md](./deployment.md#scheduled-jobs) for both.

---

## 6. Variant picker UX

<a id="6-variant-picker"></a>

`getProduct` takes `{ id, selected?, preferences? }`. `selected` expresses the variant
options the shopper has chosen; `preferences` carries buyer preferences (currency, locale)
forwarded verbatim.

**Relaxation semantics — the important part.** The API does **not** return nothing when
your selection over-constrains. It starts from your exact selection and progressively
**relaxes the least-constraining option** until a valid variant is found. The response
echoes what it actually resolved to in `product.selected` — an array, and `[]` when
nothing was constrained (as in the real fixture below). So always render from the
*returned* `product.selected`, not from what you asked for — they can differ.

```ts
import { createCatalogClient } from "catalog-kit";

async function main() {
  const agentProfileUrl = process.env.AGENT_PROFILE_URL;
  if (!agentProfileUrl) throw new Error("Set AGENT_PROFILE_URL — see docs/getting-started.md#agent-profile.");

  const client = createCatalogClient({ agentProfileUrl });

  const result = await client.getProduct({
    id: "gid://shopify/p/2jH1G1bSch4rBP21t4dUYw",
    selected: [{ name: "Color", value: "Green" }], // shopper's choice
    preferences: [{ currency: "USD" }],            // forwarded untouched
  });

  const product = result.product;
  // Render from what the API RESOLVED, not what you sent — relaxation may differ.
  console.log("Resolved selection:", JSON.stringify(product?.selected ?? []));
  console.log("Price range:", JSON.stringify(product?.price_range));
  for (const v of product?.variants ?? []) {
    console.log(`- ${v.title ?? v.id}: $${((v.price?.amount ?? 0) / 100).toFixed(2)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

The real [`fixtures/get-product.json`](../packages/catalog-client/fixtures/get-product.json)
response for this product returns `"selected": []` (nothing was constrained) and a
`price_range` of `{ min: { amount: 6999, currency: "USD" }, max: { amount: 6999, currency: "USD" } }`.
The playground's product inspector
([`apps/web/components/playground/inspector.tsx`](../apps/web/components/playground/inspector.tsx))
lets you build `selected`/`preferences` rows interactively and see the resolved response.

---

## 7. Pagination done right

<a id="7-pagination"></a>

For genuinely large result sets, page with the **cursor** — read `pagination.cursor` off a
response and pass it back on the next call. The client's `searchCatalog(config, { cursor })`
merges it in for you.

```ts
import { createCatalogClient, type CatalogConfig, type CatalogProduct } from "catalog-kit";

const DEPTH_CAP = 1000; // stop long before you hallucinate exact totals

async function pageThrough(
  client: ReturnType<typeof createCatalogClient>,
  config: CatalogConfig,
): Promise<CatalogProduct[]> {
  const all: CatalogProduct[] = [];
  let cursor: string | undefined;
  let pages = 0;

  do {
    const result = await client.searchCatalog(config, cursor ? { cursor } : {});
    all.push(...(result.products ?? []));
    pages++;

    const p = result.pagination;
    // Stop when there's no next page, the cursor is missing, or we hit the cap.
    if (!p?.has_next_page || !p.cursor || all.length >= DEPTH_CAP) break;
    cursor = p.cursor;

    if (pages >= 3) {
      // If you're 3+ pages deep, your query is probably wrong — a union of query
      // variants (recipe 2) holds far higher result quality than deep pagination.
      console.warn("3+ pages deep — consider the query-variant union (recipe 2) instead.");
    }
  } while (true);

  return all;
}

async function main() {
  const agentProfileUrl = process.env.AGENT_PROFILE_URL;
  if (!agentProfileUrl) throw new Error("Set AGENT_PROFILE_URL — see docs/getting-started.md#agent-profile.");

  const client = createCatalogClient({ agentProfileUrl });
  const config: CatalogConfig = {
    version: 1, name: "paged", scope: { type: "global" },
    query: "headphones", filters: { available: true }, pagination: { limit: 50 },
  };

  const products = await pageThrough(client, config);
  console.log(`Fetched ${products.length} products across pages.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

**When to stop:**

- **`has_next_page === false`** or a **missing `cursor`** — the natural end.
- **Depth cap ~1000** — cursor pagination isn't a bulk-export API; cap it.
- **`total_count` is an estimate**, not a promise. Don't build "page N of M" UI on it, and
  don't loop until you've "seen `total_count` products" — you may never exactly reach it.

**And the real lesson:** if you're **3+ pages deep**, your query is almost certainly wrong.
Deep pages are where relevance rots (recipe 2 measured ~58–69% usable by page five). Switch
to a **[union of query variants](#2-query-variant-union)** — shallow reads of complementary
queries hold 96–100% usable results for the same fetch count.

---

_Verified against live probes: 2026-07-04._
