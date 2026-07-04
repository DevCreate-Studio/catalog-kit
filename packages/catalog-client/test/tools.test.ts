import { describe, expect, it, vi } from "vitest";

import { CatalogError } from "../src/errors";
import { createTransport } from "../src/transport";
import { createAuth } from "../src/auth";
import { searchCatalog } from "../src/tools/search";
import { lookupCatalog } from "../src/tools/lookup";
import { getProduct } from "../src/tools/get-product";
import {
  searchResultSchema,
  lookupResultSchema,
  getProductResultSchema,
} from "../src/schemas/responses";
import { createCatalogClient } from "../src/index";
import { storefrontCatalog, ENDPOINTS } from "../src/endpoints";
import type { CatalogConfig } from "../src/config";

import searchBasic from "../fixtures/search-basic.json";
import searchEmpty from "../fixtures/search-empty.json";
import lookupFixture from "../fixtures/lookup.json";
import getProductFixture from "../fixtures/get-product.json";

const ENDPOINT = ENDPOINTS.globalCatalog;
const PROFILE = "https://example.com/agent-profile.json";

type FetchArgs = [string, RequestInit];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Build tool deps (transport + injectable fetch) with a mocked fetch queue. */
function makeDeps(overrides: Record<string, unknown> = {}) {
  const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>();
  const transport = createTransport({
    endpoint: ENDPOINT,
    agentProfileUrl: PROFILE,
    auth: createAuth(),
    fetch: fetchMock as unknown as typeof fetch,
    sleep: async () => {},
    ...overrides,
  });
  return { fetchMock, deps: { transport, fetch: fetchMock as unknown as typeof fetch } };
}

/** Read the wire request body from the nth fetch call. */
function wireBody(fetchMock: ReturnType<typeof vi.fn>, call = 0): any {
  const [, init] = fetchMock.mock.calls[call] as FetchArgs;
  return JSON.parse(init.body as string);
}

const giftFinder: CatalogConfig = {
  version: 1,
  name: "gift-finder",
  scope: { type: "global" },
  query: "cozy gift under 25",
  context: { intent: "gift" },
  filters: { available: true, price: { max: 2500 } },
  pagination: { limit: 12 },
};

describe("response schemas — lenient (2.5)", () => {
  it("round-trips unknown/extra fields via passthrough", () => {
    const sc = (searchBasic as any).result.structuredContent;
    const withExtra = {
      ...sc,
      inventedTopLevel: "keep me",
      products: [{ ...sc.products[0], inventedProductField: 42 }],
    };
    const parsed = searchResultSchema.parse(withExtra);
    expect((parsed as any).inventedTopLevel).toBe("keep me");
    expect((parsed.products?.[0] as any).inventedProductField).toBe(42);
  });

  it("parses search-empty.json to products: []", () => {
    const parsed = searchResultSchema.parse(
      (searchEmpty as any).result.structuredContent,
    );
    expect(parsed.products).toEqual([]);
  });

  it("lookupResultSchema and getProductResultSchema also passthrough", () => {
    const lu = lookupResultSchema.parse({
      ...(lookupFixture as any).result.structuredContent,
      invented: true,
    });
    expect((lu as any).invented).toBe(true);
    const gp = getProductResultSchema.parse({
      ...(getProductFixture as any).result.structuredContent,
      invented: true,
    });
    expect((gp as any).invented).toBe(true);
    expect(gp.product).toBeDefined();
  });
});

describe("searchCatalog (1)", () => {
  it("returns a typed result with products from search-basic.json", async () => {
    const { fetchMock, deps } = makeDeps();
    fetchMock.mockResolvedValueOnce(jsonResponse(searchBasic));
    const result = await searchCatalog(deps, giftFinder);
    expect(result.products?.length).toBe(5);
    expect(result.products?.[0]?.title).toBeTypeOf("string");
    const body = wireBody(fetchMock);
    expect(body.params.name).toBe("search_catalog");
    expect(body.params.arguments.catalog.query).toBe("cozy gift under 25");
  });

  it("search-empty.json → products []", async () => {
    const { fetchMock, deps } = makeDeps();
    fetchMock.mockResolvedValueOnce(jsonResponse(searchEmpty));
    const result = await searchCatalog(deps, {
      version: 1,
      scope: { type: "global" },
      query: "xzqvwkjhgfdsa",
      filters: { price: { max: 1 } },
    });
    expect(result.products).toEqual([]);
  });
});

describe("searchCatalog — image_url like resolution (2)", () => {
  it("resolves image_url to inline base64 on the wire", async () => {
    const { fetchMock, deps } = makeDeps();
    // image fetch (via deps.fetch) returns a tiny jpeg
    const imgBytes = new Uint8Array([1, 2, 3, 4, 5]);
    fetchMock.mockResolvedValueOnce(
      new Response(imgBytes, {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }),
    );
    // then the catalog API call
    fetchMock.mockResolvedValueOnce(jsonResponse(searchBasic));

    await searchCatalog(deps, {
      version: 1,
      scope: { type: "global" },
      like: [{ image_url: "https://cdn.example.com/ref.jpg" }],
    });

    // second fetch is the API call
    const body = wireBody(fetchMock, 1);
    const like = body.params.arguments.catalog.like;
    expect(like).toHaveLength(1);
    expect(like[0].image.content_type).toBe("image/jpeg");
    expect(typeof like[0].image.data).toBe("string");
    expect(like[0].image_url).toBeUndefined();
  });
});

describe("lookupCatalog (3)", () => {
  it("rejects 0 ids with INVALID_CONFIG and no fetch", async () => {
    const { fetchMock, deps } = makeDeps();
    await expect(lookupCatalog(deps, { ids: [] })).rejects.toMatchObject({
      code: "INVALID_CONFIG",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects 51 ids with INVALID_CONFIG and no fetch", async () => {
    const { fetchMock, deps } = makeDeps();
    const ids = Array.from({ length: 51 }, (_, i) => `id-${i}`);
    await expect(lookupCatalog(deps, { ids })).rejects.toBeInstanceOf(
      CatalogError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("happy path parses lookup.json", async () => {
    const { fetchMock, deps } = makeDeps();
    fetchMock.mockResolvedValueOnce(jsonResponse(lookupFixture));
    const result = await lookupCatalog(deps, {
      ids: ["gid://shopify/p/2jH1G1bSch4rBP21t4dUYw"],
    });
    expect(result.products?.length).toBe(1);
    const body = wireBody(fetchMock);
    expect(body.params.name).toBe("lookup_catalog");
    expect(body.params.arguments.catalog.ids).toEqual([
      "gid://shopify/p/2jH1G1bSch4rBP21t4dUYw",
    ]);
  });
});

describe("getProduct (4)", () => {
  it("passes selected/preferences through verbatim and parses product", async () => {
    const { fetchMock, deps } = makeDeps();
    fetchMock.mockResolvedValueOnce(jsonResponse(getProductFixture));
    const result = await getProduct(deps, {
      id: "gid://shopify/p/2jH1G1bSch4rBP21t4dUYw",
      selected: [{ name: "Color", value: "Green" }],
      preferences: { currency: "USD" },
    });
    expect(result.product).toBeDefined();
    const body = wireBody(fetchMock);
    expect(body.params.name).toBe("get_product");
    expect(body.params.arguments.catalog).toEqual({
      id: "gid://shopify/p/2jH1G1bSch4rBP21t4dUYw",
      selected: [{ name: "Color", value: "Green" }],
      preferences: { currency: "USD" },
    });
  });

  it("omits absent selected/preferences", async () => {
    const { fetchMock, deps } = makeDeps();
    fetchMock.mockResolvedValueOnce(jsonResponse(getProductFixture));
    await getProduct(deps, { id: "gid://shopify/p/abc" });
    const body = wireBody(fetchMock);
    expect(body.params.arguments.catalog).toEqual({ id: "gid://shopify/p/abc" });
  });
});

describe("createCatalogClient (5)", () => {
  it("anonymous default sends no Authorization header", async () => {
    const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>();
    fetchMock.mockResolvedValueOnce(jsonResponse(searchBasic));
    const client = createCatalogClient({
      agentProfileUrl: PROFILE,
      fetch: fetchMock as unknown as typeof fetch,
      timeoutMs: 1000,
      maxRetries: 0,
    });
    expect(client.tier).toBe("anonymous");
    await client.searchCatalog(giftFinder);
    const [, init] = fetchMock.mock.calls[0] as FetchArgs;
    const headers = init.headers as Record<string, string>;
    const hasAuth = Object.keys(headers).some(
      (k) => k.toLowerCase() === "authorization",
    );
    expect(hasAuth).toBe(false);
  });

  it("endpoint precedence: explicit > storefront > global", async () => {
    // explicit wins
    {
      const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>();
      fetchMock.mockResolvedValueOnce(jsonResponse(searchBasic));
      const client = createCatalogClient({
        agentProfileUrl: PROFILE,
        endpoint: "https://explicit.example.com/x",
        scope: { type: "storefront", storeDomain: "shop.example.com" },
        fetch: fetchMock as unknown as typeof fetch,
        maxRetries: 0,
      });
      await client.searchCatalog(giftFinder);
      expect((fetchMock.mock.calls[0] as FetchArgs)[0]).toBe(
        "https://explicit.example.com/x",
      );
    }
    // storefront scope wins over global default
    {
      const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>();
      fetchMock.mockResolvedValueOnce(jsonResponse(searchBasic));
      const client = createCatalogClient({
        agentProfileUrl: PROFILE,
        scope: { type: "storefront", storeDomain: "shop.example.com" },
        fetch: fetchMock as unknown as typeof fetch,
        maxRetries: 0,
      });
      await client.searchCatalog(giftFinder);
      expect((fetchMock.mock.calls[0] as FetchArgs)[0]).toBe(
        storefrontCatalog("shop.example.com"),
      );
    }
    // global default
    {
      const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>();
      fetchMock.mockResolvedValueOnce(jsonResponse(searchBasic));
      const client = createCatalogClient({
        agentProfileUrl: PROFILE,
        fetch: fetchMock as unknown as typeof fetch,
        maxRetries: 0,
      });
      await client.searchCatalog(giftFinder);
      expect((fetchMock.mock.calls[0] as FetchArgs)[0]).toBe(
        ENDPOINTS.globalCatalog,
      );
    }
  });

  it("client-level endpoint is not overridden by a per-call storefront config", async () => {
    const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>();
    fetchMock.mockResolvedValueOnce(jsonResponse(searchBasic));
    const client = createCatalogClient({
      agentProfileUrl: PROFILE,
      fetch: fetchMock as unknown as typeof fetch,
      maxRetries: 0,
    });
    // config carries a storefront scope, but client endpoint (global) wins
    await client.searchCatalog({
      version: 1,
      scope: { type: "storefront", storeDomain: "other.example.com" },
      query: "hats",
    });
    expect((fetchMock.mock.calls[0] as FetchArgs)[0]).toBe(
      ENDPOINTS.globalCatalog,
    );
  });

  it("lookupCatalog happy path through the façade", async () => {
    const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>();
    fetchMock.mockResolvedValueOnce(jsonResponse(lookupFixture));
    const client = createCatalogClient({
      agentProfileUrl: PROFILE,
      fetch: fetchMock as unknown as typeof fetch,
      maxRetries: 0,
    });

    const result = await client.lookupCatalog({
      ids: ["gid://shopify/p/2jH1G1bSch4rBP21t4dUYw"],
    });

    expect(result.products?.length).toBe(1);
    const [, init] = fetchMock.mock.calls[0] as FetchArgs;
    const body = JSON.parse(init.body as string);
    expect(body.params.name).toBe("lookup_catalog");
    expect(body.params.arguments.catalog.ids).toEqual([
      "gid://shopify/p/2jH1G1bSch4rBP21t4dUYw",
    ]);
  });

  it("getProduct happy path through the façade", async () => {
    const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>();
    fetchMock.mockResolvedValueOnce(jsonResponse(getProductFixture));
    const client = createCatalogClient({
      agentProfileUrl: PROFILE,
      fetch: fetchMock as unknown as typeof fetch,
      maxRetries: 0,
    });

    const result = await client.getProduct({
      id: "gid://shopify/p/2jH1G1bSch4rBP21t4dUYw",
    });

    expect(result.product).toBeDefined();
    const [, init] = fetchMock.mock.calls[0] as FetchArgs;
    const body = JSON.parse(init.body as string);
    expect(body.params.name).toBe("get_product");
    expect(body.params.arguments.catalog).toEqual({
      id: "gid://shopify/p/2jH1G1bSch4rBP21t4dUYw",
    });
  });
});

describe("searchCatalog — null products normalization (#10, #18a)", () => {
  it("normalizes a {products:null} body to [] (no ZodError)", async () => {
    const { fetchMock, deps } = makeDeps();
    // structuredContent explicitly carries products: null.
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: { structuredContent: { products: null } },
      }),
    );
    const result = await searchCatalog(deps, giftFinder);
    expect(result.products).toEqual([]);
  });

  it("a genuinely malformed body → CatalogError TRANSPORT_ERROR (not raw ZodError)", async () => {
    const { fetchMock, deps } = makeDeps();
    // products is the wrong type entirely (a string) — fails the array schema.
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: { structuredContent: { products: "totally-not-an-array" } },
      }),
    );
    let err: unknown;
    try {
      await searchCatalog(deps, giftFinder);
    } catch (e) {
      err = e;
    }
    // Must be a CatalogError TRANSPORT_ERROR, not a bare ZodError.
    expect(err).toBeInstanceOf(CatalogError);
    expect((err as CatalogError).code).toBe("TRANSPORT_ERROR");
  });
});

describe("getProduct — null product normalization (#10)", () => {
  it("normalizes a {product:null} body to undefined", async () => {
    const { fetchMock, deps } = makeDeps();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: { structuredContent: { product: null } },
      }),
    );
    const result = await getProduct(deps, { id: "gid://shopify/p/abc" });
    expect(result.product).toBeUndefined();
  });
});

describe("lookupCatalog — non-array ids (#18c)", () => {
  it("throws INVALID_CONFIG when ids is undefined", async () => {
    const { fetchMock, deps } = makeDeps();
    await expect(
      lookupCatalog(deps, { ids: undefined as unknown as string[] }),
    ).rejects.toMatchObject({ code: "INVALID_CONFIG" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws INVALID_CONFIG when ids is a string", async () => {
    const { fetchMock, deps } = makeDeps();
    await expect(
      lookupCatalog(deps, { ids: "gid://x" as unknown as string[] }),
    ).rejects.toMatchObject({ code: "INVALID_CONFIG" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("createCatalogClient — agentProfileUrl guard (#3, #4dx)", () => {
  it("throws INVALID_CONFIG before any network when the URL is empty", () => {
    let err: CatalogError | undefined;
    try {
      createCatalogClient({ agentProfileUrl: "" });
    } catch (e) {
      err = e as CatalogError;
    }
    expect(err?.code).toBe("INVALID_CONFIG");
    expect(err?.message).toContain("docs/getting-started.md#agent-profile");
  });

  it("throws INVALID_CONFIG for a whitespace-only URL", () => {
    expect(() => createCatalogClient({ agentProfileUrl: "   " })).toThrow(
      CatalogError,
    );
  });

  it("throws INVALID_CONFIG for a localhost URL (Shopify can't reach it)", () => {
    let err: CatalogError | undefined;
    try {
      createCatalogClient({
        agentProfileUrl: "http://localhost:3000/agent-profile.json",
      });
    } catch (e) {
      err = e as CatalogError;
    }
    expect(err?.code).toBe("INVALID_CONFIG");
    expect(err?.message).toContain("docs/getting-started.md#agent-profile");
  });

  it("throws INVALID_CONFIG for a 127.0.0.1 URL", () => {
    expect(() =>
      createCatalogClient({ agentProfileUrl: "http://127.0.0.1:3000/p.json" }),
    ).toThrow(CatalogError);
  });

  it("does NOT throw for a valid public https URL", () => {
    const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>();
    expect(() =>
      createCatalogClient({
        agentProfileUrl: PROFILE,
        fetch: fetchMock as unknown as typeof fetch,
      }),
    ).not.toThrow();
  });
});
