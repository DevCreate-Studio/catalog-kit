import type { Transport } from "../transport";
import type { CatalogConfig } from "../config";
import { buildSearchArguments, resolveLikeEntries } from "../config";
import { searchResultSchema, type SearchResult } from "../schemas/responses";
import { parseToolResult } from "./parse";

/** Shared dependencies the tool functions compose over. */
export interface ToolDeps {
  /** JSON-RPC transport from {@link createTransport}. */
  transport: Transport;
  /**
   * Injectable fetch, used only to resolve `like` `{image_url}` reference
   * images to inline base64 (see AGENTS.md → Compliance). Defaults to the
   * global `fetch`.
   */
  fetch?: typeof fetch;
  /**
   * Timeout (ms) for the reference-image fetch in {@link resolveLikeEntries}.
   * Defaults to the transport's 12s so a hanging image host can't stall a
   * search forever (finding #11).
   */
  imageFetchTimeoutMs?: number;
}

/** True when a config `like` array contains a kit-only `{image_url}` entry. */
function hasImageUrlEntry(like: NonNullable<CatalogConfig["like"]>): boolean {
  return like.some((entry) => "image_url" in entry);
}

/**
 * Run a `search_catalog` call from a {@link CatalogConfig}.
 *
 * Builds the wire args via {@link buildSearchArguments}. If any `like` entry is
 * a kit-only `{image_url}`, the reference images are resolved to inline base64
 * ({@link resolveLikeEntries}, using `deps.fetch`) and swapped into `args.like`
 * before the call — the API rejects image URLs and requires inline bytes. The
 * result is parsed with the lenient {@link searchResultSchema}; a parse failure
 * rethrows as a `CatalogError` `TRANSPORT_ERROR` (never a raw `ZodError`), and a
 * `null`/absent `products` is normalized to `[]` (finding #10).
 */
export async function searchCatalog(
  deps: ToolDeps,
  config: CatalogConfig,
  opts: { cursor?: string } = {},
): Promise<SearchResult> {
  const args = buildSearchArguments(config, opts);

  if (config.like !== undefined && hasImageUrlEntry(config.like)) {
    args.like = await resolveLikeEntries(config.like, {
      fetch: deps.fetch,
      timeoutMs: deps.imageFetchTimeoutMs,
    });
  }

  const raw = await deps.transport.callTool("search_catalog", args);
  const result = parseToolResult(searchResultSchema, raw);
  // Normalize null (and absent) products to an empty array so callers can
  // always iterate `result.products` without a null check.
  if (result.products == null) result.products = [];
  return result;
}
