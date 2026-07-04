/**
 * JSON-RPC transport for the Shopify Global Catalog (UCP).
 *
 * Every call is a JSON-RPC 2.0 `tools/call`. The agent profile URL is injected
 * into `params.arguments.meta['ucp-agent'].profile` and the tool payload goes
 * under `params.arguments.catalog` — both are required on every request (see
 * docs/probe-findings.md). Auth headers come from Task 2.2's `createAuth`
 * (empty on the anonymous tier).
 *
 * Retry/backoff/timeout is ported from the production Vinyl reference client,
 * restructured around injectable `fetch`, `sleep`, and a configurable timeout
 * so the whole thing is testable without a real network or clock.
 *
 * Two rate-limit signals both trigger a retry (both observed live):
 *  - HTTP 429, and
 *  - a JSON-RPC `error` with code -32600 / "Rate limit exceeded" (seen on
 *    HTTP 200 *and* on HTTP 4xx bodies).
 *
 * HTTP 5xx is retried. A non-rate-limit 4xx is not: if the body carried a
 * JSON-RPC `error` object it becomes a `TOOL_ERROR`, otherwise (non-JSON /
 * network junk) a `TRANSPORT_ERROR`. An HTTP 200 body with `result.isError`
 * is a tool-argument error → `TOOL_ERROR` with `messages` from `result.content`.
 */

import type { Auth } from "./auth";
import { CatalogError } from "./errors";

export interface CreateTransportOptions {
  /** Fully-qualified catalog endpoint (see endpoints.ts / storefrontCatalog). */
  endpoint: string;
  /** Agent profile URL, injected into every request's arguments.meta. */
  agentProfileUrl: string;
  /** Auth from {@link createAuth} — supplies (possibly empty) request headers. */
  auth: Auth;
  /** Injectable fetch (defaults to the global `fetch`). */
  fetch?: typeof fetch;
  /** Per-request timeout in milliseconds (default 12000). */
  timeoutMs?: number;
  /** Max retries on rate-limit / 5xx (default 3). Total attempts = maxRetries+1. */
  maxRetries?: number;
  /** Injectable delay (defaults to a real setTimeout-backed sleep). */
  sleep?: (ms: number) => Promise<void>;
}

export interface Transport {
  callTool(name: string, catalogArgs: unknown): Promise<unknown>;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_RETRIES = 3;
/** Base backoff (ms); doubles each attempt, plus jitter. */
const BACKOFF_BASE_MS = 800;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** JSON-RPC error shape we care about (loose — the wire is ML-inferred). */
interface JsonRpcError {
  code?: number;
  message?: string;
  data?: unknown;
}

interface JsonRpcResponse {
  error?: JsonRpcError;
  result?: {
    isError?: boolean;
    content?: unknown[];
    structuredContent?: unknown;
    [key: string]: unknown;
  };
}

/** True when a JSON-RPC error object is a rate-limit signal (code or text). */
function isRateLimitError(error: JsonRpcError | undefined): boolean {
  if (!error) return false;
  // -32600 alone is just the generic JSON-RPC "Invalid Request" — it is not
  // itself a rate-limit signal. The API reuses it for the observed throttle
  // case too, so the only reliable signal (for -32600 and otherwise) is the
  // "rate limit" text in the message/data.
  const text = `${error.message ?? ""} ${stringifyData(error.data)}`.toLowerCase();
  return text.includes("rate limit");
}

function stringifyData(data: unknown): string {
  if (data == null) return "";
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "AbortError" || err.name === "TimeoutError")
  );
}

export function createTransport(options: CreateTransportOptions): Transport {
  const fetchImpl = options.fetch ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const { endpoint, agentProfileUrl, auth } = options;

  /** Exponential backoff with full jitter for retry attempt `attempt` (0-based). */
  function backoffFor(attempt: number): number {
    const base = BACKOFF_BASE_MS * 2 ** attempt;
    return base + Math.floor(Math.random() * BACKOFF_BASE_MS);
  }

  async function callTool(name: string, catalogArgs: unknown): Promise<unknown> {
    let authHeaders = await auth.getAuthHeaders();
    // Reactive-refresh guard: on the token tier, a single HTTP 401 forces one
    // token refresh + retry before the error surfaces (finding #14). Tracked
    // across the retry loop so we refresh at most once per call.
    let did401Refresh = false;
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name,
        arguments: {
          meta: { "ucp-agent": { profile: agentProfileUrl } },
          catalog: catalogArgs,
        },
      },
    });

    let lastRateLimit: { httpStatus?: number; jsonrpcError?: unknown } | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(backoffFor(attempt - 1));
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeaders },
          body,
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (isAbortError(err)) {
          throw new CatalogError(
            "TIMEOUT",
            `Catalog request timed out after ${timeoutMs}ms`,
          );
        }
        // Network failure (DNS, connection reset, etc.) — not JSON-RPC shaped.
        throw new CatalogError(
          "TRANSPORT_ERROR",
          `Catalog request failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        clearTimeout(timer);
      }

      // Reactive token refresh on 401 (token tier only). The server rejected
      // the token mid-flight (revoked / clock skew / rotated) — force a fresh
      // exchange and retry this same request once. Does not consume a retry
      // attempt. Anonymous tier has no token, so a 401 falls through to the
      // normal error path below. Finding #14.
      if (
        response.status === 401 &&
        auth.tier === "token" &&
        !did401Refresh
      ) {
        did401Refresh = true;
        auth.forceRefresh();
        authHeaders = await auth.getAuthHeaders();
        attempt--; // neutralize this iteration's increment: retry, no backoff
        continue;
      }

      // HTTP-level rate limiting → back off and retry.
      if (response.status === 429) {
        lastRateLimit = { httpStatus: 429 };
        if (attempt < maxRetries) continue;
        throw new CatalogError("RATE_LIMITED", "Catalog rate limit exceeded (HTTP 429)", {
          httpStatus: 429,
        });
      }

      // Try to parse the body as JSON-RPC. Non-JSON on a non-2xx is a transport error.
      let payload: JsonRpcResponse | undefined;
      let parseFailed = false;
      try {
        payload = (await response.json()) as JsonRpcResponse;
      } catch {
        parseFailed = true;
      }

      if (parseFailed || payload == null) {
        if (response.status >= 500 && attempt < maxRetries) continue;
        throw new CatalogError(
          "TRANSPORT_ERROR",
          `Catalog returned a non-JSON response (HTTP ${response.status})`,
          { httpStatus: response.status },
        );
      }

      // Top-level JSON-RPC error (transport/discovery or rate-limit body).
      if (payload.error) {
        if (isRateLimitError(payload.error)) {
          lastRateLimit = { httpStatus: response.status, jsonrpcError: payload.error };
          if (attempt < maxRetries) continue;
          throw new CatalogError("RATE_LIMITED", "Catalog rate limit exceeded", {
            httpStatus: response.status,
            jsonrpcError: payload.error,
          });
        }
        // 5xx with a JSON-RPC error is still worth retrying.
        if (response.status >= 500 && attempt < maxRetries) continue;
        throw new CatalogError(
          "TOOL_ERROR",
          jsonrpcErrorMessage(payload.error),
          { httpStatus: response.status, jsonrpcError: payload.error },
        );
      }

      // HTTP 5xx without a JSON-RPC error → retry.
      if (response.status >= 500) {
        if (attempt < maxRetries) continue;
        throw new CatalogError(
          "TRANSPORT_ERROR",
          `Catalog server error (HTTP ${response.status})`,
          { httpStatus: response.status },
        );
      }

      // Tool-argument error: HTTP 200 with result.isError and no structuredContent.
      if (payload.result?.isError) {
        throw new CatalogError(
          "TOOL_ERROR",
          toolErrorMessage(payload.result.content),
          {
            httpStatus: response.status,
            messages: payload.result.content,
          },
        );
      }

      // Any other non-2xx we didn't classify above.
      if (!response.ok) {
        throw new CatalogError(
          "TRANSPORT_ERROR",
          `Catalog request failed (HTTP ${response.status})`,
          { httpStatus: response.status },
        );
      }

      // Success — prefer structuredContent, fall back to the whole result.
      const result = payload.result ?? {};
      return result.structuredContent !== undefined ? result.structuredContent : result;
    }

    // Loop exhausted only via rate-limit retries.
    throw new CatalogError("RATE_LIMITED", "Catalog rate limit exceeded", {
      httpStatus: lastRateLimit?.httpStatus,
      jsonrpcError: lastRateLimit?.jsonrpcError,
    });
  }

  return { callTool };
}

function jsonrpcErrorMessage(error: JsonRpcError): string {
  const parts = [error.message, stringifyData(error.data)].filter(Boolean);
  return parts.length ? `Catalog tool error: ${parts.join(" — ")}` : "Catalog tool error";
}

function toolErrorMessage(content: unknown[] | undefined): string {
  if (Array.isArray(content)) {
    const text = content
      .map((c) =>
        c && typeof c === "object" && "text" in c
          ? String((c as { text: unknown }).text)
          : "",
      )
      .filter(Boolean)
      .join("; ");
    if (text) return `Catalog tool error: ${text}`;
  }
  return "Catalog tool error";
}
