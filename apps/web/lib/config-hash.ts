import { catalogConfigSchema, type CatalogConfig } from "catalog-kit";

/**
 * Pure, framework-free helpers for encoding/decoding a `CatalogConfig` into a
 * URL-shareable base64url string (no padding). Used by the configurator's
 * `#c=<hash>` URL persistence and by `getShareUrl()`.
 *
 * Deliberately avoids `Buffer` — this runs in the browser. Uses
 * `TextEncoder`/`TextDecoder` + a manual base64url alphabet swap on top of
 * `btoa`/`atob` (both available in browsers and modern Node).
 */

const BASE64_TO_BASE64URL: Record<string, string> = { "+": "-", "/": "_" };
const BASE64URL_TO_BASE64: Record<string, string> = { "-": "+", "_": "/" };

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toBase64Url(base64: string): string {
  return base64.replace(/[+/]/g, (c) => BASE64_TO_BASE64URL[c]).replace(/=+$/, "");
}

function fromBase64Url(base64url: string): string {
  const base64 = base64url.replace(/[-_]/g, (c) => BASE64URL_TO_BASE64[c]);
  const padded = base64 + "===".slice((base64.length + 3) % 4);
  return padded;
}

/**
 * Encodes a `CatalogConfig` as JSON → UTF-8 → base64url (no padding).
 * Does not validate the config — callers should already hold a valid
 * `CatalogConfig` (e.g. from the store).
 */
export function encodeConfigHash(config: CatalogConfig): string {
  const json = JSON.stringify(config);
  const bytes = new TextEncoder().encode(json);
  return toBase64Url(bytesToBase64(bytes));
}

/**
 * Decodes a base64url hash back into a validated `CatalogConfig`.
 * Never throws — returns `null` on any failure (malformed base64, invalid
 * UTF-8/JSON, or a payload that fails `catalogConfigSchema`).
 */
export function decodeConfigHash(hash: string): CatalogConfig | null {
  if (!hash) return null;
  try {
    const base64 = fromBase64Url(hash);
    const bytes = base64ToBytes(base64);
    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed: unknown = JSON.parse(json);
    const result = catalogConfigSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
