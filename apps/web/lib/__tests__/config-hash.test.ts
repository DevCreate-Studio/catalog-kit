import { describe, expect, it } from "vitest";
import type { CatalogConfig } from "catalog-kit";
import { decodeConfigHash, encodeConfigHash } from "../config-hash";

/** Exercises the full field surface: filters, like, context, pagination, view. */
const fullFeatured: CatalogConfig = {
  version: 1,
  name: "full-featured",
  scope: { type: "storefront", storeDomain: "shop.example.com" },
  query: "minimalist white sneakers",
  like: [{ id: "gid://shopify/Product/1" }],
  context: {
    intent: "gift",
    address_country: "US",
    address_region: "CA",
    postal_code: "94107",
    language: "en",
    currency: "USD",
  },
  filters: {
    available: true,
    price: { min: 1000, max: 15000 },
    condition: ["new", "secondhand"],
    ships_to: { country: "US", region: "CA", postal_code: "94107" },
    ships_from: [{ country: "US" }, { country: "CA" }],
    shop_ids: ["1", "2", "3"],
    attributes: [{ name: "Color", values: ["red", "blue"] }],
    rating: { variant: { min: 4, min_count: 10 } },
    price_tier: ["low", "medium"],
    categories: ["gid://shopify/TaxonomyCategory/ap"],
  },
  pagination: { limit: 24 },
  view: "offer",
};

describe("encodeConfigHash / decodeConfigHash — round-trip", () => {
  it("deep-equals a full-featured config after encode -> decode", () => {
    const hash = encodeConfigHash(fullFeatured);
    const decoded = decodeConfigHash(hash);
    expect(decoded).toEqual(fullFeatured);
  });

  it("produces a URL-safe string with no padding and no +/= characters", () => {
    const hash = encodeConfigHash(fullFeatured);
    expect(hash).not.toMatch(/[+/=]/);
  });

  it("round-trips a minimal valid config", () => {
    const minimal: CatalogConfig = {
      version: 1,
      scope: { type: "global" },
      query: "boots",
    };
    const hash = encodeConfigHash(minimal);
    expect(decodeConfigHash(hash)).toEqual(minimal);
  });
});

describe("decodeConfigHash — failure modes never throw", () => {
  it("returns null for garbage input", () => {
    expect(decodeConfigHash("!!!not-base64!!!")).toBeNull();
  });

  it("returns null for a truncated hash", () => {
    const hash = encodeConfigHash(fullFeatured);
    expect(decodeConfigHash(hash.slice(0, hash.length - 10))).toBeNull();
  });

  it("returns null for valid base64url that decodes to invalid JSON", () => {
    const bytes = new TextEncoder().encode("{not valid json");
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    const base64url = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(decodeConfigHash(base64url)).toBeNull();
  });

  it("returns null for valid base64url/JSON that fails catalogConfigSchema", () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ version: 2, foo: "bar" }));
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    const base64url = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(decodeConfigHash(base64url)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(decodeConfigHash("")).toBeNull();
  });

  it("returns null for a config missing both query and like", () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({ version: 1, scope: { type: "global" } }),
    );
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    const base64url = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(decodeConfigHash(base64url)).toBeNull();
  });
});
