import { describe, expect, it } from "vitest";
import {
  breadcrumb,
  buildIndex,
  scoreNode,
  searchTaxonomy,
  type TaxonomyNode,
} from "../taxonomy";

/** A tiny fixture tree: Electronics > Audio > Headphones, plus a decoy. */
const NODES: TaxonomyNode[] = [
  { gid: "gid://shopify/TaxonomyCategory/el", name: "Electronics", parentGid: null, level: 0 },
  { gid: "gid://shopify/TaxonomyCategory/el-1", name: "Audio", parentGid: "gid://shopify/TaxonomyCategory/el", level: 1 },
  { gid: "gid://shopify/TaxonomyCategory/el-1-1", name: "Headphones", parentGid: "gid://shopify/TaxonomyCategory/el-1", level: 2 },
  { gid: "gid://shopify/TaxonomyCategory/aa", name: "Apparel & Accessories", parentGid: null, level: 0 },
  { gid: "gid://shopify/TaxonomyCategory/aa-1", name: "Headbands", parentGid: "gid://shopify/TaxonomyCategory/aa", level: 1 },
];

const index = buildIndex(NODES);

describe("buildIndex", () => {
  it("indexes by gid and groups children under parents (roots under null)", () => {
    expect(index.byGid.size).toBe(5);
    expect(index.roots.map((n) => n.name)).toEqual([
      "Apparel & Accessories",
      "Electronics",
    ]);
    expect(
      index.childrenOf.get("gid://shopify/TaxonomyCategory/el")?.map((n) => n.name),
    ).toEqual(["Audio"]);
  });
});

describe("breadcrumb", () => {
  it("walks the parent chain into a ' > ' path", () => {
    expect(
      breadcrumb("gid://shopify/TaxonomyCategory/el-1-1", index.byGid),
    ).toBe("Electronics > Audio > Headphones");
  });

  it("returns just the name for a root", () => {
    expect(breadcrumb("gid://shopify/TaxonomyCategory/el", index.byGid)).toBe(
      "Electronics",
    );
  });
});

describe("scoreNode", () => {
  it("ranks exact > prefix > word-boundary > substring > fullName-only", () => {
    const exact = scoreNode("Headphones", "Electronics > Audio > Headphones", "headphones");
    const prefix = scoreNode("Headphones", "…", "head");
    const substring = scoreNode("Headphones", "…", "phone");
    const fullNameOnly = scoreNode("Audio", "Electronics > Audio", "electronics");
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(fullNameOnly);
    expect(fullNameOnly).toBeGreaterThan(0);
  });

  it("is case- and diacritic-insensitive", () => {
    expect(scoreNode("Café", "Café", "cafe")).toBeGreaterThan(0);
    expect(scoreNode("HEADPHONES", "…", "headphones")).toBe(1000);
  });

  it("returns 0 for no match and for an empty query", () => {
    expect(scoreNode("Headphones", "…", "shoes")).toBe(0);
    expect(scoreNode("Headphones", "…", "")).toBe(0);
  });
});

describe("searchTaxonomy", () => {
  it("surfaces the deepest exact match first with its breadcrumb", () => {
    const results = searchTaxonomy(index, "headphones");
    expect(results[0].node.name).toBe("Headphones");
    expect(results[0].fullName).toBe("Electronics > Audio > Headphones");
  });

  it("returns [] for an empty query and caps at the limit", () => {
    expect(searchTaxonomy(index, "   ")).toEqual([]);
    expect(searchTaxonomy(index, "head", 1)).toHaveLength(1);
  });

  it("breaks score ties by shallower level", () => {
    // "head" prefix-matches both "Headphones" (level 2) and "Headbands" (level 1).
    const results = searchTaxonomy(index, "head");
    const names = results.map((r) => r.node.name);
    expect(names).toContain("Headbands");
    expect(names).toContain("Headphones");
    expect(names.indexOf("Headbands")).toBeLessThan(names.indexOf("Headphones"));
  });
});
