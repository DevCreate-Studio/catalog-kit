import { CatalogError } from "./errors";
import { catalogConfigSchema } from "./schemas/requests";
import type { CatalogConfig, ConfigLikeEntry } from "./schemas/requests";

export { catalogConfigSchema } from "./schemas/requests";
export type { CatalogConfig } from "./schemas/requests";

/** The `like` entry shapes the API actually accepts on the wire. */
export type ApiLikeEntry =
  | { id: string }
  | { image: { content_type: string; data: string } };

/**
 * The kit-only convenience entry, resolved to an {@link ApiLikeEntry} at
 * request time. Derived from the schema's `like` element union (rather than
 * hand-written) so it can never drift from {@link ConfigLikeEntry}.
 */
type ImageUrlLikeEntry = Extract<ConfigLikeEntry, { image_url: string }>;

/** ~2 MB cap on a fetched reference image (matches the probed API limit). */
const MAX_LIKE_IMAGE_BYTES = 2 * 1024 * 1024;

/** Default per-request image-fetch timeout (mirrors the transport's 12s). */
const DEFAULT_IMAGE_TIMEOUT_MS = 12_000;

/** Max redirect hops we follow ourselves before giving up. */
const MAX_IMAGE_REDIRECTS = 3;

/**
 * Generic, caller-safe message for every {@link CatalogError}
 * `LIKE_IMAGE_FETCH_FAILED`. The reference image resolver fetches a
 * caller-supplied URL server-side, so the *reason* it failed (bad scheme,
 * denied host, HTTP status, wrong content-type, timeout) must NOT be reflected
 * back in `message` — a distinguishable error is an SSRF oracle that lets a
 * caller probe internal network reachability (finding #2sec). Debug specifics
 * go on the non-enumerable `error.detail` instead.
 */
const LIKE_IMAGE_FETCH_FAILED_MESSAGE =
  "reference image could not be fetched or is not a usable image";

/** Throw a `LIKE_IMAGE_FETCH_FAILED` with the generic message + debug `detail`. */
function likeImageFetchFailed(detail: string): CatalogError {
  return new CatalogError(
    "LIKE_IMAGE_FETCH_FAILED",
    LIKE_IMAGE_FETCH_FAILED_MESSAGE,
    { detail },
  );
}

/**
 * Hostnames that must never be fetched server-side (SSRF denylist). Covers the
 * loopback alias, cloud instance-metadata hosts, and the internal-DNS suffix.
 * `*.localhost` and any `*.internal` name are also rejected (see
 * {@link assertPublicHttpUrl}).
 */
const DENIED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
]);

/** Strip IPv6 brackets / zone id and lowercase a URL hostname for matching. */
function normalizeHostname(hostname: string): string {
  let h = hostname.toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  const pct = h.indexOf("%"); // IPv6 zone id, e.g. fe80::1%eth0
  if (pct !== -1) h = h.slice(0, pct);
  return h;
}

/** True if `host` is a dotted-quad IPv4 literal; returns its four octets. */
function parseIpv4(host: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const octets = m.slice(1, 5).map(Number) as [number, number, number, number];
  if (octets.some((o) => o > 255)) return null;
  return octets;
}

/** Private / loopback / link-local IPv4 ranges (RFC 1918 + 127/8 + 169.254/16). */
function isPrivateIpv4(octets: [number, number, number, number]): boolean {
  const [a, b] = octets;
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // 127/8 loopback
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 169 && b === 254) return true; // 169.254/16 link-local (cloud metadata)
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  return false;
}

/** Private / loopback / link-local / ULA IPv6 (::1, fc00::/7, fe80::/10). */
function isPrivateIpv6(host: string): boolean {
  // Only treat as IPv6 if it actually looks like one (contains a colon).
  if (!host.includes(":")) return false;
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::1" || h === "::") return true; // loopback / unspecified

  // IPv4-mapped (::ffff:…) — the embedded v4 is the real destination. The
  // WHATWG URL parser normalizes the dotted tail to two hex groups
  // (::ffff:127.0.0.1 → ::ffff:7f00:1), so handle BOTH notations. Any
  // ::ffff: address that we can't positively decode as public fails closed —
  // this closes the ::ffff:169.254.169.254 (cloud metadata) bypass.
  if (h.startsWith("::ffff:")) {
    const tail = h.slice("::ffff:".length);
    const dotted = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(tail);
    if (dotted) {
      const v4 = parseIpv4(dotted[1]);
      return v4 ? isPrivateIpv4(v4) : true;
    }
    const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(tail);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      if (Number.isNaN(hi) || Number.isNaN(lo)) return true; // fail closed
      const v4: [number, number, number, number] = [
        (hi >> 8) & 0xff,
        hi & 0xff,
        (lo >> 8) & 0xff,
        lo & 0xff,
      ];
      return isPrivateIpv4(v4);
    }
    return true; // unrecognized ::ffff: tail → deny (fail closed)
  }

  const first = h.split(":")[0];
  if (first === "") return false; // some other compressed form starting with ::
  const group = parseInt(first, 16);
  if (Number.isNaN(group)) return true; // unparseable → deny (fail closed)
  if ((group & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((group & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  return false;
}

/**
 * Guard a URL before it is fetched server-side (SSRF protection, finding #1).
 * Throws `CatalogError` `LIKE_IMAGE_FETCH_FAILED` (generic message) when the URL:
 *  - is unparseable, or uses a scheme other than `http:` / `https:`; or
 *  - targets a private / loopback / link-local address by IP literal
 *    (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, 0/8, ::1, fc00::/7,
 *    fe80::/10, IPv4-mapped forms); or
 *  - targets a denylisted hostname: `localhost`, any `*.localhost`,
 *    `metadata.google.internal`, or any name ending in `.internal`.
 *
 * Pure and exported so it is unit-testable and reusable on every redirect hop.
 *
 * NOTE: this checks the literal host in the URL only. It does **not** perform
 * DNS resolution, so a public hostname whose A/AAAA record points at a private
 * IP (a DNS-rebinding attack) is NOT caught here — full DNS-pinning is out of
 * scope for a starter kit. If you deploy this behind an untrusted-input surface,
 * add resolve-then-pin egress controls (or an allowlist) at the network layer.
 * See docs/compliance.md and docs/deployment.md.
 */
export function assertPublicHttpUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw likeImageFetchFailed(`unparseable URL: ${url}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw likeImageFetchFailed(`disallowed scheme "${parsed.protocol}"`);
  }

  const host = normalizeHostname(parsed.hostname);

  const ipv4 = parseIpv4(host);
  if (ipv4) {
    if (isPrivateIpv4(ipv4)) {
      throw likeImageFetchFailed(`private/loopback IPv4 host: ${host}`);
    }
    return; // public IPv4 literal
  }

  if (isPrivateIpv6(host)) {
    throw likeImageFetchFailed(`private/loopback IPv6 host: ${host}`);
  }
  // A bracketed / colon-bearing host that wasn't flagged is a public IPv6 literal.
  if (host.includes(":")) return;

  // Hostname (name, not IP): check the denylist.
  if (
    DENIED_HOSTNAMES.has(host) ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal")
  ) {
    throw likeImageFetchFailed(`denylisted host: ${host}`);
  }
}

/**
 * Turn a validated {@link CatalogConfig} into the `catalog` tool-args object —
 * the exact payload that goes under `params.arguments.catalog` on the wire.
 *
 * Pure and synchronous. Validates via {@link catalogConfigSchema} and throws a
 * `CatalogError` with code `INVALID_CONFIG` (carrying the zod issues in
 * `messages`) on failure. Every absent key is omitted entirely — the output
 * never contains `undefined` values, so it survives a JSON round-trip. Kit-only
 * keys (`scope`, `version`, `name`) never leak into the wire payload; `like`
 * passes through as-is (including `image_url` entries, which are resolved later
 * by {@link resolveLikeEntries} in the search tool).
 */
export function buildSearchArguments(
  config: CatalogConfig,
  opts: { cursor?: string } = {},
): Record<string, unknown> {
  const parsed = catalogConfigSchema.safeParse(config);
  if (!parsed.success) {
    throw new CatalogError(
      "INVALID_CONFIG",
      "CatalogConfig failed validation — see error.messages for field-level issues.",
      { messages: parsed.error.issues },
    );
  }
  const cfg = parsed.data;

  const args: Record<string, unknown> = {};

  if (cfg.query !== undefined) args.query = cfg.query;
  if (cfg.like !== undefined) args.like = cfg.like;
  if (cfg.context !== undefined) args.context = cfg.context;
  if (cfg.filters !== undefined) args.filters = cfg.filters;
  if (cfg.view !== undefined) args.view = cfg.view;

  if (cfg.scope.type === "global" && cfg.scope.savedCatalogSlug !== undefined) {
    args.saved_catalog_slug = cfg.scope.savedCatalogSlug;
  }

  if (cfg.pagination !== undefined || opts.cursor !== undefined) {
    const pagination: Record<string, unknown> = { ...(cfg.pagination ?? {}) };
    if (opts.cursor !== undefined) pagination.cursor = opts.cursor;
    args.pagination = pagination;
  }

  return args;
}

/**
 * Resolve a config `like` array into the wire-ready form the API accepts.
 *
 * `{id}` and already-inline `{image}` entries pass through untouched. Each
 * `{image_url}` entry is fetched (via the injectable `fetch`), validated
 * (2xx, image content-type, ≤2 MB), base64-encoded, and returned as
 * `{image:{content_type,data}}`. This transient encode of a *reference* image
 * for one search request is the sanctioned exception to the no-image-download
 * rule (see AGENTS.md → Compliance). Runtime-agnostic: no `node:Buffer`.
 *
 * Because the URL is caller-supplied and fetched server-side, every URL (and
 * every redirect hop) is screened by {@link assertPublicHttpUrl} first, the
 * fetch is bounded by `timeoutMs` (default 12s, matching the transport), and
 * all failures surface as a generic `LIKE_IMAGE_FETCH_FAILED` with no leaked
 * URL/status/content-type (findings #1, #2sec, #11).
 */
export async function resolveLikeEntries(
  like: ReadonlyArray<ConfigLikeEntry>,
  opts: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<ApiLikeEntry[]> {
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_IMAGE_TIMEOUT_MS;
  const out: ApiLikeEntry[] = [];

  for (const entry of like) {
    if ("id" in entry) {
      out.push({ id: entry.id });
      continue;
    }
    if ("image" in entry) {
      out.push({ image: entry.image });
      continue;
    }
    out.push(await resolveImageUrl(entry, fetchImpl, timeoutMs));
  }

  return out;
}

/**
 * Fetch `url` with `redirect: "manual"`, re-running {@link assertPublicHttpUrl}
 * on each `Location` before following it, up to {@link MAX_IMAGE_REDIRECTS}
 * hops. The whole chain shares one {@link AbortController} deadline so a slow or
 * hanging host cannot stall the caller past `timeoutMs`. A redirect to a denied
 * host, too many hops, or a redirect without a usable `Location` all fail as a
 * generic `LIKE_IMAGE_FETCH_FAILED`.
 */
async function fetchFollowingRedirects(
  url: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_IMAGE_REDIRECTS; hop++) {
    // Guard every hop, including the very first URL and each Location target.
    assertPublicHttpUrl(current);

    const response = await fetchImpl(current, { redirect: "manual", signal });

    // 3xx (or an opaqueredirect, which manual mode can surface): follow it
    // ourselves after re-guarding the destination.
    const isRedirect =
      response.type === "opaqueredirect" ||
      (response.status >= 300 &&
        response.status < 400 &&
        response.status !== 304);
    if (!isRedirect) return response;

    const location = response.headers.get("location");
    if (!location) {
      throw likeImageFetchFailed(
        `redirect (HTTP ${response.status}) with no Location header`,
      );
    }
    // Resolve relative redirects against the current URL, then loop to re-guard.
    current = new URL(location, current).toString();
  }
  throw likeImageFetchFailed(`too many redirects (>${MAX_IMAGE_REDIRECTS})`);
}

async function resolveImageUrl(
  entry: ImageUrlLikeEntry,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<ApiLikeEntry> {
  const url = entry.image_url;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchFollowingRedirects(url, fetchImpl, controller.signal);
  } catch (cause) {
    // Re-throw our own generic errors untouched (they already carry safe
    // detail); wrap anything else (network failure, timeout/abort) generically
    // so the reason never leaks to the caller.
    if (CatalogError.isCatalogError(cause)) throw cause;
    throw likeImageFetchFailed(`fetch failed: ${String(cause)}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw likeImageFetchFailed(`upstream HTTP ${response.status}`);
  }

  const contentType = (response.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!contentType.startsWith("image/")) {
    throw likeImageFetchFailed(
      `non-image content-type "${contentType || "unknown"}"`,
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_LIKE_IMAGE_BYTES) {
    throw likeImageFetchFailed(
      `image is ${bytes.byteLength} bytes, over the ${MAX_LIKE_IMAGE_BYTES}-byte cap`,
    );
  }

  return {
    image: { content_type: contentType, data: base64Encode(bytes) },
  };
}

const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Runtime-agnostic base64 encoder (no `node:Buffer`, no reliance on `btoa`,
 * which mishandles bytes ≥128). Encodes a `Uint8Array` to a standard,
 * padded base64 string.
 */
function base64Encode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];

    out += BASE64_CHARS[b0 >> 2];
    out += BASE64_CHARS[((b0 & 0b11) << 4) | ((b1 ?? 0) >> 4)];
    out +=
      b1 === undefined
        ? "="
        : BASE64_CHARS[((b1 & 0b1111) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? "=" : BASE64_CHARS[b2 & 0b111111];
  }
  return out;
}
