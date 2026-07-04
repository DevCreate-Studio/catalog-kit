import { z } from "zod";

/**
 * The CatalogConfig contract — the single portable JSON config that the
 * configurator emits and the playground, demo, exported code, and
 * `buildSearchArguments()` all consume. Its shape is the source of truth for
 * the whole kit; change it here and it flows everywhere (see AGENTS.md).
 *
 * Field shapes mirror the live-verified wire shapes in docs/probe-findings.md:
 * prices in minor units, `pagination.limit` clamped to 50, `categories` as
 * string GIDs only, `rating` as `{variant:{min,min_count}}`, `ships_to` an
 * object and `ships_from` an array, and `like` as an array of `{id}` XOR
 * `{image:{content_type,data}}` — plus the kit-only `{image_url}` convenience
 * that is resolved to inline base64 at request time.
 */
export const catalogConfigSchema = z
  .object({
    version: z.literal(1),
    name: z.string().optional(),
    scope: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("global"),
        savedCatalogSlug: z.string().optional(),
      }),
      z.object({ type: z.literal("storefront"), storeDomain: z.string() }),
    ]),
    query: z.string().optional(),
    like: z
      .array(
        z.union([
          z.object({ id: z.string() }).strict(),
          z
            .object({
              image: z.object({
                content_type: z.string(),
                data: z.string(),
              }),
            })
            .strict(),
          // kit convenience — resolved to base64 at request time
          z.object({ image_url: z.string().url() }).strict(),
        ]),
      )
      .min(1)
      .optional(),
    context: z
      .object({
        intent: z.string().optional(),
        address_country: z.string().length(2).optional(),
        address_region: z.string().optional(),
        postal_code: z.string().optional(),
        language: z.string().optional(),
        currency: z.string().length(3).optional(),
      })
      .optional(),
    filters: z
      .object({
        available: z.boolean().optional(),
        price: z
          .object({
            min: z.number().int().nonnegative().optional(),
            max: z.number().int().nonnegative().optional(),
          })
          .optional(),
        condition: z.array(z.enum(["new", "secondhand"])).optional(),
        ships_to: z
          .object({
            country: z.string().length(2),
            region: z.string().optional(),
            postal_code: z.string().optional(),
          })
          .optional(),
        ships_from: z
          .array(z.object({ country: z.string().length(2) }))
          .optional(),
        shop_ids: z.array(z.string()).max(1000).optional(),
        attributes: z
          .array(
            z.object({
              name: z.string(),
              values: z.array(z.string()).min(1),
            }),
          )
          .optional(),
        rating: z
          .object({
            variant: z.object({
              min: z.number().min(0).max(5).optional(),
              min_count: z.number().int().optional(),
            }),
          })
          .optional(),
        price_tier: z.array(z.enum(["low", "medium", "high"])).optional(),
        categories: z
          .array(
            z.string().startsWith("gid://shopify/TaxonomyCategory/", {
              message:
                "categories must be string GIDs like gid://shopify/TaxonomyCategory/… — the object form is rejected by the API",
            }),
          )
          .optional(),
      })
      .optional(),
    pagination: z
      .object({ limit: z.number().int().min(1).max(50).optional() })
      .optional(),
    view: z.enum(["offer"]).optional(),
  })
  .superRefine((config, ctx) => {
    if (config.query === undefined && config.like === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "A CatalogConfig must include at least one of `query` or `like` (they may also coexist for multimodal search).",
        path: ["query"],
      });
    }
  });

export type CatalogConfig = z.infer<typeof catalogConfigSchema>;

/** Element type of `CatalogConfig["like"]` — the `{id}` / `{image}` / `{image_url}` union. */
export type ConfigLikeEntry = NonNullable<CatalogConfig["like"]>[number];
