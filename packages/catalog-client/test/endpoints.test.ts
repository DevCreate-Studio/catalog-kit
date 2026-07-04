import { describe, expect, it } from "vitest";
import {
  ENDPOINTS,
  UCP_SPEC_VERSION,
  storefrontCatalog,
} from "../src/endpoints";

describe("ENDPOINTS", () => {
  it("pins the global catalog UCP MCP endpoint", () => {
    expect(ENDPOINTS.globalCatalog).toBe(
      "https://catalog.shopify.com/api/ucp/mcp",
    );
  });

  it("pins the token exchange endpoint", () => {
    expect(ENDPOINTS.token).toBe("https://api.shopify.com/auth/access_token");
  });
});

describe("UCP_SPEC_VERSION", () => {
  it("pins the observed UCP MCP API version", () => {
    expect(UCP_SPEC_VERSION).toBe("2026-04-08");
  });
});

describe("storefrontCatalog", () => {
  it("builds the storefront UCP MCP URL from a bare domain", () => {
    expect(storefrontCatalog("shop.example.com")).toBe(
      "https://shop.example.com/api/ucp/mcp",
    );
  });

  it("strips a leading https:// if the caller passes a full URL", () => {
    expect(storefrontCatalog("https://shop.example.com")).toBe(
      "https://shop.example.com/api/ucp/mcp",
    );
  });

  it("strips a leading http:// as well", () => {
    expect(storefrontCatalog("http://shop.example.com")).toBe(
      "https://shop.example.com/api/ucp/mcp",
    );
  });

  it("strips a trailing slash on the domain", () => {
    expect(storefrontCatalog("shop.example.com/")).toBe(
      "https://shop.example.com/api/ucp/mcp",
    );
  });
});
