import { CatalogError } from "../errors";
import { lookupResultSchema, type LookupResult } from "../schemas/responses";
import { parseToolResult } from "./parse";
import type { ToolDeps } from "./search";

/** Inclusive bounds the API accepts for a single `lookup_catalog` call. */
const MIN_IDS = 1;
const MAX_IDS = 50;

/**
 * Run a `lookup_catalog` call for an explicit set of product ids.
 *
 * Enforces `ids.length` between {@link MIN_IDS} and {@link MAX_IDS} client-side
 * (throwing `CatalogError` `INVALID_CONFIG` before any network call), then calls
 * `lookup_catalog` with `{ids}` and parses via the lenient
 * {@link lookupResultSchema}.
 */
export async function lookupCatalog(
  deps: ToolDeps,
  args: { ids: string[] },
): Promise<LookupResult> {
  const { ids } = args;
  if (!Array.isArray(ids) || ids.length < MIN_IDS || ids.length > MAX_IDS) {
    throw new CatalogError(
      "INVALID_CONFIG",
      `lookup_catalog requires between ${MIN_IDS} and ${MAX_IDS} ids (received ${
        Array.isArray(ids) ? ids.length : "a non-array"
      }).`,
    );
  }

  const raw = await deps.transport.callTool("lookup_catalog", { ids });
  const result = parseToolResult(lookupResultSchema, raw);
  if (result.products == null) result.products = [];
  return result;
}
