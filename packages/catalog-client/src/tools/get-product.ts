import {
  getProductResultSchema,
  type GetProductResult,
} from "../schemas/responses";
import { parseToolResult } from "./parse";
import type { ToolDeps } from "./search";

/** Arguments for {@link getProduct}. `selected`/`preferences` pass through verbatim. */
export interface GetProductArgs {
  /** Product GID (`gid://shopify/p/…`). */
  id: string;
  /** Selected variant options, forwarded to the API untouched. */
  selected?: unknown;
  /** Buyer preferences (currency, locale, …), forwarded to the API untouched. */
  preferences?: unknown;
}

/**
 * Run a `get_product` call for a single product.
 *
 * `selected` and `preferences` are passed through verbatim; absent keys are
 * omitted from the wire payload entirely. The singular `product` result is
 * parsed via the lenient {@link getProductResultSchema}; a parse failure
 * rethrows as a `CatalogError` `TRANSPORT_ERROR`, and a `null` `product` is
 * normalized to `undefined` (finding #10).
 */
export async function getProduct(
  deps: ToolDeps,
  args: GetProductArgs,
): Promise<GetProductResult> {
  const catalogArgs: Record<string, unknown> = { id: args.id };
  if (args.selected !== undefined) catalogArgs.selected = args.selected;
  if (args.preferences !== undefined) catalogArgs.preferences = args.preferences;

  const raw = await deps.transport.callTool("get_product", catalogArgs);
  const result = parseToolResult(getProductResultSchema, raw);
  // Normalize an explicit null product to undefined (absent) for a stable shape.
  if (result.product === null) result.product = undefined;
  return result;
}
