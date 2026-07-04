import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { catalogConfigSchema } from "catalog-kit";

/**
 * Contract guard for the shipped presets: every `examples/*.config.json` must
 * parse, validate against `catalogConfigSchema` (the single source of truth —
 * it is what generates `schema/catalog-config.schema.json`), and carry a
 * `name` and `version`. Presets can never drift from the contract.
 *
 * Deliberately does NOT assert a fixed list of filenames — contributing a new
 * preset (see CONTRIBUTING.md) must never require touching this test. Any
 * `examples/*.config.json` that parses, validates, and carries `name`+`version`
 * passes automatically.
 */
const EXAMPLES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "examples",
);

const presetFiles = readdirSync(EXAMPLES_DIR).filter((f) =>
  f.endsWith(".config.json"),
);

describe("example presets", () => {
  it("ships at least one preset", () => {
    expect(presetFiles.length).toBeGreaterThan(0);
  });

  it.each(presetFiles)("%s parses as valid JSON", (file) => {
    expect(() =>
      JSON.parse(readFileSync(join(EXAMPLES_DIR, file), "utf8")),
    ).not.toThrow();
  });

  it.each(presetFiles)("%s validates against catalogConfigSchema", (file) => {
    const raw = JSON.parse(readFileSync(join(EXAMPLES_DIR, file), "utf8"));
    const result = catalogConfigSchema.safeParse(raw);
    if (!result.success) {
      throw new Error(
        `${file} failed schema validation:\n${JSON.stringify(result.error.issues, null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it.each(presetFiles)("%s has a name and version 1", (file) => {
    const raw = JSON.parse(readFileSync(join(EXAMPLES_DIR, file), "utf8")) as {
      name?: unknown;
      version?: unknown;
    };
    expect(typeof raw.name).toBe("string");
    expect((raw.name as string).length).toBeGreaterThan(0);
    expect(raw.version).toBe(1);
  });
});
