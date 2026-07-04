# Building with AI agents

`catalog-kit` is a first-class agent workspace. This page is for two audiences:

- **Humans pointing a coding agent at this repo** — clone it, hand your agent one of the
  prompts below, and it can build a working app on the Shopify Global Catalog (UCP) without
  you explaining the wire protocol.
- **Agent developers using the client _inside_ an agent** — the catalog client is agent
  infrastructure. The upstream surface is an MCP server; the client wraps it into a typed,
  compliant tool you can hand your own agent.

## Why this repo is agent-ready

The repo ships machine-checkable artifacts so an agent can build **and verify** without you
in the loop, and mostly without a network or keys:

| Artifact | What it gives an agent |
| --- | --- |
| [`AGENTS.md`](../AGENTS.md) (root) | The single source of truth: repo map, commands, the live-verified API gotchas, and file-touch playbooks. Read this first. |
| `CLAUDE.md`, `.cursor/rules/catalog-kit.mdc`, `.github/copilot-instructions.md` | Editor pointer files — three lines each, pointing at `AGENTS.md`. No duplicated content, no drift, so every agent reads the same truth. |
| [`.claude/skills/build-catalog-app/SKILL.md`](../.claude/skills/build-catalog-app/SKILL.md) | A bundled Claude Code skill that turns an app idea into a valid `CatalogConfig` and a working page. |
| [`catalog-config.schema.json`](../packages/catalog-client/schema/catalog-config.schema.json) | JSON Schema generated from zod — validate a config **without running any code**. |
| `packages/catalog-client/fixtures/*.json` | Recorded live responses. The full test suite runs offline against them — **no keys, no network**. |
| `scripts/*.mjs --json` | `probe.mjs` and this script emit deterministic machine-readable output for agents to parse. |
| [`llms.txt`](../llms.txt) / [`llms-full.txt`](../llms-full.txt) | The whole docs set, LLM-ingestible per llmstxt.org. |

The load-bearing idea: **one `CatalogConfig` JSON is the contract.** The configurator emits
it, the playground/demo/exported code consume it, and `buildSearchArguments()` turns it into
the exact JSON-RPC payload. An agent that produces a valid config has produced a working app.

## Three copy-paste prompts

Each is self-contained — paste it into your agent as-is.

**(a) From scratch — clone and build.** For a fresh agent with no clone yet:

```text
Clone https://github.com/DevCreate-Studio/catalog-kit and read AGENTS.md, then build me
a gift-finder that surfaces well-reviewed products under a budget on the Shopify Global
Catalog. Use the configurator's CatalogConfig contract as the single source of truth, and
validate every config you produce against packages/catalog-client/schema/catalog-config.schema.json
before wiring it into a page. Run `pnpm lint && pnpm test && pnpm build` before you call it done.
```

**(b) Generate a preset.** For an existing clone — produce and validate one config:

```text
In this catalog-kit clone, generate a new CatalogConfig preset for a "sustainable outdoor gear"
niche marketplace. Start from the nearest example in examples/ (niche-marketplace.config.json),
keep version:1 and a descriptive name, and honor the API gotchas in AGENTS.md (categories are
string GIDs; filters need a query or like; prices are minor units; limit ≤ 50). Write it to
examples/<name>.config.json and validate it against packages/catalog-client/schema/catalog-config.schema.json
with ajv. The presets vitest (apps/web/lib/__tests__/presets.test.ts) must stay green.
```

**(c) Add a feature.** Extend the demo with a new config-driven page:

```text
In this catalog-kit clone, add a new page at apps/web/app/(tools)/deals/page.tsx that renders a
"today's deals" storefront. Copy apps/web/app/(tools)/demo/page.tsx as the template and drive it from
a new CatalogConfig (validate it against the JSON Schema first). All catalog calls must go
through the existing POST /api/catalog proxy — never call the endpoint from a client component
(secrets and no-store live server-side). Follow the "add a preset" playbook in AGENTS.md and
run `pnpm lint && pnpm test && pnpm build`.
```

## For agent builders: the client is agent infrastructure

The Global Catalog's upstream surface **is an MCP server** (`tools/call` over JSON-RPC). The
catalog client wraps that surface into a typed, retrying, compliance-aware function — exactly
the shape you want to expose as a tool to your own agent. Wrap `searchCatalog` (or the
higher-level `client.searchCatalog`) in a tool definition and let your agent drive it:

```ts
import { createCatalogClient, catalogConfigSchema, type CatalogConfig } from "catalog-kit";

// One client, bound to your hosted agent profile (keyless anonymous by default).
const catalog = createCatalogClient({
  agentProfileUrl: "https://your-app.example.com/agent-profile.json",
});

// A tool your agent can call. `input` is model-generated, so validate it against the
// generated schema before it ever reaches the wire.
async function searchCatalogTool(input: unknown) {
  const parsed = catalogConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "invalid CatalogConfig", issues: parsed.error.issues };
  }
  const config: CatalogConfig = parsed.data;
  const result = await catalog.searchCatalog(config);
  // Do NOT cache result; hot-link result image URLs — never re-host. (Compliance.)
  return { ok: true as const, products: result.products, messages: result.messages };
}
```

The same rules that apply to a human integration apply to an agent:

- **Keyless anonymous is the default tier** — no API key. Only add Dev Dashboard credentials
  to raise rate limits.
- **A hosted agent profile is required on every request** and must be served with
  `Content-Type: application/json` (see the gotcha in [`AGENTS.md`](../AGENTS.md)). The client
  injects it for you; you just supply a valid URL.
- **Compliance rules bind agents too:** never cache search results, and hot-link product
  images from Shopify's CDN rather than downloading or re-hosting them. See
  [compliance](./compliance.md).

## Validating configs mechanically

The JSON Schema is generated from the same zod schema the client enforces, so a config that
passes the schema will build the correct wire payload. Validate any config with one ajv command
— no code execution, no network:

```bash
npx ajv-cli validate \
  -s packages/catalog-client/schema/catalog-config.schema.json \
  -d examples/gift-finder.config.json
```

The repo's own guard is the presets test — copy its pattern to validate configs in your suite:

```ts
import { catalogConfigSchema } from "catalog-kit";
const result = catalogConfigSchema.safeParse(config);
if (!result.success) throw new Error(JSON.stringify(result.error.issues, null, 2));
```

`apps/web/lib/__tests__/presets.test.ts` runs exactly this over every `examples/*.config.json`,
so shipped presets can never drift from the contract.

## llms.txt / llms-full.txt

- **`llms.txt`** is an llmstxt.org index: an H1, a one-line summary, then a curated list of the
  docs and optional references with one-line descriptions. It points an LLM at the right doc.
- **`llms-full.txt`** is the whole corpus concatenated — README + AGENTS.md + every doc — for
  agents that prefer one paste over crawling links.

Both are **generated and committed**. Regenerate them after editing docs:

```bash
pnpm llms
```

The generator (`scripts/build-llms-txt.mjs`) is deterministic (stable ordering, no timestamps),
and CI runs `node scripts/build-llms-txt.mjs --check` to fail the build if the committed files
drift from the docs.

---

_Verified against live probes: 2026-07-04._
