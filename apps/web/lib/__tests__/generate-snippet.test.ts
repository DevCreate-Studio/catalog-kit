import { describe, expect, it } from "vitest";
import type { CatalogConfig } from "catalog-kit";
import { generateSnippet } from "../generate-snippet";

const giftFinder: CatalogConfig = {
  version: 1,
  name: "gift-finder",
  scope: { type: "global" },
  query: "cozy gift under 25",
  context: { intent: "gift" },
  filters: {
    available: true,
    price: { max: 2500 },
    rating: { variant: { min: 4 } },
  },
  pagination: { limit: 12 },
};

describe("generateSnippet", () => {
  it("imports createCatalogClient and the CatalogConfig type from catalog-kit", () => {
    const snippet = generateSnippet(giftFinder);
    expect(snippet).toContain('from "catalog-kit"');
    expect(snippet).toContain("createCatalogClient");
    expect(snippet).toContain("type CatalogConfig");
  });

  it("embeds the config inline as a typed const", () => {
    const snippet = generateSnippet(giftFinder);
    expect(snippet).toContain("const config: CatalogConfig =");
    // The embedded literal contains the real values from the config.
    expect(snippet).toContain('"cozy gift under 25"');
    expect(snippet).toContain('"intent": "gift"');
    expect(snippet).toContain('"max": 2500');
  });

  it("never emits `undefined` inside the embedded config literal", () => {
    const snippet = generateSnippet(giftFinder);
    const match = snippet.match(
      /const config: CatalogConfig = ([\s\S]*?);\n\nasync function main/,
    );
    expect(match).not.toBeNull();
    // The embedded config JSON literal must be clean (JSON has no `undefined`).
    expect(match![1]).not.toContain("undefined");
  });

  it("wires up AGENT_PROFILE_URL and optional credentials", () => {
    const snippet = generateSnippet(giftFinder);
    expect(snippet).toContain("process.env.AGENT_PROFILE_URL");
    expect(snippet).toContain("SHOPIFY_CATALOG_CLIENT_ID");
    expect(snippet).toContain("SHOPIFY_CATALOG_CLIENT_SECRET");
  });

  it("runs searchCatalog and logs the products", () => {
    const snippet = generateSnippet(giftFinder);
    expect(snippet).toContain("client.searchCatalog(config)");
    expect(snippet).toContain("result.products");
  });

  it("round-trips the embedded config back to a deep-equal object", () => {
    const snippet = generateSnippet(giftFinder);
    const match = snippet.match(
      /const config: CatalogConfig = ([\s\S]*?);\n\nasync function main/,
    );
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    expect(parsed).toEqual(giftFinder);
  });
});
