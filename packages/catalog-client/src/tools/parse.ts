import type { ZodType } from "zod";
import { CatalogError } from "../errors";

/**
 * Parse a raw tool response through a lenient zod schema, converting any parse
 * failure into a `CatalogError` `TRANSPORT_ERROR` (finding #10).
 *
 * The response schemas are deliberately lenient (every field optional /
 * passthrough), so a `.parse()` here should essentially never fail — but if the
 * wire shape drifts far enough that it does, a raw `ZodError` would bubble up
 * and be masked by a consuming app as an opaque HTTP 500. Wrapping it as a
 * `TRANSPORT_ERROR` (with the zod issues on `messages`) keeps every failure out
 * of this client a `CatalogError` the caller can branch on by `code`.
 */
export function parseToolResult<T>(schema: ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new CatalogError(
      "TRANSPORT_ERROR",
      "Catalog response did not match the expected shape — see error.messages.",
      { messages: result.error.issues },
    );
  }
  return result.data;
}
