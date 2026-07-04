/**
 * Server catalog proxy — the only place catalog calls originate.
 *
 * Secrets (token-tier client id/secret) are read server-side via getServerEnv()
 * and never reach the browser (AGENTS.md "Secrets never reach client
 * components"). Every response sets `Cache-Control: no-store` and the route is
 * `force-dynamic`: Shopify's usage guidelines forbid caching search results
 * (AGENTS.md "Compliance rules — No caching of search results"), so we are
 * explicit about it on ALL responses, success or error.
 */
import {
  createCatalogClient,
  catalogConfigSchema,
  CatalogError,
  type CatalogClient,
  type CatalogConfig,
  type CatalogErrorCode,
} from "catalog-kit";
import { getServerEnv } from "@/lib/env";
import { checkRateLimit, pruneRateLimit, rateLimitKey } from "@/lib/rate-limit";

// Compliance: never cache catalog results. Force dynamic rendering and set
// no-store on every response below.
export const dynamic = "force-dynamic";

/** JSON response helper — always no-store (compliance, see file header). */
function json(body: unknown, status: number, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

/**
 * Lazy, module-level client singleton. Lazy so an env misconfiguration surfaces
 * as a clean 500 JSON response at request time rather than crashing the build /
 * module load. The singleton lets the token-tier cache persist across requests.
 */
let clientSingleton: CatalogClient | null = null;

function getClient(): CatalogClient {
  if (clientSingleton) return clientSingleton;
  const { agentProfileUrl, clientId, clientSecret } = getServerEnv();
  clientSingleton = createCatalogClient({
    agentProfileUrl,
    auth: clientId && clientSecret ? { clientId, clientSecret } : undefined,
  });
  return clientSingleton;
}

/**
 * Anti-abuse gate for the browser: reject cross-site POSTs.
 *
 * What this DOES stop: a webpage on an attacker's origin trying to drive this
 * proxy from a visitor's browser (drive-by / CSRF). Browsers force
 * `Sec-Fetch-Site: cross-site` on such requests (unforgeable by page JS), and
 * even browsers too old to send it still send `Origin` on a cross-origin POST,
 * which the fallback below rejects on mismatch. So browser cross-site calls are
 * blocked.
 *
 * What this does NOT stop, and can't: a deliberate server-side/scripted relay
 * (curl et al.) that sets whatever headers it likes — no app-layer check can,
 * because a non-browser client controls its own headers. The real cap on relay
 * abuse is that the public deployment runs **anonymous-tier only** (no token
 * credentials in its env — see docs/deployment.md), so the worst case is the
 * same keyless budget anyone already has hitting Shopify directly, further
 * throttled by the per-instance rate limit. Don't oversell this function.
 *
 * `Sec-Fetch-Site` is trusted first; when absent (non-browser client, curl in
 * dev) we fall back to matching `Origin` against our own origin, allowing the
 * headerless case so local `curl`/CLI use isn't broken.
 */
function isAllowedOrigin(req: Request): boolean {
  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite) {
    // `none` = user-initiated (address bar / bookmark), not a cross-site fetch.
    return (
      secFetchSite === "same-origin" ||
      secFetchSite === "same-site" ||
      secFetchSite === "none"
    );
  }

  // No Sec-Fetch-Site (older client / curl-for-dev): if an Origin is present it
  // must match our own origin; if absent, allow (dev/CLI, no cross-site signal).
  const origin = req.headers.get("origin");
  if (!origin) return true;

  const self = requestOrigin(req);
  return self !== null && origin === self;
}

/** Reconstruct this request's own origin (`proto://host`) from forwarded headers. */
function requestOrigin(req: Request): string | null {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return null;
  const proto =
    req.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

type Tool = "search" | "lookup" | "get_product";

interface ProxyBody {
  tool?: Tool;
  config?: CatalogConfig;
  cursor?: string;
  args?: Record<string, unknown>;
}

/** Map a CatalogError code to an HTTP status. Exhaustive over CatalogErrorCode so a
 *  newly added code is a compile error here rather than a silent 502. */
function statusForCatalogError(code: CatalogErrorCode): number {
  switch (code) {
    case "INVALID_CONFIG":
    case "LIKE_IMAGE_FETCH_FAILED": // bad caller input (unreachable/oversized/non-image URL)
      return 400;
    case "RATE_LIMITED":
      return 429;
    case "TIMEOUT":
      return 504;
    case "AUTH_FAILED":
    case "TOOL_ERROR":
    case "TRANSPORT_ERROR":
      return 502;
    default: {
      const unhandled: never = code;
      return unhandled satisfies never;
    }
  }
}

export async function POST(req: Request): Promise<Response> {
  // Anti-relay boundary (PRIMARY): reject cross-site callers up front. The one
  // legitimate caller is the app's own browser (same-origin). See
  // isAllowedOrigin — the rate limit below is only a secondary throttle.
  if (!isAllowedOrigin(req)) {
    return json(
      {
        ok: false,
        error: {
          code: "FORBIDDEN_ORIGIN",
          message: "Cross-site requests are not allowed. Call this API from the app itself.",
        },
      },
      403,
    );
  }

  // Opportunistically evict rate-limit keys whose window fully expired so the
  // in-memory Map cannot grow unbounded (one entry per unique IP ever seen).
  pruneRateLimit();

  // Per-instance rate limit (see lib/rate-limit.ts — NOT a security boundary).
  const rl = checkRateLimit(rateLimitKey(req));
  if (!rl.ok) {
    return json(
      {
        ok: false,
        error: {
          code: "PROXY_RATE_LIMITED",
          retryAfterSeconds: rl.retryAfterSeconds,
        },
      },
      429,
      { "retry-after": String(rl.retryAfterSeconds) },
    );
  }

  let body: ProxyBody;
  try {
    body = (await req.json()) as ProxyBody;
  } catch {
    return json(
      { ok: false, error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } },
      400,
    );
  }

  const tool: Tool = body.tool ?? "search";

  // Instantiate the client (lazy). Env misconfig → clean 500 JSON, no stack leak.
  let client: CatalogClient;
  try {
    client = getClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server environment is misconfigured.";
    return json({ ok: false, error: { code: "ENV_MISCONFIGURED", message } }, 500);
  }

  const started = Date.now();
  try {
    let data: unknown;

    if (tool === "search") {
      if (!body.config) {
        return json(
          {
            ok: false,
            error: { code: "INVALID_CONFIG", message: "`config` is required for tool \"search\"." },
          },
          400,
        );
      }
      const parsed = catalogConfigSchema.safeParse(body.config);
      if (!parsed.success) {
        return json(
          { ok: false, error: { code: "INVALID_CONFIG", issues: parsed.error.issues } },
          400,
        );
      }
      data = await client.searchCatalog(parsed.data, { cursor: body.cursor });
    } else if (tool === "lookup") {
      const ids = body.args?.ids;
      if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) {
        return json(
          {
            ok: false,
            error: { code: "INVALID_ARGS", message: "tool \"lookup\" requires `args.ids` (string[])." },
          },
          400,
        );
      }
      data = await client.lookupCatalog({ ids });
    } else if (tool === "get_product") {
      const id = body.args?.id;
      if (typeof id !== "string") {
        return json(
          {
            ok: false,
            error: { code: "INVALID_ARGS", message: "tool \"get_product\" requires `args.id` (string)." },
          },
          400,
        );
      }
      data = await client.getProduct({
        id,
        selected: body.args?.selected,
        preferences: body.args?.preferences,
      });
    } else {
      return json(
        { ok: false, error: { code: "UNKNOWN_TOOL", message: `Unknown tool "${String(tool)}".` } },
        400,
      );
    }

    return json({ ok: true, data, meta: { latencyMs: Date.now() - started, tier: client.tier } }, 200);
  } catch (err) {
    if (CatalogError.isCatalogError(err)) {
      return json(
        {
          ok: false,
          error: { code: err.code, message: err.message, messages: err.messages },
        },
        statusForCatalogError(err.code),
      );
    }
    // Unknown error → generic 500, no stack leak.
    return json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
      500,
    );
  }
}
