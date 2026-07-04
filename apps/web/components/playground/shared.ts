import type { CatalogProduct } from "catalog-kit";

/** Shape of the server proxy response (see apps/web/app/api/catalog/route.ts). */
export type ProxyMeta = { latencyMs: number; tier: "anonymous" | "token" };

export type ProxyError = {
  code: string;
  message?: string;
  /** zod issues on a 400 INVALID_CONFIG. */
  issues?: Array<{ path?: (string | number)[]; message?: string }>;
  /** catalog `messages[]` surfaced on a tool error. */
  messages?: unknown[];
  retryAfterSeconds?: number;
};

export type ProxyResponse =
  | { ok: true; data: unknown; meta: ProxyMeta }
  | { ok: false; error: ProxyError; meta?: ProxyMeta };

/** The three tools the proxy exposes. */
export type Tool = "search" | "lookup" | "get_product";

/**
 * POST to the catalog proxy, normalizing thrown/network errors into the
 * `ProxyResponse` shape. Shared by the playground and demo pages so the two
 * never drift (finding #17). No catalog call originates client-side — the proxy
 * holds credentials and enforces no-store (compliance).
 */
export async function callProxy(body: unknown): Promise<ProxyResponse> {
  try {
    const res = await fetch("/api/catalog", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as ProxyResponse;
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: err instanceof Error ? err.message : "Request failed.",
      },
    };
  }
}

/**
 * One catalog `messages[]` entry — an ignored-filter / unsupported-attribute
 * notice. Mirrors `messageSchema` in the client (all fields optional,
 * passthrough). `content` carries the human-readable text.
 */
export type CatalogMessage = {
  type?: string;
  code?: string;
  path?: string;
  content?: string;
};

/**
 * Narrow an unknown `messages[]` entry to the readable fields we render.
 * Falls back gracefully: anything without a string `content` still round-trips
 * through the raw-JSON details toggle.
 */
export function asCatalogMessage(value: unknown): CatalogMessage {
  if (value && typeof value === "object") {
    const m = value as Record<string, unknown>;
    return {
      type: typeof m.type === "string" ? m.type : undefined,
      code: typeof m.code === "string" ? m.code : undefined,
      path: typeof m.path === "string" ? m.path : undefined,
      content: typeof m.content === "string" ? m.content : undefined,
    };
  }
  return {};
}

/**
 * Map a proxy error `code` to a friendly, human sentence. The raw code stays
 * available as small secondary text in the banner (finding #19). Covers every
 * code the proxy + client emit; unknown codes fall through to a generic line.
 */
export function friendlyErrorHeadline(code: string): string {
  switch (code) {
    case "PROXY_RATE_LIMITED":
    case "RATE_LIMITED":
      return "You're sending requests too fast — wait a moment and try again. Add credentials for higher limits.";
    case "FORBIDDEN_ORIGIN":
      return "This request was blocked because it didn't come from the app itself. Run it from the playground, not a copied cURL against a different origin.";
    case "INVALID_CONFIG":
      return "The config didn't validate. Check the flagged fields below and try again.";
    case "INVALID_JSON":
      return "The request body wasn't valid JSON. Fix the syntax and re-run.";
    case "ENV_MISCONFIGURED":
      return "The server is missing its catalog credentials, so it can't reach the API. This is a deployment/config issue, not something you did.";
    case "TIMEOUT":
      return "The catalog took too long to respond. Try again in a moment.";
    case "TOOL_ERROR":
      return "The catalog rejected these arguments. See the details below for what it flagged.";
    case "TRANSPORT_ERROR":
      return "The catalog returned something unexpected. Try again — if it persists, the response shape may have changed.";
    case "LIKE_IMAGE_FETCH_FAILED":
      return "Couldn't fetch the reference image for this search. Check the image URL is public and reachable, then try again.";
    case "NETWORK_ERROR":
      return "Network hiccup — the request didn't reach the server. Check your connection and try again.";
    default:
      return "Something went wrong with that request. Try again in a moment.";
  }
}

/**
 * Format a money object (`{amount, currency}` in MINOR units) as a localized string.
 * Minor units → major via a divide-by-100 (compliance/spec: prices are minor units).
 */
export function formatMoney(
  money: { amount?: number; currency?: string } | undefined | null,
): string | null {
  if (!money || typeof money.amount !== "number") return null;
  const currency = money.currency || "USD";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(money.amount / 100);
  } catch {
    // Unknown currency code — fall back to a bare number.
    return `${(money.amount / 100).toFixed(2)} ${currency}`;
  }
}

/** Derive a display price string from a product's price_range or first variant price. */
export function productPrice(product: CatalogProduct): string | null {
  const range = product.price_range as
    | { min?: { amount?: number; currency?: string }; max?: { amount?: number; currency?: string } }
    | undefined;
  if (range?.min || range?.max) {
    const min = formatMoney(range.min);
    const max = formatMoney(range.max);
    if (min && max && min !== max) return `${min} – ${max}`;
    return min || max;
  }
  const variant = product.variants?.[0] as { price?: { amount?: number; currency?: string } } | undefined;
  return variant?.price ? formatMoney(variant.price) : null;
}

/** Best-effort primary image URL for a product (hot-linked, never proxied). */
export function productImage(product: CatalogProduct): { url: string; alt: string } | null {
  const media = (product.media ?? []) as Array<{ type?: string; url?: string; alt_text?: string }>;
  const image = media.find((m) => m.url && (!m.type || m.type === "image")) ?? media[0];
  if (!image?.url) return null;
  return { url: image.url, alt: image.alt_text || product.title || "Product image" };
}

/** Best-effort seller domain — lives on variants in the catalog response. */
export function sellerDomain(product: CatalogProduct): string | null {
  const variants = (product.variants ?? []) as Array<{
    seller?: { domain?: string; name?: string; url?: string };
  }>;
  for (const v of variants) {
    const s = v.seller;
    if (s?.domain) return s.domain;
    if (s?.name) return s.name;
  }
  return null;
}

/** Product rating summary, if present. */
export function productRating(
  product: CatalogProduct,
): { value: number; count?: number } | null {
  const r = product.rating as { value?: number; count?: number } | undefined;
  if (r && typeof r.value === "number") return { value: r.value, count: r.count };
  return null;
}

/**
 * Best-effort external product link — prefers a variant `checkout_url`, then a
 * variant `url` (the product/PDP link). Rendered as an external "View product"
 * link; never a proxied or cached URL (hot-linked, compliance-safe).
 */
export function productLink(product: CatalogProduct): string | null {
  const variants = (product.variants ?? []) as Array<{
    url?: string;
    checkout_url?: string;
  }>;
  for (const v of variants) {
    if (v.checkout_url) return v.checkout_url;
    if (v.url) return v.url;
  }
  return null;
}

/** Build a cURL snippet equivalent to the proxy POST — copy/pasteable. */
export function curlFor(body: unknown, origin: string): string {
  const json = JSON.stringify(body, null, 2);
  return `curl -X POST '${origin}/api/catalog' \\\n  -H 'content-type: application/json' \\\n  -d '${json}'`;
}
