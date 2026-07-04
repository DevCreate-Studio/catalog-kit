import type { CatalogConfig } from "catalog-kit";
import giftFinder from "../../../../examples/gift-finder.config.json";
import comparisonShopper from "../../../../examples/comparison-shopper.config.json";
import nicheMarketplace from "../../../../examples/niche-marketplace.config.json";
import dupeFinder from "../../../../examples/dupe-finder.config.json";

/**
 * The four shipped presets, imported statically from `examples/*.config.json`
 * (the single source — the demo never re-declares a config, so it can't drift
 * from the schema-validated files that `presets.test.ts` guards).
 *
 * Each entry adds a title, one-line description, and a few "feature badges"
 * naming the key config capabilities it exercises — the demo constantly
 * teaches the contract.
 */
export interface DemoPreset {
  slug: string;
  title: string;
  description: string;
  /** Small capability badges, e.g. "image search", "offer view". */
  badges: string[];
  config: CatalogConfig;
}

export const DEMO_PRESETS: DemoPreset[] = [
  {
    slug: "gift-finder",
    title: "Gift finder",
    description: "Well-reviewed, in-budget gift ideas driven by buyer intent.",
    badges: ["buyer intent", "price cap", "rating gate", "in stock"],
    config: giftFinder as CatalogConfig,
  },
  {
    slug: "comparison-shopper",
    title: "Comparison shopper",
    description: "The same product across many sellers, ranked as offers.",
    badges: ["offer view", "ships to US", "buyer context"],
    config: comparisonShopper as CatalogConfig,
  },
  {
    slug: "niche-marketplace",
    title: "Niche marketplace",
    description: "A category-scoped storefront within one taxonomy branch.",
    badges: ["category-scoped", "price tier"],
    config: nicheMarketplace as CatalogConfig,
  },
  {
    slug: "dupe-finder",
    title: "Dupe finder",
    description: "Visually similar products from a single reference image.",
    badges: ["image search", "more-like-this"],
    config: dupeFinder as CatalogConfig,
  },
];
