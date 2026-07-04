/**
 * Error types for the catalog-kit client.
 *
 * The Catalog API surfaces failures in two distinct shapes (see
 * docs/probe-findings.md): transport/discovery errors as a top-level JSON-RPC
 * `error` at HTTP 422, and tool-argument errors as HTTP 200 with
 * `result.isError === true`. Both are normalized into a single `CatalogError`
 * carrying a stable `code`, the originating HTTP status, and — when relevant —
 * the raw JSON-RPC error object and any `messages[]` the API returned.
 */

/**
 * Brand symbol used to identify a `CatalogError` across module/build
 * boundaries. Keyed via `Symbol.for` (the global symbol registry) so it is
 * the *same* symbol even when the dual ESM/CJS build causes two separate
 * `CatalogError` class objects to exist in the same process.
 */
const BRAND = Symbol.for("catalog-kit.CatalogError");

/** Stable, machine-checkable error codes used across the client. */
export const CATALOG_ERROR_CODES = [
  "AUTH_FAILED",
  "RATE_LIMITED",
  "TOOL_ERROR",
  "TRANSPORT_ERROR",
  "TIMEOUT",
  "INVALID_CONFIG",
  "LIKE_IMAGE_FETCH_FAILED",
] as const;

export type CatalogErrorCode = (typeof CATALOG_ERROR_CODES)[number];

/** Optional structured context attached to a {@link CatalogError}. */
export interface CatalogErrorExtras {
  /** HTTP status of the response that produced this error, if any. */
  httpStatus?: number;
  /** Raw JSON-RPC `error` object (transport/discovery failures). */
  jsonrpcError?: unknown;
  /** The API's `messages[]` array, when the failure carried one. */
  messages?: unknown[];
  /**
   * Debug-only detail that must NOT be surfaced to callers or serialized into a
   * response body. Used for failures where the human-readable `message` is
   * deliberately generic to avoid leaking information (e.g. an SSRF oracle in
   * `LIKE_IMAGE_FETCH_FAILED`, where echoing the fetched URL / upstream status /
   * content-type back to the caller would confirm reachability of internal
   * hosts). Attached as a **non-enumerable** property so it never shows up in
   * `JSON.stringify(error)` or a spread — read it explicitly off the error when
   * debugging server-side.
   */
  detail?: string;
}

/**
 * Normalized error thrown by every catalog-kit operation.
 *
 * Cross-module/cross-build caveat: because catalog-kit ships as a dual
 * ESM/CJS build, it is possible for two distinct `CatalogError` class
 * objects to end up loaded in the same process (e.g. one dependency pulls in
 * the ESM build, another the CJS build). In that situation `instanceof
 * CatalogError` can fail even for an error that this package threw. Prefer
 * {@link CatalogError.isCatalogError} + the `code` field over `instanceof`
 * when consuming errors across module/package boundaries:
 *
 * ```ts
 * if (CatalogError.isCatalogError(err) && err.code === "RATE_LIMITED") { ... }
 * ```
 */
export class CatalogError extends Error {
  readonly code: CatalogErrorCode;
  readonly httpStatus?: number;
  readonly jsonrpcError?: unknown;
  /**
   * Structured detail about the failure. Shape depends on the source:
   *  - API-reported failures carry the Catalog API's `messages[]` entries
   *    (each typically `{path: string, ...}`, where `path` is a string
   *    JSON-pointer like `"/catalog/filters/…"`).
   *  - `INVALID_CONFIG` (client-side request validation) instead carries raw
   *    zod issues (`z.ZodIssue[]`), where `path` is an array of property-name
   *    segments, not a JSON-pointer string.
   * Consumers that inspect `messages` should handle both shapes rather than
   * assuming a single `path` format.
   */
  readonly messages?: unknown[];
  /**
   * Debug-only detail (see {@link CatalogErrorExtras.detail}). Defined as a
   * **non-enumerable** own property so it is invisible to `JSON.stringify` and
   * object spreads — it must never reach a caller-facing response body.
   */
  readonly detail?: string;

  constructor(
    code: CatalogErrorCode,
    message: string,
    extras: CatalogErrorExtras = {},
  ) {
    super(message);
    this.name = "CatalogError";
    this.code = code;
    this.httpStatus = extras.httpStatus;
    this.jsonrpcError = extras.jsonrpcError;
    this.messages = extras.messages;
    // Non-enumerable so it is excluded from JSON.stringify and spreads; used
    // for debug detail that must not leak to callers (e.g. SSRF oracle info).
    Object.defineProperty(this, "detail", {
      value: extras.detail,
      enumerable: false,
      writable: false,
      configurable: true,
    });
    // Restore prototype chain for instanceof across the ES2022 target.
    Object.setPrototypeOf(this, CatalogError.prototype);
    // Brand this instance so it can be identified even if the prototype
    // chain above doesn't line up with the CatalogError class the caller
    // has in hand (see class-level doc comment).
    Object.defineProperty(this, BRAND, { value: true });
  }

  /**
   * Structural check for "is this a CatalogError", safe across module/build
   * boundaries where `instanceof CatalogError` may not hold. Prefer this
   * (plus `err.code`) over `instanceof` when consuming errors from
   * catalog-kit outside of this package's own build.
   */
  static isCatalogError(e: unknown): e is CatalogError {
    return (
      typeof e === "object" &&
      e !== null &&
      (e as Record<symbol, unknown>)[Symbol.for("catalog-kit.CatalogError")] === true
    );
  }
}
