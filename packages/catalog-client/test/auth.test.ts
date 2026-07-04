import { describe, expect, it, vi } from "vitest";
import { createAuth } from "../src/auth";
import { ENDPOINTS } from "../src/endpoints";
import { CatalogError } from "../src/errors";

function tokenResponse(
  body: Record<string, unknown>,
  init: { status?: number } = {},
): Response {
  const status = init.status ?? 200;
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const CREDS = { clientId: "cid", clientSecret: "secret" };

describe("createAuth — anonymous tier", () => {
  it("resolves empty headers and never fetches when no credentials", async () => {
    const fetchMock = vi.fn();
    const auth = createAuth({ fetch: fetchMock });

    expect(auth.tier).toBe("anonymous");
    await expect(auth.getAuthHeaders()).resolves.toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("createAuth — token tier", () => {
  it("exchanges client_credentials and returns a Bearer header", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit): Promise<Response> =>
        tokenResponse({
          access_token: "tok1",
          scope: "read_global_api_catalog_search",
          expires_in: 3600,
        }),
    );
    const auth = createAuth({ ...CREDS, fetch: fetchMock as unknown as typeof fetch });

    expect(auth.tier).toBe("token");
    const headers = await auth.getAuthHeaders();
    expect(headers).toEqual({ Authorization: "Bearer tok1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(ENDPOINTS.token);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      "content-type": "application/json",
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      client_id: "cid",
      client_secret: "secret",
      grant_type: "client_credentials",
    });
  });

  it("caches the token within TTL (no second fetch)", async () => {
    const fetchMock = vi.fn(async () =>
      tokenResponse({ access_token: "tok1", expires_in: 3600 }),
    );
    const auth = createAuth({ ...CREDS, fetch: fetchMock });

    await auth.getAuthHeaders();
    await auth.getAuthHeaders();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes 5 minutes early once the clock passes expires_in - 300s", async () => {
    let current = 0;
    const now = () => current;
    let n = 0;
    const fetchMock = vi.fn(async () =>
      tokenResponse({ access_token: `tok${++n}`, expires_in: 3600 }),
    );
    const auth = createAuth({ ...CREDS, fetch: fetchMock, now });

    expect(await auth.getAuthHeaders()).toEqual({ Authorization: "Bearer tok1" });

    // Just before the refresh-early threshold (3600 - 300 = 3300s): still cached.
    current = (3300 - 1) * 1000;
    expect(await auth.getAuthHeaders()).toEqual({ Authorization: "Bearer tok1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Past the refresh-early threshold: re-fetch.
    current = 3301 * 1000;
    expect(await auth.getAuthHeaders()).toEqual({ Authorization: "Bearer tok2" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws CatalogError AUTH_FAILED on a 401 from the token endpoint", async () => {
    const fetchMock = vi.fn(async () =>
      tokenResponse({ error: "invalid_client" }, { status: 401 }),
    );
    const auth = createAuth({ ...CREDS, fetch: fetchMock });

    await expect(auth.getAuthHeaders()).rejects.toMatchObject({
      code: "AUTH_FAILED",
      httpStatus: 401,
    });
    await expect(auth.getAuthHeaders()).rejects.toBeInstanceOf(CatalogError);
  });

  it("clears inFlight on failure so a subsequent call can succeed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse({ error: "server_error" }, { status: 500 }))
      .mockResolvedValueOnce(tokenResponse({ access_token: "tok1", expires_in: 3600 }));
    const auth = createAuth({ ...CREDS, fetch: fetchMock as unknown as typeof fetch });

    await expect(auth.getAuthHeaders()).rejects.toMatchObject({
      code: "AUTH_FAILED",
      httpStatus: 500,
    });

    // A second call after the failure must retry the exchange (not hang on a
    // stale inFlight promise) and succeed.
    await expect(auth.getAuthHeaders()).resolves.toEqual({
      Authorization: "Bearer tok1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("forceRefresh() clears the cache so the next call re-exchanges (#14)", async () => {
    let n = 0;
    const fetchMock = vi.fn(async () =>
      tokenResponse({ access_token: `tok${++n}`, expires_in: 3600 }),
    );
    const auth = createAuth({ ...CREDS, fetch: fetchMock });

    expect(await auth.getAuthHeaders()).toEqual({ Authorization: "Bearer tok1" });
    // Still within TTL — cached, no second fetch.
    expect(await auth.getAuthHeaders()).toEqual({ Authorization: "Bearer tok1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Force a refresh: the next call must re-exchange despite the fresh TTL.
    auth.forceRefresh();
    expect(await auth.getAuthHeaders()).toEqual({ Authorization: "Bearer tok2" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("forceRefresh() is a no-op on the anonymous tier", async () => {
    const fetchMock = vi.fn();
    const auth = createAuth({ fetch: fetchMock });
    expect(auth.tier).toBe("anonymous");
    expect(() => auth.forceRefresh()).not.toThrow();
    await expect(auth.getAuthHeaders()).resolves.toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dedupes concurrent first calls into a single fetch", async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const auth = createAuth({ ...CREDS, fetch: fetchMock });

    const all = Promise.all([
      auth.getAuthHeaders(),
      auth.getAuthHeaders(),
      auth.getAuthHeaders(),
    ]);
    resolveFetch(tokenResponse({ access_token: "tok1", expires_in: 3600 }));
    const results = await all;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const r of results) {
      expect(r).toEqual({ Authorization: "Bearer tok1" });
    }
  });
});
