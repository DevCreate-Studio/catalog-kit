import { describe, expect, it } from "vitest";
import { zodToJsonSchema } from "zod-to-json-schema";
import { catalogConfigSchema } from "../src/schemas/requests";
import checkedIn from "../schema/catalog-config.schema.json";

const SCHEMA_ID =
  "https://github.com/DevCreate-Studio/catalog-kit/blob/main/packages/catalog-client/schema/catalog-config.schema.json";

/** Build the schema the same way scripts/generate-schema.mjs does. */
function generate(): Record<string, unknown> {
  const schema = zodToJsonSchema(catalogConfigSchema, {
    name: "CatalogConfig",
    $refStrategy: "none",
    target: "jsonSchema7",
  }) as Record<string, unknown>;
  schema.$id = SCHEMA_ID;
  return schema;
}

describe("catalog-config.schema.json", () => {
  it("the checked-in schema deep-equals a freshly generated one (drift guard)", () => {
    // JSON.parse(JSON.stringify(...)) normalizes the imported module object to
    // a plain object for a clean deep-equal.
    const fresh = JSON.parse(JSON.stringify(generate()));
    expect(checkedIn).toEqual(fresh);
  });
});
