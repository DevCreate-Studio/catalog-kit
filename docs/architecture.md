# Architecture

How `catalog-kit` is put together and *why*. The authoritative repo map and conventions
live in [`AGENTS.md`](../AGENTS.md) (the source of truth — keep this page in sync with it);
this page annotates the structure and explains the design decisions behind it. For API
behavior see [api-reference.md](./api-reference.md); for the field contract,
[configuration.md](./configuration.md); for the historical "why" of each probed quirk,
[probe-findings.md](./probe-findings.md).

## The repo tree, annotated

A pnpm monorepo: a framework-agnostic typed **client** plus a Next.js **demo app**. Kept in
sync with the repo map in [`AGENTS.md`](../AGENTS.md#repo-map).

```
catalog-kit/
├── AGENTS.md                     # single source of truth for working in the repo
├── packages/catalog-client/      # the published client (npm: `catalog-kit`)
│   ├── src/
│   │   ├── index.ts              # public barrel — exports only
│   │   ├── endpoints.ts          # ALL Catalog URLs + UCP_SPEC_VERSION (the single pin point)
│   │   ├── auth.ts               # tier ladder: anonymous | token (JWT cache + early refresh)
│   │   ├── transport.ts          # JSON-RPC tools/call, profile injection, retry/backoff/timeout
│   │   ├── config.ts             # CatalogConfig type + buildSearchArguments() + resolveLikeEntries()
│   │   ├── tools/                # search.ts · lookup.ts · get-product.ts (the three typed tools)
│   │   ├── schemas/              # requests.ts (strict) · responses.ts (LENIENT — optional+passthrough)
│   │   └── errors.ts             # CatalogError: stable code + jsonrpc error + messages[]
│   ├── fixtures/*.json           # recorded live responses (tests run against these, offline)
│   └── schema/catalog-config.schema.json   # generated from zod on `pnpm build`
├── apps/web/                     # Next.js App Router + shadcn/ui
│   └── app/
│       ├── page.tsx              # landing: pitch, 5-step viz, live teaser
│       ├── (tools)/configure/    # 3-panel configurator — EMITS a CatalogConfig
│       ├── (tools)/playground/   # raw config → response inspector — CONSUMES a CatalogConfig
│       ├── (tools)/demo/         # preset-driven storefront (Similar button, load-more)
│       ├── agent-profile.json/route.ts   # serves the UCP profile as application/json
│       └── api/catalog/route.ts  # server proxy — secrets stay server-side, no-store, force-dynamic
├── examples/*.config.json        # presets — validated against the JSON Schema in CI
├── profile/agent-profile.json    # sample UCP profile to publish under your own identity
├── docs/                         # this documentation
└── scripts/                      # probe.mjs · record-fixtures.mjs · build-llms-txt.mjs
```

## Config is the contract — the data flow

The core principle: **one `CatalogConfig` JSON is the portable contract that everything
shares.** It's the spine the whole kit hangs off.

```
  configurator  ──emits──▶  CatalogConfig (JSON)  ──consumed by──▶  playground / demo / exported code
  (configure/)                    │                                          │
                                  ▼                                          ▼
                        buildSearchArguments(config)  ──▶  params.arguments.catalog  ──▶  JSON-RPC wire
                          (packages/catalog-client/src/config.ts)                    (transport.ts)
```

- The **configurator** ([`configure/`](../apps/web/app/(tools)/configure)) *emits* a `CatalogConfig`.
- The **playground** ([`playground/`](../apps/web/app/(tools)/playground)), **demo**
  ([`demo/`](../apps/web/app/(tools)/demo)), and the **exported code snippet** *consume* the
  same shape.
- [`buildSearchArguments()`](../packages/catalog-client/src/config.ts) turns that config into
  the exact object under `params.arguments.catalog` on the wire — dropping kit-only keys
  (`version`, `name`, `scope`), hoisting `scope.savedCatalogSlug` → `saved_catalog_slug`,
  and merging a cursor.

**Why it matters:** change the shape in one place ([`schemas/requests.ts`](../packages/catalog-client/src/schemas/requests.ts))
and it must flow through *all* of them — configurator UI, playground, exported code, and the
wire builder — or something visibly breaks. The config can't drift silently, because the
same object drives every surface. The JSON Schema
([`schema/catalog-config.schema.json`](../packages/catalog-client/schema/catalog-config.schema.json),
regenerated from zod on `pnpm build`) is what the preset tests validate `examples/*.json`
against, so presets can't drift from the contract either.

## Why lenient response schemas

Catalog **response** fields are **ML-inferred and drift over time** — a field present today
may be absent tomorrow, and shapes shift. So the response schemas
([`schemas/responses.ts`](../packages/catalog-client/src/schemas/responses.ts)) are
deliberately **lenient: every field is `.optional()` and every object `.passthrough()`.**
Parsing never throws on a missing or unknown field, and unknown keys survive. The **request**
schemas ([`schemas/requests.ts`](../packages/catalog-client/src/schemas/requests.ts)), by
contrast, are **strict** — your config is validated hard *before* the network call
(`INVALID_CONFIG`), because that's the input you control. Lenient out, strict in.

## Why no cache

Shopify's [usage guidelines](./compliance.md#no-caching) **forbid caching search results.**
So there is **no result cache anywhere in the kit** — the proxy
([`api/catalog/route.ts`](../apps/web/app/api/catalog/route.ts)) is `force-dynamic` and sets
`Cache-Control: no-store` on every response. When rate limits bite, the answer is a
**rate-limit-aware queue and backoff** (in [`transport.ts`](../packages/catalog-client/src/transport.ts)),
never a cache. The full compliance rationale — including the one sanctioned exception for
`like` image encoding — is in [compliance.md](./compliance.md).

## The auth tier ladder

Three tiers, two implemented ([api-reference.md](./api-reference.md#auth-tiers) has the wire
detail):

1. **Anonymous (keyless)** — the default. No credentials, lowest rate-limit tier, **cannot
   get increases**. Everything works keyless; this is what makes clone-and-go possible.
2. **Token (`client_credentials`)** — opt-in via env vars. `auth.ts` exchanges credentials
   for a short-lived JWT (~60-min TTL), **caches it**, and **refreshes 5 min early** with
   concurrent-refresh de-dup. Raises rate limits; nothing else changes.
3. **Signed (RFC 9421)** — spec'd by UCP, **not implemented** in the kit. Post-v1 backlog.

The ladder is a graceful climb: start keyless, add credentials when you hit `429`s, without
changing any calling code.

## How the web app proxy isolates secrets

Client components never touch credentials. Every catalog call from the browser goes through
the **server proxy** ([`api/catalog/route.ts`](../apps/web/app/api/catalog/route.ts)), which
reads `SHOPIFY_CATALOG_CLIENT_ID` / `SECRET` server-side via `getServerEnv()`, instantiates
the client, executes, and returns `{ok, data | error, meta}` with `no-store`. A module-level
client singleton keeps the JWT cache warm across requests. The browser sends a
`CatalogConfig`; the secrets stay on the server. The proxy also enforces a per-IP in-memory
rate limit so a public demo can't be farmed.

## What is deliberately NOT built

Several capabilities are **documented but intentionally unbuilt**, each with a status label —
so nobody wastes time looking for them:

| Capability | Status | Note |
|---|---|---|
| `placements: ["affiliate"]` | **Invite-only preview** | Affiliate placements aren't generally available; not wired. |
| Shop sign-in personalization | **Unreleased** | Buyer sign-in / personalized results not yet released by Shopify. |
| Signed tier (RFC 9421) | **Post-v1 backlog** | Spec'd, not implemented; client does anonymous + token only. |

These are tracked in the [configuration coverage matrix](./configuration.md#capability-coverage-matrix)
and the [auth section](./api-reference.md#auth-tiers). They're absent by decision, not
oversight.

## History and provenance

- **[docs/probe-findings.md](./probe-findings.md)** — the live-verified API behavior every
  design decision rests on. Re-probe with `pnpm probe --json` and update it whenever the API
  changes; don't relitigate a documented finding without re-probing.

---

_Verified against live probes: 2026-07-04._
