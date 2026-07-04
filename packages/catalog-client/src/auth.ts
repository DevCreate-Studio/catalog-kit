/**
 * Auth tier ladder for the Shopify Global Catalog (UCP).
 *
 * Two tiers are supported:
 *  - **anonymous** (default): no credentials, no `Authorization` header —
 *    catalog tools at the lowest rate-limit tier. Keyless works out of the box.
 *  - **token**: Dev Dashboard `client_credentials` exchanged for a short-lived
 *    JWT (~60min TTL) at {@link ENDPOINTS.token}, refreshed 5 minutes early.
 *
 * `fetch` and `now` are injectable so the whole thing is testable without real
 * network or a real clock.
 */

import { ENDPOINTS } from "./endpoints";
import { CatalogError } from "./errors";

/** Refresh the token this many milliseconds before it actually expires. */
const REFRESH_EARLY_MS = 300 * 1000;

export type AuthTier = "anonymous" | "token";

export interface CreateAuthOptions {
  clientId?: string;
  clientSecret?: string;
  /** Injectable fetch (defaults to the global `fetch`). */
  fetch?: typeof fetch;
  /** Injectable clock returning epoch milliseconds (defaults to `Date.now`). */
  now?: () => number;
}

export interface Auth {
  /** Resolves the headers to merge into a catalog request (empty when anonymous). */
  getAuthHeaders(): Promise<Record<string, string>>;
  /**
   * Invalidate any cached token so the next {@link getAuthHeaders} performs a
   * fresh exchange. Used by the transport to reactively refresh on an HTTP 401
   * (a token the server rejected mid-flight — e.g. revoked or clock-skewed).
   * No-op on the anonymous tier (there is no token to clear). Finding #14.
   */
  forceRefresh(): void;
  readonly tier: AuthTier;
}

interface CachedToken {
  accessToken: string;
  /** Epoch ms at which we should refresh (already accounts for early refresh). */
  refreshAt: number;
}

interface TokenExchangeResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
}

export function createAuth(options: CreateAuthOptions = {}): Auth {
  const { clientId, clientSecret } = options;
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;

  const hasCredentials = Boolean(clientId && clientSecret);
  const tier: AuthTier = hasCredentials ? "token" : "anonymous";

  let cached: CachedToken | undefined;
  let inFlight: Promise<CachedToken> | undefined;

  async function exchange(): Promise<CachedToken> {
    const response = await fetchImpl(ENDPOINTS.token, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      }),
    });

    if (!response.ok) {
      throw new CatalogError(
        "AUTH_FAILED",
        `Token exchange failed with HTTP ${response.status}`,
        { httpStatus: response.status },
      );
    }

    const body = (await response.json()) as TokenExchangeResponse;
    if (!body.access_token) {
      throw new CatalogError(
        "AUTH_FAILED",
        "Token exchange response did not include an access_token",
        { httpStatus: response.status },
      );
    }

    const expiresInMs = (body.expires_in ?? 0) * 1000;
    return {
      accessToken: body.access_token,
      refreshAt: now() + expiresInMs - REFRESH_EARLY_MS,
    };
  }

  async function getToken(): Promise<CachedToken> {
    if (cached && now() < cached.refreshAt) {
      return cached;
    }
    // Dedupe concurrent refreshes: everyone awaits the same in-flight exchange.
    if (!inFlight) {
      inFlight = exchange()
        .then((token) => {
          cached = token;
          return token;
        })
        .finally(() => {
          inFlight = undefined;
        });
    }
    return inFlight;
  }

  return {
    tier,
    async getAuthHeaders(): Promise<Record<string, string>> {
      if (!hasCredentials) {
        return {};
      }
      const token = await getToken();
      return { Authorization: `Bearer ${token.accessToken}` };
    },
    forceRefresh(): void {
      // Drop the cached token; the next getToken() will re-exchange. An
      // in-flight exchange is left alone (it is already fresh).
      cached = undefined;
    },
  };
}
