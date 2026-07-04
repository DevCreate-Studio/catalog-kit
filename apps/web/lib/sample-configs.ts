import type { CatalogConfig } from "catalog-kit";

/**
 * Inline sample configs for the playground's Search tool.
 *
 * Phase 5 replaces/augments these with the real presets from `examples/*.config.json`
 * (gift-finder, comparison-shopper, niche-marketplace, dupe-finder). Until then, these
 * four cover the search-mode matrix so the playground exercises every shape:
 * plain text, filtered, more-like-this (item ref), and multimodal (query + like).
 */
export interface SampleConfig {
  /** Dropdown label. */
  label: string;
  /** One-line description of what the sample demonstrates. */
  description: string;
  /** The config, pretty-printed into the editor when selected. */
  config: CatalogConfig;
}

export const SAMPLE_CONFIGS: SampleConfig[] = [
  {
    label: "Basic text search",
    description: "A plain keyword query across the Global Catalog.",
    config: {
      version: 1,
      scope: { type: "global" },
      query: "wireless headphones",
      pagination: { limit: 5 },
    },
  },
  {
    label: "Filtered search (price + rating + ships_to)",
    description:
      "Text query narrowed by availability, a max price (minor units), a minimum variant rating, and a shipping destination.",
    config: {
      version: 1,
      scope: { type: "global" },
      query: "running shoes",
      filters: {
        available: true,
        price: { max: 15000 },
        rating: { variant: { min: 4, min_count: 10 } },
        ships_to: { country: "US" },
      },
      pagination: { limit: 8 },
    },
  },
  {
    label: "More like this (like item ref)",
    description:
      "Similarity search from a product id. Paste a real id from a search result (Inspect / More like this fills this for you).",
    config: {
      version: 1,
      scope: { type: "global" },
      // Replace with a real product id (gid://shopify/p/…) from a search result.
      // `like` is always an ARRAY of {id} XOR {image}/{image_url} entries.
      like: [{ id: "gid://shopify/p/PASTE_A_REAL_PRODUCT_ID" }],
      pagination: { limit: 8 },
    },
  },
  {
    label: "Multimodal (query + like)",
    description:
      "A text query combined with a reference product id — both inputs are honored (neither is silently dropped).",
    config: {
      version: 1,
      scope: { type: "global" },
      query: "minimalist white sneakers",
      // Replace with a real product id from a search result.
      like: [{ id: "gid://shopify/p/PASTE_A_REAL_PRODUCT_ID" }],
      pagination: { limit: 8 },
    },
  },
];
