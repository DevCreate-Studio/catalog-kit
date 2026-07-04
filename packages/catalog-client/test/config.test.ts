import { describe, expect, it, vi } from "vitest";
import { CatalogError } from "../src/errors";
import {
  assertPublicHttpUrl,
  buildSearchArguments,
  resolveLikeEntries,
} from "../src/config";
import { catalogConfigSchema } from "../src/schemas/requests";
import type { CatalogConfig } from "../src/config";

/** A 3xx redirect Response with a Location header (manual-redirect mode). */
function redirectResponse(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

/** A 200 image Response of `data`. */
function imageResponse(data: Uint8Array, contentType = "image/jpeg"): Response {
  return new Response(data as unknown as BodyInit, {
    status: 200,
    headers: { "content-type": contentType },
  });
}

/** A gift-finder-style config exercising the common surface. */
const giftFinder: CatalogConfig = {
  version: 1,
  name: "gift-finder",
  scope: { type: "global" },
  query: "cozy gift under 25",
  context: { intent: "gift" },
  filters: {
    available: true,
    price: { max: 2500 },
    rating: { variant: { min: 4 } },
  },
  pagination: { limit: 12 },
};

describe("buildSearchArguments — wire payload (1)", () => {
  it("produces the exact catalog tool-args object", () => {
    const args = buildSearchArguments(giftFinder);
    expect(args).toEqual({
      query: "cozy gift under 25",
      context: { intent: "gift" },
      filters: {
        available: true,
        price: { max: 2500 },
        rating: { variant: { min: 4 } },
      },
      pagination: { limit: 12 },
    });
  });

  it("has no undefined leaks (survives a JSON round-trip)", () => {
    const args = buildSearchArguments(giftFinder);
    expect(JSON.parse(JSON.stringify(args))).toEqual(args);
  });

  it("never leaks scope/version/name into the wire payload", () => {
    const args = buildSearchArguments(giftFinder);
    expect(args).not.toHaveProperty("scope");
    expect(args).not.toHaveProperty("version");
    expect(args).not.toHaveProperty("name");
  });
});

describe("buildSearchArguments — savedCatalogSlug placement (2)", () => {
  it("hoists scope.savedCatalogSlug to a top-level saved_catalog_slug key", () => {
    const args = buildSearchArguments({
      version: 1,
      scope: { type: "global", savedCatalogSlug: "curated-2026" },
      query: "boots",
    });
    expect(args.saved_catalog_slug).toBe("curated-2026");
    expect(args).not.toHaveProperty("scope");
  });

  it("omits saved_catalog_slug when scope is storefront", () => {
    const args = buildSearchArguments({
      version: 1,
      scope: { type: "storefront", storeDomain: "shop.example.com" },
      query: "boots",
    });
    expect(args).not.toHaveProperty("saved_catalog_slug");
    expect(args).not.toHaveProperty("scope");
  });
});

describe("buildSearchArguments — cursor merge (3)", () => {
  it("merges a cursor into existing pagination", () => {
    const args = buildSearchArguments(giftFinder, { cursor: "abc" });
    expect(args.pagination).toEqual({ limit: 12, cursor: "abc" });
  });

  it("creates pagination when the config has none", () => {
    const args = buildSearchArguments(
      { version: 1, scope: { type: "global" }, query: "boots" },
      { cursor: "abc" },
    );
    expect(args.pagination).toEqual({ cursor: "abc" });
  });
});

describe("buildSearchArguments — validation (4)", () => {
  it("rejects a limit over 50 with INVALID_CONFIG", () => {
    let err: unknown;
    try {
      buildSearchArguments({
        version: 1,
        scope: { type: "global" },
        query: "boots",
        pagination: { limit: 80 },
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CatalogError);
    expect((err as CatalogError).code).toBe("INVALID_CONFIG");
  });

  it("rejects a category without the TaxonomyCategory GID prefix with a helpful message", () => {
    let err: unknown;
    try {
      buildSearchArguments({
        version: 1,
        scope: { type: "global" },
        query: "boots",
        filters: { categories: ["Shoes"] },
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CatalogError);
    expect((err as CatalogError).code).toBe("INVALID_CONFIG");
    const joined = JSON.stringify((err as CatalogError).messages);
    expect(joined).toContain("gid://shopify/TaxonomyCategory/");
  });

  it("rejects a config with neither query nor like", () => {
    let err: unknown;
    try {
      buildSearchArguments({ version: 1, scope: { type: "global" } });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CatalogError);
    expect((err as CatalogError).code).toBe("INVALID_CONFIG");
  });
});

describe("buildSearchArguments — like passthrough (5)", () => {
  it("passes an item-ref like array through unchanged", () => {
    const like = [{ id: "gid://shopify/Product/1" }];
    const args = buildSearchArguments({
      version: 1,
      scope: { type: "global" },
      like,
    });
    expect(args.like).toEqual(like);
  });

  it("passes an inline-base64 image like array through unchanged", () => {
    const like = [{ image: { content_type: "image/jpeg", data: "aGVsbG8=" } }];
    const args = buildSearchArguments({
      version: 1,
      scope: { type: "global" },
      like,
    });
    expect(args.like).toEqual(like);
  });

  it("passes an image_url like array through unchanged (resolved later at request time)", () => {
    const like = [{ image_url: "https://cdn.example.com/ref.jpg" }];
    const args = buildSearchArguments({
      version: 1,
      scope: { type: "global" },
      like,
    });
    expect(args.like).toEqual(like);
  });

  it("validates a multimodal config (query + like)", () => {
    const parsed = catalogConfigSchema.safeParse({
      version: 1,
      scope: { type: "global" },
      query: "minimalist",
      like: [{ id: "gid://shopify/Product/1" }],
    });
    expect(parsed.success).toBe(true);
  });
});

describe("resolveLikeEntries (6)", () => {
  it("passes {id} entries through untouched", async () => {
    const like = [{ id: "gid://shopify/Product/1" }];
    const resolved = await resolveLikeEntries(like, {});
    expect(resolved).toEqual(like);
  });

  it("passes already-inline {image} entries through untouched", async () => {
    const like = [{ image: { content_type: "image/png", data: "aGVsbG8=" } }];
    const resolved = await resolveLikeEntries(like, {});
    expect(resolved).toEqual(like);
  });

  it("fetches an image_url and returns inline base64 with the response content-type", async () => {
    // "hello" -> base64 "aGVsbG8="
    const bytes = new Uint8Array([104, 101, 108, 108, 111]);
    const fetchMock = vi.fn(async () =>
      new Response(bytes, {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }),
    );
    const resolved = await resolveLikeEntries(
      [{ image_url: "https://cdn.example.com/ref.jpg" }],
      { fetch: fetchMock as unknown as typeof fetch },
    );
    expect(resolved).toEqual([
      { image: { content_type: "image/jpeg", data: "aGVsbG8=" } },
    ]);
  });

  it("throws LIKE_IMAGE_FETCH_FAILED on a non-2xx response", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 404 }));
    await expect(
      resolveLikeEntries([{ image_url: "https://cdn.example.com/x.jpg" }], {
        fetch: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "LIKE_IMAGE_FETCH_FAILED" });
  });

  it("throws LIKE_IMAGE_FETCH_FAILED on a non-image content-type", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    await expect(
      resolveLikeEntries([{ image_url: "https://cdn.example.com/x.jpg" }], {
        fetch: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "LIKE_IMAGE_FETCH_FAILED" });
  });

  it("throws LIKE_IMAGE_FETCH_FAILED when the image exceeds the 2MB cap", async () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    const fetchMock = vi.fn(async () =>
      new Response(big, {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }),
    );
    await expect(
      resolveLikeEntries([{ image_url: "https://cdn.example.com/big.jpg" }], {
        fetch: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "LIKE_IMAGE_FETCH_FAILED" });
  });

  // finding #18(b) — a network-throwing injected fetch is wrapped, not leaked.
  it("wraps a network-throwing fetch into LIKE_IMAGE_FETCH_FAILED", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("ECONNREFUSED");
    });
    await expect(
      resolveLikeEntries([{ image_url: "https://cdn.example.com/x.jpg" }], {
        fetch: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "LIKE_IMAGE_FETCH_FAILED" });
  });
});

describe("buildSearchArguments — INVALID_CONFIG points at .messages (#27dx)", () => {
  it("message ends with the pointer to error.messages", () => {
    let err: CatalogError | undefined;
    try {
      buildSearchArguments({ version: 1, scope: { type: "global" } });
    } catch (e) {
      err = e as CatalogError;
    }
    expect(err?.code).toBe("INVALID_CONFIG");
    expect(err?.message).toMatch(/see error\.messages for field-level issues\.$/);
  });
});

describe("assertPublicHttpUrl — SSRF guard (#1, #18d)", () => {
  it("passes for a normal https URL", () => {
    expect(() =>
      assertPublicHttpUrl("https://cdn.example.com/ref.jpg"),
    ).not.toThrow();
  });

  it("passes for a normal http URL and a public IP literal", () => {
    expect(() => assertPublicHttpUrl("http://example.com/a.png")).not.toThrow();
    expect(() => assertPublicHttpUrl("https://93.184.216.34/x")).not.toThrow();
  });

  it("passes for a public IPv6 literal (does not over-deny)", () => {
    // 2606:4700:… is Cloudflare — public, must be allowed.
    expect(() =>
      assertPublicHttpUrl("https://[2606:4700:4700::1111]/x"),
    ).not.toThrow();
  });

  // Each denied class → LIKE_IMAGE_FETCH_FAILED.
  it.each([
    ["localhost", "http://localhost/x"],
    ["*.localhost", "http://foo.localhost/x"],
    ["127.0.0.1 loopback", "http://127.0.0.1/x"],
    ["cloud metadata 169.254.169.254", "http://169.254.169.254/latest/meta-data"],
    ["10/8 private", "http://10.0.0.5/x"],
    ["172.16/12 private", "https://172.16.9.9/x"],
    ["192.168/16 private", "http://192.168.1.1/x"],
    ["IPv6 loopback ::1", "http://[::1]/x"],
    ["IPv6 ULA fc00::/7", "http://[fc00::1]/x"],
    ["IPv6 link-local fe80::/10", "http://[fe80::1]/x"],
    ["IPv4-mapped metadata ::ffff:169.254.169.254", "http://[::ffff:169.254.169.254]/x"],
    ["IPv4-mapped loopback ::ffff:127.0.0.1", "http://[::ffff:127.0.0.1]/x"],
    ["decimal-encoded loopback 2130706433", "http://2130706433/x"],
    ["hex-encoded loopback 0x7f000001", "http://0x7f000001/x"],
    ["octal-encoded loopback 0177.0.0.1", "http://0177.0.0.1/x"],
    ["short-form loopback 127.1", "http://127.1/x"],
    ["metadata.google.internal", "http://metadata.google.internal/x"],
    ["*.internal suffix", "http://foo.internal/x"],
    ["non-http scheme (file)", "file:///etc/passwd"],
    ["non-http scheme (ftp)", "ftp://example.com/x"],
    ["non-http scheme (data)", "data:image/png;base64,AAAA"],
  ])("throws LIKE_IMAGE_FETCH_FAILED for %s", (_label, url) => {
    let err: CatalogError | undefined;
    try {
      assertPublicHttpUrl(url);
    } catch (e) {
      err = e as CatalogError;
    }
    expect(err).toBeInstanceOf(CatalogError);
    expect(err?.code).toBe("LIKE_IMAGE_FETCH_FAILED");
  });
});

describe("resolveImageUrl — SSRF error genericness (#2sec)", () => {
  it("never leaks the URL, HTTP status, or content-type in message/messages", async () => {
    const secret = "https://internal.example.com/secret-path?token=abc123";
    const fetchMock = vi.fn(async () =>
      new Response("nope", {
        status: 403,
        headers: { "content-type": "text/html" },
      }),
    );
    let err: CatalogError | undefined;
    try {
      await resolveLikeEntries([{ image_url: secret }], {
        fetch: fetchMock as unknown as typeof fetch,
      });
    } catch (e) {
      err = e as CatalogError;
    }
    expect(err?.code).toBe("LIKE_IMAGE_FETCH_FAILED");
    expect(err?.message).toBe(
      "reference image could not be fetched or is not a usable image",
    );
    // The generic message must not carry the URL / status / content-type.
    expect(err?.message).not.toContain(secret);
    expect(err?.message).not.toContain("403");
    // messages stays empty (detail is the only place specifics live).
    expect(err?.messages).toBeUndefined();
    // detail is non-enumerable — invisible to JSON.stringify / spreads.
    const serialized = JSON.stringify({ ...(err as object) });
    expect(serialized).not.toContain("403");
    expect(serialized).not.toContain(secret);
    // …but readable off the instance for server-side debugging.
    expect(err?.detail).toContain("403");
  });
});

describe("resolveImageUrl — redirect handling (#1)", () => {
  it("follows a redirect to a public host and re-guards it (returns base64)", async () => {
    const bytes = new Uint8Array([104, 101, 108, 108, 111]); // "hello"
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse("https://cdn2.example.com/real.jpg"))
      .mockResolvedValueOnce(imageResponse(bytes));
    const resolved = await resolveLikeEntries(
      [{ image_url: "https://cdn.example.com/ref.jpg" }],
      { fetch: fetchMock as unknown as typeof fetch },
    );
    expect(resolved).toEqual([
      { image: { content_type: "image/jpeg", data: "aGVsbG8=" } },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a redirect that points at a denied host (before following it)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse("http://169.254.169.254/latest/meta-data"));
    await expect(
      resolveLikeEntries([{ image_url: "https://cdn.example.com/ref.jpg" }], {
        fetch: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "LIKE_IMAGE_FETCH_FAILED" });
    // Only the first hop was fetched; the denied Location was never requested.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after too many redirects", async () => {
    const fetchMock = vi.fn(async () =>
      redirectResponse("https://cdn.example.com/loop.jpg"),
    );
    await expect(
      resolveLikeEntries([{ image_url: "https://cdn.example.com/start.jpg" }], {
        fetch: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "LIKE_IMAGE_FETCH_FAILED" });
    // 1 initial + up to 3 redirect follows = 4 fetches, then bail.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe("resolveImageUrl — fetch timeout (#11)", () => {
  it("aborts a hanging image host and fails LIKE_IMAGE_FETCH_FAILED", async () => {
    // fetch that only ever settles by rejecting when its signal aborts.
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init.signal;
          const abort = () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            reject(e);
          };
          if (signal?.aborted) return abort();
          signal?.addEventListener("abort", abort);
        }),
    );
    await expect(
      resolveLikeEntries([{ image_url: "https://slow.example.com/ref.jpg" }], {
        fetch: fetchMock as unknown as typeof fetch,
        timeoutMs: 10,
      }),
    ).rejects.toMatchObject({ code: "LIKE_IMAGE_FETCH_FAILED" });
  });
});
