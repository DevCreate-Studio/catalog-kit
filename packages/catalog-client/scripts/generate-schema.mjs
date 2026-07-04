// Regenerates schema/catalog-config.schema.json from the built zod schema.
// Runs AFTER the tsup build so it can import the compiled ESM output.
//
// Kept deterministic so the schema.test.ts drift guard (freshly generated ===
// checked-in) holds: same options, same $id, stable JSON formatting.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import { catalogConfigSchema } from "../dist/index.js";

const SCHEMA_ID =
  "https://github.com/DevCreate-Studio/catalog-kit/blob/main/packages/catalog-client/schema/catalog-config.schema.json";

const schema = zodToJsonSchema(catalogConfigSchema, {
  name: "CatalogConfig",
  $refStrategy: "none",
  target: "jsonSchema7",
});
schema.$id = SCHEMA_ID;

const outPath = fileURLToPath(
  new URL("../schema/catalog-config.schema.json", import.meta.url),
);
writeFileSync(outPath, `${JSON.stringify(schema, null, 2)}\n`);

console.log(`Wrote ${outPath}`);
