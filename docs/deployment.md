# Deployment

The kit is two deployables: the **Next.js app** (`apps/web` — landing, configurator,
playground, demo, and the proxy + agent-profile routes) and the **standalone client**
(`packages/catalog-client`, the `catalog-kit` workspace package), which runs anywhere `fetch` does.
This page covers deploying the app to **Vercel** (the first-class path), running the client
on **Cloudflare Workers**, and where to host your **agent profile** in production.

Setup concepts (the agent profile, keyless vs. token) are in
[getting-started.md](./getting-started.md); [compliance.md](./compliance.md) explains why
the routes are dynamic. This page is the deploy mechanics.

## Vercel (first-class)

`apps/web` is a standard Next.js App Router app — Vercel is the intended target.

### One-click deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/DevCreate-Studio/catalog-kit)

The button clones the repo into your Vercel account. **Two things to set in the import
flow:**

1. **Root Directory → `apps/web`.** This is a pnpm monorepo; the deployable app is not at
   the repo root. Vercel's importer lets you pick the root directory — set it to `apps/web`.
2. **Environment variables** (see the [table below](#env-vars)) — or skip them on the first
   deploy and rely on the dev fallback, then set `AGENT_PROFILE_URL` once you have a URL
   (the [chicken-and-egg note](#chicken-and-egg)).

### Manual path (Vercel CLI)

```bash
npm i -g vercel

# From the repo root, link and set the root directory to apps/web when prompted.
vercel link

# Push env vars (or set them in the dashboard — see the table below).
vercel env add AGENT_PROFILE_URL production

# Deploy.
vercel --prod
```

Set the project's **Root Directory** to `apps/web` in the Vercel dashboard (Settings →
General) if the CLI didn't during `link`.

### Environment variables

<a id="env-vars"></a>

| Variable | Required | Value |
|---|---|---|
| `AGENT_PROFILE_URL` | Recommended | Point it at **`https://<your-deploy>/agent-profile.json`** after your first deploy (your app serves it). Unset → falls back to Shopify's sample profile (fine to bootstrap; it's Shopify's identity, not yours). **A `localhost` URL never works** — Shopify fetches it from its own servers. |
| `SHOPIFY_CATALOG_CLIENT_ID` | Optional | Dev Dashboard `client_credentials` id. Raises rate limits. Server-side only. |
| `SHOPIFY_CATALOG_CLIENT_SECRET` | Optional | The matching secret. Server-side only, never exposed to the browser. |

These mirror [`.env.example`](../.env.example). Credentials are read server-side via
`getServerEnv()` and never reach a client component.

> **Public demo? Stay keyless.** The catalog proxy is unauthenticated by design (it's a
> demo anyone can try). Its browser-facing guard blocks cross-site abuse, but a scripted
> client can still call it — so **do not set `SHOPIFY_CATALOG_CLIENT_ID`/`SECRET` on a
> publicly reachable deployment.** Without them the proxy runs at the anonymous tier, so the
> worst a relay can borrow is the same keyless budget anyone already has hitting Shopify
> directly (further throttled by the per-IP rate limit). Add token credentials only on a
> deployment that isn't openly exposed, or put your own auth in front of `/api/catalog`
> first.

### The chicken-and-egg: profile URL points at a deploy that doesn't exist yet

<a id="chicken-and-egg"></a>

Your production `AGENT_PROFILE_URL` should be `https://<your-deploy>/agent-profile.json` —
but you don't know your deploy URL until you've deployed. Resolve it in two steps:

1. **First deploy with `AGENT_PROFILE_URL` unset.** The app falls back to Shopify's
   published sample profile
   (`https://shopify.dev/ucp/agent-profiles/2026-04-08/valid-with-capabilities.json`),
   which is served as `application/json` and works keyless. Search works immediately — but
   under Shopify's identity, not yours.
2. **Then set your own.** Once the deploy exists, set
   `AGENT_PROFILE_URL=https://<your-deploy>/agent-profile.json` (your app serves it from
   [`app/agent-profile.json/route.ts`](../apps/web/app/agent-profile.json/route.ts) with the
   correct content-type) and redeploy. The loop closes on itself.

### Don't "fix" the dynamic routes

The proxy ([`app/api/catalog/route.ts`](../apps/web/app/api/catalog/route.ts)) and the
agent-profile route are **`force-dynamic` and `no-store` by design** —
[compliance](./compliance.md#no-caching) forbids caching catalog results. If a build report
or optimization suggestion nudges you to make them static or cacheable, **ignore it.** That
dynamism is intentional, not an oversight.

## Cloudflare Workers

The client is **fetch-native** — it uses only global `fetch`, has no `node:`-only
dependencies, and injectable `fetch` — so `createCatalogClient` runs on Workers unchanged.

**Sketch — adapt to your setup.** A minimal Worker that runs one keyless search:

```ts
// src/worker.ts — sketch, adapt to your project.
import { createCatalogClient } from "catalog-kit";

export interface Env {
  AGENT_PROFILE_URL: string;
  SHOPIFY_CATALOG_CLIENT_ID?: string;
  SHOPIFY_CATALOG_CLIENT_SECRET?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const client = createCatalogClient({
      agentProfileUrl: env.AGENT_PROFILE_URL,
      // Omit `auth` for keyless; include for the token tier.
      auth:
        env.SHOPIFY_CATALOG_CLIENT_ID && env.SHOPIFY_CATALOG_CLIENT_SECRET
          ? { clientId: env.SHOPIFY_CATALOG_CLIENT_ID, clientSecret: env.SHOPIFY_CATALOG_CLIENT_SECRET }
          : undefined,
    });

    const q = new URL(request.url).searchParams.get("q") ?? "wireless headphones";
    const result = await client.searchCatalog({
      version: 1, name: "worker-search", scope: { type: "global" },
      query: q, filters: { available: true }, pagination: { limit: 12 },
    });

    // Compliance: never cache results.
    return Response.json(
      { products: result.products ?? [] },
      { headers: { "cache-control": "no-store" } },
    );
  },
} satisfies ExportedHandler<Env>;
```

A matching `wrangler.toml` sketch:

```toml
name = "catalog-worker"
main = "src/worker.ts"
compatibility_date = "2026-07-04"

[vars]
# AGENT_PROFILE_URL is public; set it here or with `wrangler deploy --var`.
AGENT_PROFILE_URL = "https://<your-host>/agent-profile.json"
# Credentials are secrets — set with `wrangler secret put SHOPIFY_CATALOG_CLIENT_ID` etc.,
# never in this file.
```

> **The Next.js app itself is Vercel-first.** Running the *full `apps/web` app* on Workers
> (via OpenNext or `@cloudflare/next-on-pages`) is out of scope for this kit — adapt at
> your own discretion. See
> [Cloudflare's Next.js guide](https://developers.cloudflare.com/workers/frameworks/framework-guides/nextjs/).
> The **client** on Workers is fully supported; the **app** on Workers is not something the
> kit ships or tests.

## Scheduled jobs (price watcher, etc.)

<a id="scheduled-jobs"></a>

The [price-watcher recipe](./recipes.md#5-price-watcher) uses `setInterval`, which only
runs while a process is alive — wrong for serverless. Use a platform scheduler that calls a
route:

- **Vercel Cron** — add a `crons` entry to `vercel.json` pointing at a route
  (`app/api/watch-prices/route.ts`) that runs one watch pass. See
  [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs).
- **Cloudflare Workers Cron Triggers** — add a `[triggers] crons = [...]` block to
  `wrangler.toml` and export a `scheduled()` handler that runs the pass. See
  [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

Either way, the route/handler does exactly what the recipe's `checkPrices()` does, once per
invocation.

## Where to host the agent profile in production

<a id="profile-hosting"></a>

The profile URL **must be served with `Content-Type: application/json`** — this is the most
common setup failure ([getting-started.md](./getting-started.md#agent-profile)). Good hosts:

- ✅ **Your app route** — `apps/web` serves `/agent-profile.json` with the correct
  content-type
  ([`app/agent-profile.json/route.ts`](../apps/web/app/agent-profile.json/route.ts)). This
  is the recommended path: deploy the app, point `AGENT_PROFILE_URL` at
  `https://<your-deploy>/agent-profile.json`, done.
- ✅ **Any static host / CDN / object store** that sets `application/json` (S3 + correct
  content-type, R2, a CDN).
- ❌ **NOT a GitHub gist raw URL** — it serves `text/plain` and is rejected with
  `profile_malformed` / `"Invalid content type"` (verified live 2026-07-04). Looks like it
  should work; doesn't.
- ❌ **NOT `localhost`** — Shopify fetches the profile from its own servers, which can't
  reach your machine.

The ready-to-publish template ships at
[`profile/agent-profile.json`](../profile/agent-profile.json) — publish it under your own
identity before production.

---

_Verified against live probes: 2026-07-04._
