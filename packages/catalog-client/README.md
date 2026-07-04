# catalog-kit

Typed client for the Shopify Global Catalog (UCP) — search, lookup, and fetch products
across every merchant on the network, keyless by default, no API key required.

## Getting it

catalog-kit is a **clone-and-build starter, not an npm package** — clone the
[repo](https://github.com/DevCreate-Studio/catalog-kit) and this client is the
`catalog-kit` workspace package the demo app already consumes. To use it in a separate
project, copy `packages/catalog-client` in, or add the repo as a git dependency.

Dual ESM + CJS, runtime-agnostic — uses only the global `fetch`, so it runs on Node,
Cloudflare Workers, and edge runtimes unchanged.

## Usage

```ts
import { createCatalogClient, type CatalogConfig } from "catalog-kit";

// The portable contract that drives a search — one shape, every tool.
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

// No `auth` → keyless anonymous (the default). Add { clientId, clientSecret } for the token tier.
const client = createCatalogClient({
  agentProfileUrl: process.env.AGENT_PROFILE_URL!,
});

const result = await client.searchCatalog(config);

console.log(`Tier: ${client.tier}`);
console.log(`Products: ${result.products?.length ?? 0}`);
```

A reachable `AGENT_PROFILE_URL` is required on every call — see
[Getting started § The agent profile](https://github.com/DevCreate-Studio/catalog-kit/blob/main/docs/getting-started.md#the-agent-profile)
for what it is and how to host one.

## Docs

- [Getting started](https://github.com/DevCreate-Studio/catalog-kit/blob/main/docs/getting-started.md)
- [API reference](https://github.com/DevCreate-Studio/catalog-kit/blob/main/docs/api-reference.md)
- [Configuration (`CatalogConfig`)](https://github.com/DevCreate-Studio/catalog-kit/blob/main/docs/configuration.md)
- [Full repo](https://github.com/DevCreate-Studio/catalog-kit)

## License

MIT
