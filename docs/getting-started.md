# Getting started

`catalog-kit` is a clone-and-go starter for the **Shopify Global Catalog (UCP)** —
cross-merchant product search, no API key required. This page takes you from a fresh
clone to your first live query in under a minute, then explains the one piece of setup
that trips everyone up: the **agent profile**.

## Prerequisites

- **Node 20.19+ / 22.12+ / 24** (24 recommended; the repo is developed and CI-tested on
  Node 24). Transitive dependencies require one of these three ranges — a bare "Node ≥ 20"
  is not sufficient below 20.19.
- **pnpm** (this is a pnpm monorepo — `npm`/`yarn` will not resolve the workspace).
  Install with `corepack enable` or `npm i -g pnpm`.

No Shopify API key, no `.env` file, and no account are required to run the demo. Keyless
anonymous access is the default and works out of the box.

## 60-second keyless quickstart

```bash
# 1. Clone
git clone https://github.com/DevCreate-Studio/catalog-kit.git
cd catalog-kit

# 2. Install (pnpm workspace — installs client + web app)
pnpm install

# 3. Run the Next.js app
pnpm dev
```

4. Open **http://localhost:3000**.
5. Go to **Configure**, pick a preset (or build a `CatalogConfig`), and hit **Run in
   playground**.
6. You get live, cross-merchant products back — no key, no signup.

That's it. The dev server ships with a working fallback agent profile (see below), so a
plain `pnpm dev` searches the real catalog immediately.

> Nothing is cached. Every search hits the live API — the kit deliberately never caches
> results (a Shopify usage-guideline requirement). The proxy route sets
> `Cache-Control: no-store`.

## The agent profile

<a id="agent-profile"></a>

Every request to the Global Catalog must carry a **UCP agent profile URL**. This is the
one concept to understand before you deploy.

### What it is

The [Universal Commerce Protocol (UCP)](https://ucp.dev) identifies the *agent* making a
request by a public JSON document — the **agent profile** — that advertises which
capabilities the agent speaks (here: `dev.ucp.shopping.catalog.search` /
`.lookup`). Shopify's servers **fetch that URL themselves** on every call and inject it
into the request envelope under `params.arguments.meta['ucp-agent'].profile`. Without a
reachable, valid profile the request is rejected before any search runs.

The kit injects it for you — you only supply the URL via `AGENT_PROFILE_URL`.

### The `application/json` requirement (and the gist trap)

The profile URL **must be served with `Content-Type: application/json`.** This is the
single most common setup failure.

- A **GitHub gist raw URL serves `text/plain`** and is **rejected** with
  `profile_malformed` / `"Invalid content type"` (verified live 2026-07-04). Do not use a
  gist raw URL as `AGENT_PROFILE_URL`, even though it looks like it should work.
- Host it somewhere that sets the JSON content-type: **your own deploy** (this app serves
  it — see below), a CDN, or an object store.

### Self-hosting: your deploy serves `/agent-profile.json`

The web app exposes the profile at `/agent-profile.json` with the correct
`application/json` content-type. So in production the loop closes on itself: your deployed
app hosts the profile, and you point `AGENT_PROFILE_URL` at
`https://<your-deploy-host>/agent-profile.json`.

**A `localhost` URL can never work.** Shopify fetches the profile from its own servers,
which cannot reach your machine — so `http://localhost:3000/agent-profile.json` is valid
JSON that Shopify simply can't retrieve. The kit fails loud on this: `getServerEnv()`
throws a descriptive error naming the variable and linking here if `AGENT_PROFILE_URL`
points at `localhost` or `127.0.0.1`.

### The dev fallback

So local dev works with zero setup, when `AGENT_PROFILE_URL` is **unset** the app falls
back to Shopify's own published sample profile:

```
https://shopify.dev/ucp/agent-profiles/2026-04-08/valid-with-capabilities.json
```

It is served as `application/json` and verified working keyless. Fine for local dev — but
it is Shopify's identity, not yours.

### Publish your own before production

Before you ship, publish a profile under **your** identity. The repo ships a ready
template at [`profile/agent-profile.json`](../profile/agent-profile.json) (catalog
search + lookup capabilities, UCP version `2026-04-08`). Two ways to host it:

1. **Let the app serve it** — deploy `apps/web` and set
   `AGENT_PROFILE_URL=https://<your-deploy-host>/agent-profile.json`. Nothing else to do.
2. **Host it yourself** — put the JSON on any host that sends `application/json` (CDN,
   object store) and point `AGENT_PROFILE_URL` at it.

## Optional: credentials for higher rate limits

Keyless anonymous access works fully — you only need credentials to raise your rate limit.

1. In the **Shopify Dev Dashboard**, go to **Catalog → create key**.
2. Copy the `client_credentials` id and secret into your environment:

```bash
# .env (or apps/web/.env.local) — server-side only, never exposed to the browser
SHOPIFY_CATALOG_CLIENT_ID=your-client-id
SHOPIFY_CATALOG_CLIENT_SECRET=your-client-secret
```

3. Restart. The client detects both variables and automatically switches to the **token
   tier**: it exchanges the credentials for a short-lived JWT (~60-minute TTL), caches it,
   and refreshes 5 minutes early. `client.tier` reads `"token"` instead of `"anonymous"`.

**What the token tier changes:** higher rate limits. That's it — the search surface,
tools, and response shapes are identical across tiers. **Keyless cannot get rate-limit
increases** (it is the lowest tier by design), so if you're hitting `429`s in production,
credentials are the fix.

> Credentials are read server-side only (`getServerEnv()`) and never reach a client
> component. Leave them blank for keyless.

## Your first query without the app

You don't need the Next.js app at all — the client is a self-contained workspace package.
From your clone, drop this file at the repo root (e.g. `first-query.ts`); the pnpm workspace
resolves `catalog-kit` to `packages/catalog-client` with no install step.

Here's a complete, runnable TypeScript file that runs one keyless search:

```ts
import {
  createCatalogClient,
  type CatalogConfig,
} from "catalog-kit";

// The portable contract the configurator emits — one config drives everything.
const config: CatalogConfig = {
  version: 1,
  name: "gift-finder",
  scope: { type: "global" },
  query: "cozy gift for a coffee lover",
  context: {
    intent: "Find a thoughtful, well-reviewed gift for someone who loves coffee, under $50.",
  },
  filters: {
    available: true,
    price: { max: 5000 },
    rating: { variant: { min: 4 } },
  },
  pagination: { limit: 12 },
};

async function main() {
  const agentProfileUrl = process.env.AGENT_PROFILE_URL;
  if (!agentProfileUrl) throw new Error("Set AGENT_PROFILE_URL — see docs/getting-started.md#agent-profile.");

  // No `auth` → keyless anonymous (the default). Add { clientId, clientSecret } for the token tier.
  const client = createCatalogClient({ agentProfileUrl });

  const result = await client.searchCatalog(config);

  console.log(`Tier: ${client.tier}`);
  console.log(`Products: ${result.products?.length ?? 0}`);
  for (const product of result.products ?? []) {
    console.log("-", product.title ?? product.id ?? "(untitled)");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Run it with a real profile URL:

```bash
AGENT_PROFILE_URL=https://shopify.dev/ucp/agent-profiles/2026-04-08/valid-with-capabilities.json \
  npx tsx first-query.ts
```

(The configurator generates this exact snippet for whatever config you build — copy it
from the **Export** panel.)

## Using the client in your own project

catalog-kit is a **clone-and-build starter, not an npm package** — there's nothing to
`npm install`. To use the client outside this repo, copy `packages/catalog-client` into your
project, or add the repo as a git dependency. It is **dual ESM + CJS** (import or require)
and **runtime-agnostic** — it uses only the global `fetch` and has no `node:`-only
dependencies, so it runs on **Node, Cloudflare Workers, and edge runtimes** unchanged.
`fetch` is injectable (`createCatalogClient({ fetch })`) if you need a custom one.

The full API surface is in [api-reference.md](./api-reference.md); every field of the
`CatalogConfig` contract is in [configuration.md](./configuration.md).

## Troubleshooting pointers

- **"AGENT_PROFILE_URL is set to a localhost URL"** — Shopify can't reach your machine.
  Deploy and point at your host's `/agent-profile.json`, or leave the variable unset for
  the dev fallback. See [the agent profile](#agent-profile).
- **`profile_malformed` / "Invalid content type"** — your profile URL serves
  `text/plain` (a gist raw URL does this). Host it with `application/json`.
- **Empty results** — a nonsense text query still returns ~5 fuzzy fallbacks; genuinely
  empty usually means an over-narrow filter combination (e.g. a `price.max` far below any
  matching product's price *and* a query with no fuzzy matches), or you passed a `categories`
  object instead of a string GID. Check the response `messages[]`.
- **`429` / rate limited** — you're keyless at the lowest tier. Add credentials for the
  token tier; keyless cannot get increases.

A full troubleshooting guide lives in [troubleshooting.md](./troubleshooting.md).

---

_Verified against live probes: 2026-07-04._
