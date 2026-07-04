import { z } from "zod";

/**
 * Lenient response schemas for the Shopify Global Catalog (UCP).
 *
 * Response fields are ML-inferred and the shapes drift over time (see AGENTS.md
 * → Conventions and docs/probe-findings.md), so this file is deliberately loose:
 * **every object `.passthrough()`, every field `.optional()`.** Parsing must
 * never throw on an unknown or missing field — unknown keys survive the round
 * trip and the inferred types are intentionally wide. These schemas exist to
 * give consumers ergonomic, typed access to the common fields, not to police the
 * wire. Treat every property as possibly-absent.
 *
 * Shapes are taken from the recorded fixtures, not guessed.
 */

/** A money amount in minor units (`{amount:2500,currency:"USD"}` = $25.00). */
export const moneySchema = z
  .object({
    amount: z.number().optional(),
    currency: z.string().optional(),
  })
  .passthrough();

/** A product's rating summary (`{value, scale_min, scale_max, count}`). */
export const ratingSchema = z
  .object({
    value: z.number().optional(),
    scale_min: z.number().optional(),
    scale_max: z.number().optional(),
    count: z.number().optional(),
  })
  .passthrough();

/** A media entry (image/video) — hot-linked from Shopify's CDN, never re-hosted. */
export const mediaSchema = z
  .object({
    type: z.string().optional(),
    url: z.string().optional(),
    alt_text: z.string().optional(),
  })
  .passthrough();

/** A product variant. Everything optional — shapes drift. */
export const variantSchema = z
  .object({
    id: z.string().optional(),
    title: z.string().optional(),
    price: moneySchema.optional(),
    availability: z.object({}).passthrough().optional(),
    media: z.array(mediaSchema).optional(),
    seller: z.object({}).passthrough().optional(),
    checkout_url: z.string().optional(),
    rating: ratingSchema.optional(),
    condition: z.array(z.string()).optional(),
  })
  .passthrough();

/** A catalog product. Deliberately loose — only `id`/`title` are commonly relied on. */
export const productSchema = z
  .object({
    id: z.string().optional(),
    title: z.string().optional(),
    description: z.object({}).passthrough().optional(),
    rating: ratingSchema.optional(),
    metadata: z.object({}).passthrough().optional(),
    media: z.array(mediaSchema).optional(),
    variants: z.array(variantSchema).optional(),
    price_range: z
      .object({ min: moneySchema.optional(), max: moneySchema.optional() })
      .passthrough()
      .optional(),
    selected: z.array(z.unknown()).optional(),
  })
  .passthrough();

/** One entry in a response's `messages[]` (ignored-filter notices, etc.). */
export const messageSchema = z
  .object({
    type: z.string().optional(),
    code: z.string().optional(),
    path: z.string().optional(),
    content: z.string().optional(),
  })
  .passthrough();

/** Cursor pagination block. `cursor` feeds the next `search_catalog` call. */
export const paginationSchema = z
  .object({
    has_next_page: z.boolean().optional(),
    total_count: z.number().optional(),
    cursor: z.string().optional(),
  })
  .passthrough();

/** The UCP capability advertisement echoed on every response. */
export const ucpSchema = z.object({}).passthrough();

/**
 * `search_catalog` result: `{products, pagination?, messages?, ucp?}`.
 *
 * `products` is `.nullable().optional()` — the API can return `products: null`
 * (not just omit it), and a bare `.optional()` would reject `null` with a
 * `ZodError` that a consuming app masks as an opaque 500 (finding #10). The
 * tool wrapper normalizes `null`/absent → `[]`.
 */
export const searchResultSchema = z
  .object({
    ucp: ucpSchema.optional(),
    products: z.array(productSchema).nullable().optional(),
    pagination: paginationSchema.optional(),
    messages: z.array(messageSchema).optional(),
  })
  .passthrough();

/** `lookup_catalog` result: `{products, messages?, ucp?}` (no pagination). */
export const lookupResultSchema = z
  .object({
    ucp: ucpSchema.optional(),
    products: z.array(productSchema).nullable().optional(),
    messages: z.array(messageSchema).optional(),
  })
  .passthrough();

/**
 * `get_product` result: singular `{product?, messages?, ucp?}`. `product` is
 * `.nullable().optional()` for the same reason as `products` above; the tool
 * wrapper normalizes `null` → `undefined`.
 */
export const getProductResultSchema = z
  .object({
    ucp: ucpSchema.optional(),
    product: productSchema.nullable().optional(),
    messages: z.array(messageSchema).optional(),
  })
  .passthrough();

/** A catalog product (loose — every field may be absent). */
export type CatalogProduct = z.infer<typeof productSchema>;
/** `search_catalog` result (loose). */
export type SearchResult = z.infer<typeof searchResultSchema>;
/** `lookup_catalog` result (loose). */
export type LookupResult = z.infer<typeof lookupResultSchema>;
/** `get_product` result (loose). */
export type GetProductResult = z.infer<typeof getProductResultSchema>;
