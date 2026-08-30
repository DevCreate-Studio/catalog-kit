# AGENTS.md

Single source of truth for working in this repo. Editor pointer files (`CLAUDE.md`,
`.cursor/rules/catalog-kit.mdc`, `.github/copilot-instructions.md`) point here and
duplicate nothing. Keep this file current — see [The rule](#the-rule).

## What this repo is

`catalog-kit` is an MIT-licensed, agent-ready starter kit for the **Shopify Global
Catalog (UCP)** — clone to live cross-merchant product search in ~2 minutes, no API
key required. It is a pnpm monorepo: a framework-agnostic typed client
(`packages/catalog-client`, the `catalog-kit` workspace package — **not published to npm;
this is a clone-and-build starter**) plus a Next.js demo
app (`apps/web`) with landing page, configurator, playground, and demo storefront.

**Core principle — one config is the contract.** A single `CatalogConfig` JSON is
the portable contract that everything shares. The configurator *emits* it; the
playground, demo, and exported code *consume* it; and `buildSearchArguments()` in
`packages/catalog-client` turns it into the exact JSON-RPC wire payload. Change the
shape in one place and it must flow through all of them.

## Commands

Run from the repo root. Node 24 recommended (20.19+ / 22.12+ / 24 minimum), pnpm 11.

| Command | What it does | Network |
|---|---|---|
| `pnpm dev` | Runs the Next.js app (`apps/web`) on http://localhost:3000. | No (until you search) |
| `pnpm test` | Vitest across all packages — `catalog-kit` against **recorded fixtures**, `apps/web` unit tests for the config store/hash (pure logic + jsdom, no network). No network, no keys. Must pass in CI with no secrets. | **Never** |
| `pnpm lint` | `catalog-kit` type-checks (`tsc --noEmit`); `apps/web` runs `eslint`. | **Never** |
| `pnpm build` | Builds all packages (tsup → dist) and regenerates `catalog-config.schema.json` from zod. | **Never** |
| `pnpm --filter catalog-kit check:types` | Runs `attw --pack . --profile node16` against the built `catalog-kit` package — verifies the dual ESM/CJS `exports` map (incl. `.d.cts`) resolves correctly under node16 and bundler resolution. Run after `build`. Not run automatically by `pnpm build`. | **Never** |
| `pnpm probe` | Live API probes against the real Catalog endpoint; verifies request/response shapes. Add `--json` for a machine-readable report object. | **Yes** |
| `pnpm fixtures` | Re-records the test fixtures from the live API (overwrites `packages/catalog-client/fixtures/*.json`). | **Yes** |
| `pnpm llms` | Regenerates `llms.txt` + `llms-full.txt` from `docs/` and README. | No |
| `pnpm taxonomy` | Regenerates the category-picker dataset from Shopify's Standard Product Taxonomy (pinned tag `TAXONOMY_TAG` in the script): `apps/web/public/taxonomy.json` (+ `lib/taxonomy-meta.json`, `lib/attribute-values.json`). `--check` fails on drift; run after bumping the pin. | **Yes** (downloads the taxonomy dist; committed output means CI runs `--check` offline) |
| `node packages/catalog-client/test/live-smoke.mjs` | **Pre-release gate.** Runs the three tools (search → lookup → get_product) keyless against the built dist and the live endpoint. Build first (`pnpm --filter catalog-kit build`); prints one line per call, exits non-zero on any failure. Not in vitest/CI. | **Yes** |

`probe`, `fixtures`, and the live-smoke gate need `AGENT_PROFILE_URL` set (the smoke
script falls back to Shopify's published sample profile) and reach the network. Everything
in CI (`test`, `lint`, `build`) runs fully offline against fixtures.

## Repo map

Legend: **[now]** exists today · **[P2]** created in Phase 2 (client src) ·
**[P3+]** created in Phase 3 or later (apps/web, docs, presets).

```
catalog-kit/
├── AGENTS.md                          # this file — agent source of truth [now]
├── CLAUDE.md                          # pointer → AGENTS.md [now]
├── README.md                          # the sell [P6]
├── LICENSE                            # MIT [now]
├── CHANGELOG.md · CONTRIBUTING.md · CODE_OF_CONDUCT.md · SECURITY.md · SHOWCASE.md [now]
├── llms.txt · llms-full.txt           # generated from docs/ (pnpm llms) [now]
├── .env.example                       # AGENT_PROFILE_URL + optional token creds [now]
├── package.json · pnpm-workspace.yaml · tsconfig.base.json [now]
├── .github/
│   ├── workflows/ci.yml [now]
│   ├── ISSUE_TEMPLATE/bug.yml · feature.yml · preset.yml [now]
│   ├── PULL_REQUEST_TEMPLATE.md · FUNDING.yml [now]
│   └── copilot-instructions.md        # pointer → AGENTS.md [now]
├── .cursor/rules/catalog-kit.mdc      # pointer → AGENTS.md [now]
├── .claude/skills/build-catalog-app/SKILL.md   # Claude Code skill: idea → CatalogConfig → page [now]
├── packages/catalog-client/
│   ├── src/
│   │   ├── index.ts                   # public exports only [P2]
│   │   ├── endpoints.ts               # ALL URLs (they change) + UCP_SPEC_VERSION pin [P2]
│   │   ├── auth.ts                    # tier ladder: anonymous | token (cache+refresh) [P2]
│   │   ├── transport.ts               # JSON-RPC tools/call, profile injection, retry/backoff [P2]
│   │   ├── config.ts                  # CatalogConfig type + buildSearchArguments() [P2]
│   │   ├── tools/search.ts · lookup.ts · get-product.ts [P2]
│   │   ├── schemas/requests.ts · responses.ts   # zod; responses lenient [P2]
│   │   └── errors.ts                  # CatalogError with jsonrpc error + messages[] [P2]
│   ├── test/*.test.ts                 # Vitest against fixtures [P2]
│   ├── fixtures/*.json                # recorded live responses [now]
│   ├── schema/catalog-config.schema.json  # generated from zod [P2]
│   └── package.json                   # the `catalog-kit` workspace package (private, not published) [now]
├── apps/web/                          # Next.js App Router + shadcn/ui [now]
│   ├── app/
│   │   ├── page.tsx                   # landing: pitch, live teaser, 5-step strip [now]
│   │   ├── (tools)/layout.tsx         # shared SiteHeader for the tool pages (route group, no URL change) [now]
│   │   ├── (tools)/configure/page.tsx # 3-panel configurator [P4]
│   │   ├── (tools)/playground/page.tsx # raw config → response inspector [P3]
│   │   ├── (tools)/demo/page.tsx      # preset-driven results storefront [P5]
│   │   ├── agent-profile.json/route.ts  # serves the UCP profile publicly [P3]
│   │   └── api/catalog/route.ts       # server proxy — secrets stay server-side [P3]
│   ├── components/ui/                 # shadcn/ui primitives (button, card, input, select, switch, slider, badge, tabs, tooltip, sonner, textarea, label, separator, popover) [now]
│   ├── components/configurator/category-picker.tsx  # searchable + browsable taxonomy category picker [now]
│   ├── components/configurator/attribute-values.tsx # canonical Color/Size/Target-gender value multi-select [now]
│   ├── lib/taxonomy.ts                # taxonomy lazy-load + cache + pure search/rank helpers [now]
│   ├── lib/taxonomy-meta.json · lib/attribute-values.json  # generated by pnpm taxonomy [now]
│   ├── public/taxonomy.json           # generated compact category dataset (pnpm taxonomy) [now]
│   ├── components.json                # shadcn/ui config (base-nova preset) [now]
│   └── .env.example                   # copy of root .env.example; app reads apps/web/.env.local [now]
├── examples/*.config.json             # gift-finder, comparison-shopper, niche-marketplace, dupe-finder [P5]
├── profile/agent-profile.json         # sample UCP profile + hosting notes [now]
├── docs/
│   ├── getting-started.md · configuration.md · api-reference.md [now]
│   ├── recipes.md · deployment.md · compliance.md [now]
│   ├── agent-guide.md · architecture.md · troubleshooting.md [now]
│   ├── probe-findings.md              # live-verified API behavior [now]
│   └── upgrade-2026-08-25.md          # UCP 2026-08-25 upgrade inventory + flip checklist [now]
├── internal/                          # git-ignored working docs (plans, launch drafts) — never shipped
└── scripts/
    ├── probe.mjs                      # live probes (--json) [now]
    ├── record-fixtures.mjs            # refresh test fixtures [now]
    ├── build-llms-txt.mjs             # docs/ → llms.txt + llms-full.txt (--json, --check) [now]
    └── build-taxonomy.mjs             # Shopify taxonomy dist → picker dataset (--json, --check) [now]
```

## API gotchas (live-verified 2026-07-04)

All verified against the live endpoint; source of truth is `docs/probe-findings.md`.
Do not relitigate these without re-probing (`pnpm probe --json`).

**Endpoint & envelope**
- Endpoint: `POST https://catalog.shopify.com/api/ucp/mcp` (JSON-RPC 2.0, MCP binding).
- Every request is a `tools/call`. Tool payload goes under **`params.arguments.catalog`**
  (the `catalog` wrapper is required — args are NOT placed directly under `arguments`).
- The agent profile URL is injected into **`params.arguments.meta['ucp-agent'].profile`**
  and is **required on every request**.

**Auth**
- **Keyless anonymous works and is the default** — no `Authorization` header, catalog
  tools at the lowest rate-limit tier. Token tier (Dev Dashboard `client_credentials`
  JWT, 60-min TTL, higher limits) is **optional, opt-in via env vars**. Keyless cannot
  get rate-limit increases.

**Profile hosting**
- The profile URL **must be served with `Content-Type: application/json`**. A GitHub
  gist raw URL serves `text/plain` and is **rejected** (`profile_malformed` /
  "Invalid content type"). Host on your own deploy (`apps/web` serves
  `/agent-profile.json`), a CDN, or an object store.

**Filters & fields**
- Prices are in **minor units**: `{"amount":2500,"currency":"USD"}` = $25.00.
- `pagination.limit` **clamps at 50 silently** (`limit:51` → HTTP 200, 50 products,
  no error, no message).
- `categories` accept **string GIDs only** (`"gid://shopify/TaxonomyCategory/…"`). The
  object `{id}` form is now a **hard tool error** (was previously a silent 0-results).
- `categories` (and filters generally) do **not stand alone**: a search with filters but
  no `query`/`like` errors with "A query is required" (live-verified 2026-07-04 while
  building the niche-marketplace preset — it pairs categories with a query).
- `rating` shape is `{variant:{min,min_count}}`. Product ratings come back as
  `{value, scale_min, scale_max, count}`.
- `ships_to` is an **object** `{country:"US"}`; `ships_from` is an **array**
  `[{country:"CA"}]`.
- Supported attribute names are exactly **Color, Size, Target gender**. Unsupported
  names are ignored and surface in `messages[]` (not an error).

**`like` (similarity / multimodal)**
- `like` is **always an array**; each element is one of two mutually exclusive shapes:
  `{id}` (item ref) **XOR** `{image:{content_type, data}}` (inline base64). Bare
  strings, non-array objects, and public image URLs are all **rejected** by the API.
- The kit's client resolves a config `image_url` → base64 at request time (fetch,
  size-capped ~2 MB) and passes `{id}` / already-base64 shapes through untouched. This
  transient encode for one search request is a sanctioned exception to the no-image-download
  rule (see Compliance).
- Multimodal (`query` + `like`) works with either `like` shape; neither input is silently dropped.

**Results & errors**
- Nonsense text queries return **fuzzy fallbacks (~5 results), never empty**. To test a
  true empty state, use an **impossible filter** (e.g. `price.max:1`), not a bad query.
- **Two error shapes:** (1) transport/discovery — top-level JSON-RPC `error` at **HTTP 422**
  (e.g. `-32001 "UCP discovery failed"`); (2) tool-argument — **HTTP 200** with
  `result.isError === true` and `result.content`. The client must check **both**.
- `tools/list` returns **422 keyless** — do not rely on it. Call the three catalog tools
  (`search_catalog`, `lookup_catalog`, `get_product`) directly by name.
- **Anonymous rate limiting is real.** Throttling surfaces as HTTP 429 **and** as a
  JSON-RPC `{"code":-32600,"message":"Invalid Request","data":"Rate limit exceeded"}`
  body on an HTTP 200. Retry both with backoff.
- No `x-ratelimit-*`/`retry-after` headers are exposed keyless. `x-request-id` is useful
  for support tickets.

## Compliance rules (Shopify usage guidelines — never violate)

- **No caching of search results.** The server proxy sets `Cache-Control: no-store` and
  route handlers are `force-dynamic`. There is no results cache anywhere in the kit —
  a rate-limit-aware queue instead.
- **No downloading or re-hosting product images.** Hot-link images from Shopify's CDN and
  render them in real time. The **one sanctioned exception** is the transient base64 encode
  of a *reference* image for a `like` search request (the API requires inline bytes and
  rejects URLs).
- **Endpoints may change.** All URLs live **only** in
  `packages/catalog-client/src/endpoints.ts` (plus `UCP_SPEC_VERSION`). Never hardcode a
  Catalog URL anywhere else.

## Conventions

- **Lenient response schemas.** Response fields are ML-inferred and shapes drift, so every
  response field is `.optional()` and every object uses `.passthrough()`. Unknown fields
  must survive parsing.
- **Secrets never reach client components.** All catalog calls go through the server proxy
  route (`apps/web/app/api/catalog/route.ts`); credentials are read server-side only.
- **Verified-date line.** Every docs page ends with `_Verified against shopify.dev and live
  probes: YYYY-MM-DD._` — update the date whenever you re-verify.
- **Conventional commits** (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `ci:`, scoped
  where useful e.g. `feat(client):`).
- **Not published to npm.** This is a clone-and-build starter; the client is a private
  workspace package. No changesets, no release workflow.
- **Capability coverage matrix** (plan Part A6) is the definition of done for surface area —
  every capability must be toggleable in the configurator, exercisable in the playground,
  and documented.

## Playbooks

File-touch lists, in order. Don't skip the doc/test step — it's part of the change.

**Add a filter to the configurator**
1. `packages/catalog-client/src/config.ts` — add the field to `CatalogConfig` and its
   handling in `buildSearchArguments()`.
2. `packages/catalog-client/src/schemas/requests.ts` — add the zod shape (match the probed
   wire shape exactly).
3. `pnpm build` — regenerates `schema/catalog-config.schema.json` from zod.
4. `apps/web/components/configurator/filters-panel.tsx` — add the toggle row + controls.
5. `docs/configuration.md` — document shape, example payload, gotchas.
6. If the filter needed a new probe to confirm its shape, record a fixture (`pnpm fixtures`).

**Add a preset**
1. `examples/<name>.config.json` — author it; it must validate against
   `packages/catalog-client/schema/catalog-config.schema.json` (the presets vitest globs
   `examples/*.json` and asserts this — presets can't drift from the contract).
2. `apps/web/app/(tools)/demo/page.tsx` — add a preset card.
3. `README.md` — add a row to the "what you can build" preset table.

**Refresh fixtures**
1. `pnpm fixtures` — re-records from the live API.
2. `pnpm test` — confirm the suite still passes against the new fixtures.
3. Update the "Verified against live probes" date in `docs/probe-findings.md`.

**Re-verify API behavior**
- `pnpm probe --json` — runs the live probes and emits the machine-readable report. Update
  `docs/probe-findings.md` (table + verified date) with anything that changed.

## The rule

Any change to commands, structure, or conventions must update `AGENTS.md` **in the same
commit**. Pointer files never carry content — they only point here.
