import { describe, expect, it } from "vitest";
import { CatalogError } from "../src/errors";

describe("CatalogError.isCatalogError — cross-build identity (I1)", () => {
  it("still identifies a CatalogError after its prototype chain is severed", () => {
    const err = new CatalogError("TRANSPORT_ERROR", "boom");

    // Simulate the dual ESM/CJS scenario: `instanceof` no longer holds
    // because the prototype no longer chains to this module's CatalogError.
    Object.setPrototypeOf(err, Error.prototype);

    expect(err).not.toBeInstanceOf(CatalogError);
    expect(CatalogError.isCatalogError(err)).toBe(true);
  });

  it("returns false for a plain Error", () => {
    expect(CatalogError.isCatalogError(new Error("plain"))).toBe(false);
  });
});
