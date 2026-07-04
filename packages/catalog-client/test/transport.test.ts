import { describe, expect, it, vi } from "vitest";
import { createAuth } from "../src/auth";
import { CatalogError } from "../src/errors";
import { createTransport } from "../src/transport";
import searchBasic from "../fixtures/search-basic.json";
import errorInvalidFilter from "../fixtures/error-invalid-filter.json";
import toolsList from "../fixtures/tools-list.json";

const FIXTURES: Record<string, unknown> = {
  "search-basic.json": searchBasic,
  "error-invalid-filter.json": errorInvalidFilter,
  "tools-list.json": toolsList,
};
const fixture = (name: string): unknown => FIXTURES[name];

/** The transport always sends a plain-object headers bag; read it as one. */
function headersOf(init: RequestInit): Record<string, string> {
  return init.headers as Record<string, string>;
}

const ENDPOINT = "https://catalog.shopify.com/api/ucp/mcp";
const PROFILE = "https://example.com/agent-profile.json";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A never-sleep so backoff waits don't slow the suite; records the delays. */
function recordingSleep() {
  const delays: number[] = [];
  const sleep = vi.fn(async (ms: number) => {
    delays.push(ms);
  });
  return { delays, sleep };
}

type FetchArgs = [string, RequestInit];

function anonTransport(overrides: Record<string, unknown> = {}) {
  const { sleep } = recordingSleep();
  const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>();
  return {
    fetchMock,
    transport: createTransport({
      endpoint: ENDPOINT,
      agentProfileUrl: PROFILE,
      auth: createAuth(),
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
      ...overrides,
    }),
  };
}

describe("createTransport — request envelope (a)", () => {
  it("posts the exact JSON-RPC tools/call envelope with profile injected in params.arguments.meta", async () => {
    const { fetchMock, transport } = anonTransport();
    fetchMock.mockResolvedValue(jsonResponse(fixture("search-basic.json")));

    const catalogArgs = { query: "wireless headphones", pagination: { limit: 5 } };
    await transport.callTool("search_catalog", catalogArgs);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe("POST");
    const headers = headersOf(init);
    expect(headers["content-type"] ?? headers["Content-Type"]).toBe(
      "application/json",
    );

    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: "search_catalog",
        arguments: {
          meta: { "ucp-agent": { profile: PROFILE } },
          catalog: catalogArgs,
        },
      },
    });
    expect(typeof body.id).toBe("number");
  });
});

describe("createTransport — auth headers (b)", () => {
  it("merges a token-tier Authorization header into the request", async () => {
    const tokenFetch = vi.fn(async () =>
      jsonResponse({ access_token: "tok1", expires_in: 3600 }),
    );
    const auth = createAuth({
      clientId: "cid",
      clientSecret: "secret",
      fetch: tokenFetch as unknown as typeof fetch,
    });
    const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>(
      async () => jsonResponse(fixture("search-basic.json")),
    );
    const { sleep } = recordingSleep();
    const transport = createTransport({
      endpoint: ENDPOINT,
      agentProfileUrl: PROFILE,
      auth,
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
    });

    await transport.callTool("search_catalog", { query: "x" });

    const headers = headersOf(fetchMock.mock.calls[0][1]);
    expect(headers.Authorization ?? headers.authorization).toBe("Bearer tok1");
  });

  it("sends no Authorization header on the anonymous tier", async () => {
    const { fetchMock, transport } = anonTransport();
    fetchMock.mockResolvedValue(jsonResponse(fixture("search-basic.json")));

    await transport.callTool("search_catalog", { query: "x" });

    const headers = headersOf(fetchMock.mock.calls[0][1]);
    expect(headers.Authorization).toBeUndefined();
    expect(headers.authorization).toBeUndefined();
  });
});

describe("createTransport — HTTP 429 retry (c)", () => {
  it("retries with increasing backoff then throws RATE_LIMITED after max retries", async () => {
    const { delays, sleep } = recordingSleep();
    const fetchMock = vi.fn(async () => jsonResponse({}, 429));
    const transport = createTransport({
      endpoint: ENDPOINT,
      agentProfileUrl: PROFILE,
      auth: createAuth(),
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
      maxRetries: 3,
    });

    await expect(transport.callTool("search_catalog", { query: "x" })).rejects.toMatchObject(
      { code: "RATE_LIMITED", httpStatus: 429 },
    );

    // 1 initial + 3 retries = 4 calls.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    // Slept before each of the 3 retries, with strictly increasing base delays.
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(delays.length).toBe(3);
    expect(delays[1]).toBeGreaterThan(delays[0]);
    expect(delays[2]).toBeGreaterThan(delays[1]);
  });
});

describe("createTransport — JSON-RPC -32600 rate-limit body (d)", () => {
  it("retries a -32600 'Rate limit exceeded' body (observed HTTP 4xx case)", async () => {
    const { sleep } = recordingSleep();
    const rateBody = {
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32600, message: "Invalid Request", data: "Rate limit exceeded" },
    };
    const fetchMock = vi.fn(async () => jsonResponse(rateBody, 400));
    const transport = createTransport({
      endpoint: ENDPOINT,
      agentProfileUrl: PROFILE,
      auth: createAuth(),
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
      maxRetries: 3,
    });

    await expect(transport.callTool("search_catalog", { query: "x" })).rejects.toMatchObject(
      { code: "RATE_LIMITED" },
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it("retries a -32600 rate-limit body delivered on HTTP 200 too", async () => {
    const { sleep } = recordingSleep();
    const rateBody = {
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32600, message: "Invalid Request", data: "Rate limit exceeded" },
    };
    let n = 0;
    const fetchMock = vi.fn(async () => {
      n += 1;
      return n === 1
        ? jsonResponse(rateBody, 200)
        : jsonResponse(fixture("search-basic.json"), 200);
    });
    const transport = createTransport({
      endpoint: ENDPOINT,
      agentProfileUrl: PROFILE,
      auth: createAuth(),
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
      maxRetries: 3,
    });

    const result = await transport.callTool("search_catalog", { query: "x" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty("products");
  });
});

describe("createTransport — 5xx retry / 4xx no retry (e)", () => {
  it("retries HTTP 5xx", async () => {
    const { sleep } = recordingSleep();
    let n = 0;
    const fetchMock = vi.fn(async () => {
      n += 1;
      return n < 2 ? jsonResponse({}, 503) : jsonResponse(fixture("search-basic.json"));
    });
    const transport = createTransport({
      endpoint: ENDPOINT,
      agentProfileUrl: PROFILE,
      auth: createAuth(),
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
      maxRetries: 3,
    });

    const result = await transport.callTool("search_catalog", { query: "x" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toHaveProperty("products");
  });

  it("does NOT retry a non-rate-limit 422 with a jsonrpc error → TOOL_ERROR carrying jsonrpcError", async () => {
    const { sleep } = recordingSleep();
    const errBody = fixture("tools-list.json"); // -32001 UCP discovery failed
    const fetchMock = vi.fn(async () => jsonResponse(errBody, 422));
    const transport = createTransport({
      endpoint: ENDPOINT,
      agentProfileUrl: PROFILE,
      auth: createAuth(),
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
      maxRetries: 3,
    });

    await expect(
      transport.callTool("search_catalog", { query: "x" }),
    ).rejects.toMatchObject({
      code: "TOOL_ERROR",
      httpStatus: 422,
      jsonrpcError: (errBody as { error: unknown }).error,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("throws TRANSPORT_ERROR for a non-JSON 400 body (no retry)", async () => {
    const { sleep } = recordingSleep();
    const fetchMock = vi.fn(
      async () =>
        new Response("<html>gateway</html>", {
          status: 400,
          headers: { "content-type": "text/html" },
        }),
    );
    const transport = createTransport({
      endpoint: ENDPOINT,
      agentProfileUrl: PROFILE,
      auth: createAuth(),
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
      maxRetries: 3,
    });

    await expect(
      transport.callTool("search_catalog", { query: "x" }),
    ).rejects.toMatchObject({ code: "TRANSPORT_ERROR", httpStatus: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws TRANSPORT_ERROR when fetch rejects with a plain (non-abort) error", async () => {
    const { sleep } = recordingSleep();
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const transport = createTransport({
      endpoint: ENDPOINT,
      agentProfileUrl: PROFILE,
      auth: createAuth(),
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
      maxRetries: 3,
    });

    await expect(
      transport.callTool("search_catalog", { query: "x" }),
    ).rejects.toMatchObject({ code: "TRANSPORT_ERROR" });
    // Not an abort/timeout, and not retried as a network-level failure.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe("createTransport — timeout (f)", () => {
  it("aborts and throws TIMEOUT when the request outlives timeoutMs", async () => {
    const { sleep } = recordingSleep();
    // fetch that rejects with an AbortError when its signal fires.
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init.signal;
          if (signal?.aborted) {
            reject(makeAbortError());
            return;
          }
          signal?.addEventListener("abort", () => reject(makeAbortError()));
        }),
    );
    const transport = createTransport({
      endpoint: ENDPOINT,
      agentProfileUrl: PROFILE,
      auth: createAuth(),
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
      timeoutMs: 20,
      maxRetries: 0,
    });

    await expect(
      transport.callTool("search_catalog", { query: "x" }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});

function makeAbortError(): Error {
  const err = new Error("The operation was aborted");
  err.name = "AbortError";
  return err;
}

describe("createTransport — result.isError tool error (g)", () => {
  it("throws TOOL_ERROR with messages populated from result.content", async () => {
    const { sleep } = recordingSleep();
    const errBody = fixture("error-invalid-filter.json");
    const fetchMock = vi.fn(async () => jsonResponse(errBody, 200));
    const transport = createTransport({
      endpoint: ENDPOINT,
      agentProfileUrl: PROFILE,
      auth: createAuth(),
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
      maxRetries: 3,
    });

    const err: CatalogError = await transport
      .callTool("search_catalog", { filters: { categories: [{ id: "x" }] } })
      .then(() => {
        throw new Error("expected callTool to reject");
      })
      .catch((e: unknown) => e as CatalogError);

    expect(err).toBeInstanceOf(CatalogError);
    expect(err.code).toBe("TOOL_ERROR");
    expect(err.messages).toEqual(
      (errBody as { result: { content: unknown[] } }).result.content,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("createTransport — success unwrap (h)", () => {
  it("returns result.structuredContent when present", async () => {
    const { fetchMock, transport } = anonTransport();
    const body = fixture("search-basic.json");
    fetchMock.mockResolvedValue(jsonResponse(body));

    const result = await transport.callTool("search_catalog", { query: "x" });
    expect(result).toEqual(
      (body as { result: { structuredContent: unknown } }).result.structuredContent,
    );
  });

  it("falls back to result when structuredContent is absent", async () => {
    const { fetchMock, transport } = anonTransport();
    const body = { jsonrpc: "2.0", id: 1, result: { product: { id: "gid://x" } } };
    fetchMock.mockResolvedValue(jsonResponse(body));

    const result = await transport.callTool("get_product", { id: "gid://x" });
    expect(result).toEqual(body.result);
  });
});

describe("createTransport — unclassified non-2xx (i, #18e)", () => {
  it("HTTP 418 with valid JSON but no error/isError → TRANSPORT_ERROR httpStatus 418", async () => {
    const { sleep } = recordingSleep();
    // Valid JSON, no top-level error, result present but not isError, not ok.
    const fetchMock = vi.fn(async () =>
      jsonResponse({ jsonrpc: "2.0", id: 1, result: { teapot: true } }, 418),
    );
    const transport = createTransport({
      endpoint: ENDPOINT,
      agentProfileUrl: PROFILE,
      auth: createAuth(),
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
      maxRetries: 3,
    });

    await expect(
      transport.callTool("search_catalog", { query: "x" }),
    ).rejects.toMatchObject({ code: "TRANSPORT_ERROR", httpStatus: 418 });
    // 418 is not retryable (not 429, not 5xx, not a rate-limit body).
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("createTransport — 401 reactive refresh (#14)", () => {
  it("token tier: forces one refresh + retry on 401, then succeeds", async () => {
    // Token endpoint hands out tok1 then tok2 on the forced refresh.
    let tokN = 0;
    const tokenFetch = vi.fn(async () =>
      jsonResponse({ access_token: `tok${++tokN}`, expires_in: 3600 }),
    );
    const auth = createAuth({
      clientId: "cid",
      clientSecret: "secret",
      fetch: tokenFetch as unknown as typeof fetch,
    });

    // Catalog endpoint: 401 first (stale token), success on the retry.
    let calls = 0;
    const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>(
      async () => {
        calls += 1;
        return calls === 1
          ? jsonResponse({ error: "unauthorized" }, 401)
          : jsonResponse(fixture("search-basic.json"), 200);
      },
    );
    const { sleep } = recordingSleep();
    const transport = createTransport({
      endpoint: ENDPOINT,
      agentProfileUrl: PROFILE,
      auth,
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
      maxRetries: 0, // the 401 refresh-retry must be independent of the retry budget
    });

    const result = await transport.callTool("search_catalog", { query: "x" });
    expect(result).toHaveProperty("products");
    // Two catalog attempts (401 then 200); token exchanged twice (initial + forced).
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(tokenFetch).toHaveBeenCalledTimes(2);
    // The retry carried the refreshed token.
    const retryHeaders = headersOf(fetchMock.mock.calls[1][1]);
    expect(retryHeaders.Authorization ?? retryHeaders.authorization).toBe(
      "Bearer tok2",
    );
    // No backoff sleep for the 401 refresh-retry.
    expect(sleep).not.toHaveBeenCalled();
  });

  it("token tier: a persistent 401 refreshes at most once, then surfaces", async () => {
    const tokenFetch = vi.fn(async () =>
      jsonResponse({ access_token: "tok", expires_in: 3600 }),
    );
    const auth = createAuth({
      clientId: "cid",
      clientSecret: "secret",
      fetch: tokenFetch as unknown as typeof fetch,
    });
    const fetchMock = vi.fn(async () => jsonResponse({ message: "unauthorized" }, 401));
    const { sleep } = recordingSleep();
    const transport = createTransport({
      endpoint: ENDPOINT,
      agentProfileUrl: PROFILE,
      auth,
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
      maxRetries: 0,
    });

    await expect(
      transport.callTool("search_catalog", { query: "x" }),
    ).rejects.toMatchObject({ code: "TRANSPORT_ERROR", httpStatus: 401 });
    // Initial 401 + one refresh-retry 401 = 2 catalog calls; token exchanged twice.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(tokenFetch).toHaveBeenCalledTimes(2);
  });

  it("anonymous tier: a 401 surfaces without any refresh", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ message: "unauthorized" }, 401));
    const { sleep } = recordingSleep();
    const transport = createTransport({
      endpoint: ENDPOINT,
      agentProfileUrl: PROFILE,
      auth: createAuth(), // anonymous
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
      maxRetries: 0,
    });

    await expect(
      transport.callTool("search_catalog", { query: "x" }),
    ).rejects.toMatchObject({ code: "TRANSPORT_ERROR", httpStatus: 401 });
    // No retry: anonymous has no token to refresh.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
