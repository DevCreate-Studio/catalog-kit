import type { CatalogConfig } from "catalog-kit";

/**
 * Render a complete, standalone TypeScript snippet that runs the given
 * {@link CatalogConfig} against the published `catalog-kit` package.
 *
 * The output is designed to compile and run as-is if pasted into a fresh
 * project that has `catalog-kit` installed and `AGENT_PROFILE_URL` set. It:
 *  - imports `createCatalogClient` from `"catalog-kit"`,
 *  - embeds the config inline as a typed `const config: CatalogConfig`,
 *  - creates a client from `process.env.AGENT_PROFILE_URL` plus optional
 *    `SHOPIFY_CATALOG_CLIENT_ID` / `SHOPIFY_CATALOG_CLIENT_SECRET` credentials,
 *  - runs `searchCatalog(config)` and logs the products.
 *
 * Pure and deterministic — no `undefined` ever appears in the emitted config
 * because it is produced from `JSON.stringify` of the (already canonical)
 * config object.
 */
export function generateSnippet(config: CatalogConfig): string {
  // JSON.stringify drops `undefined` keys, so the embedded literal is clean and
  // already 2-space indented; it drops in under a top-level `const` verbatim.
  const configLiteral = JSON.stringify(config, null, 2);

  return `import {
  createCatalogClient,
  type CatalogConfig,
} from "catalog-kit";

// The portable contract emitted by the catalog-kit configurator.
const config: CatalogConfig = ${configLiteral};

async function main() {
  const agentProfileUrl = process.env.AGENT_PROFILE_URL;
  if (!agentProfileUrl) {
    throw new Error(
      "Set AGENT_PROFILE_URL to your UCP agent profile URL. " +
        "See https://github.com/DevCreate-Studio/catalog-kit — docs/getting-started.md#agent-profile.",
    );
  }

  // Credentials are optional: omit them for keyless anonymous access (works for
  // dev). Provide them to opt into the higher-rate-limit token tier.
  const clientId = process.env.SHOPIFY_CATALOG_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CATALOG_CLIENT_SECRET;

  const client = createCatalogClient({
    agentProfileUrl,
    auth:
      clientId && clientSecret ? { clientId, clientSecret } : undefined,
  });

  const result = await client.searchCatalog(config);

  console.log(\`Tier: \${client.tier}\`);
  console.log(\`Products: \${result.products?.length ?? 0}\`);
  for (const product of result.products ?? []) {
    console.log("-", product.title ?? product.id ?? "(untitled)");
  }
  for (const message of result.messages ?? []) {
    console.log("message:", message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;
}
