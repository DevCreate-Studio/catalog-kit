#!/usr/bin/env node
// Record live UCP responses as test fixtures.
// Plain Node >=20, zero dependencies.
//
// Runs the same catalog tool calls as probe.mjs and writes the FULL raw
// JSON-RPC response body of each into packages/catalog-client/fixtures/.
// These let the client test suite run offline with no keys and no network.
//
// Usage:
//   AGENT_PROFILE_URL=<url> node scripts/record-fixtures.mjs
//
// Product data returned by the catalog is public; nothing is redacted, with
// one exception: the `like` image-search fixture embeds inline base64 image
// bytes in the *request* we send (never in the response we record), so no
// redaction is needed there either — see search-like-image.json.

import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ENDPOINT = "https://catalog.shopify.com/api/ucp/mcp";
const FALLBACK_PROFILE =
  "https://shopify.dev/ucp/agent-profiles/2026-04-08/valid-with-capabilities.json";
const PROFILE = process.env.AGENT_PROFILE_URL || FALLBACK_PROFILE;

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, "../packages/catalog-client/fixtures");

let rpcId = 0;

/** POST a JSON-RPC tools/call and return the full parsed response body. */
async function callTool(name, catalog) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      id: ++rpcId,
      params: {
        name,
        arguments: {
          meta: { "ucp-agent": { profile: PROFILE } },
          catalog,
        },
      },
    }),
  });
  const text = await res.text();
  try {
    return { httpStatus: res.status, body: JSON.parse(text) };
  } catch {
    return { httpStatus: res.status, body: { _raw: text } };
  }
}

/** Raw tools/list call (kept for completeness; may return an error keyless). */
async function callToolsList() {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/list",
      id: ++rpcId,
      params: { meta: { "ucp-agent": { profile: PROFILE } } },
    }),
  });
  const text = await res.text();
  try {
    return { httpStatus: res.status, body: JSON.parse(text) };
  } catch {
    return { httpStatus: res.status, body: { _raw: text } };
  }
}

function content(body) {
  return body?.result?.structuredContent ?? body?.result ?? null;
}

/**
 * A fixture body must match one of the two documented JSON-RPC response
 * shapes the client's transport actually handles (see transport.ts):
 *   - success / tool-level error: a top-level `result` (optionally with
 *     `result.isError: true` and `result.content`, or `result.structuredContent`).
 *   - top-level JSON-RPC error: a top-level `error` (e.g. `-32001`, `-32600`).
 * Anything else — including the `{ _raw: text }` shape callTool()/callToolsList()
 * fall back to on a non-JSON response — is malformed and must not be committed.
 * @param {unknown} body
 * @returns {boolean}
 */
function hasExpectedShape(body) {
  if (body === null || typeof body !== "object") return false;
  if ("result" in body) return true;
  if ("error" in body) return true;
  return false;
}

/**
 * Validate the response shape, then write atomically: write to a `.tmp`
 * sibling and rename into place, so a kill mid-write never leaves a
 * committed fixture partially written/corrupted. Malformed shapes are
 * skipped (with a warning) rather than committed as a fixture.
 * @param {string} name
 * @param {unknown} payload
 * @returns {Promise<string|null>} the written file path, or null if skipped.
 */
async function write(name, payload) {
  if (!hasExpectedShape(payload)) {
    console.warn(
      `WARN: skipping ${name} — response body has neither a top-level "result" nor "error" ` +
        `(got: ${JSON.stringify(payload).slice(0, 200)}); not a documented JSON-RPC shape.`,
    );
    return null;
  }
  const file = resolve(FIXTURE_DIR, name);
  const tmpFile = `${file}.tmp`;
  await writeFile(tmpFile, JSON.stringify(payload, null, 2) + "\n");
  await rename(tmpFile, file);
  return file;
}

async function main() {
  await mkdir(FIXTURE_DIR, { recursive: true });
  const written = [];
  /** Validate + write a fixture, recording the path only if it wasn't skipped. */
  async function record(name, payload) {
    const file = await write(name, payload);
    if (file) written.push(file);
  }

  // search-basic — plain query.
  const searchBasic = await callTool("search_catalog", {
    query: "wireless headphones",
    filters: { available: true },
    pagination: { limit: 5 },
  });
  await record("search-basic.json", searchBasic.body);
  const products =
    content(searchBasic.body)?.products &&
    Array.isArray(content(searchBasic.body).products)
      ? content(searchBasic.body).products
      : [];
  const firstId = products[0]?.id ?? null;

  // search-filtered — price + available + ships_to.
  const searchFiltered = await callTool("search_catalog", {
    query: "wireless headphones",
    filters: {
      available: true,
      price: { max: 15000 },
      ships_to: { country: "US" },
    },
    pagination: { limit: 5 },
  });
  await record("search-filtered.json", searchFiltered.body);

  // search-empty — nonsense query. NOTE (verified 2026-07-04): a nonsense text
  // query alone still returns ~5 fuzzy fallback matches (the catalog never
  // returns zero for a bare text query). To capture a genuinely empty result
  // shape (products:[], total_count:0) we combine it with an impossible price
  // filter (max:1 minor unit).
  const searchEmpty = await callTool("search_catalog", {
    query: "xzqvwkjhgfdsa",
    filters: { price: { max: 1 } },
    pagination: { limit: 5 },
  });
  await record("search-empty.json", searchEmpty.body);

  // lookup — one id from the basic search.
  if (firstId) {
    const lookup = await callTool("lookup_catalog", { ids: [firstId] });
    await record("lookup.json", lookup.body);
  } else {
    console.warn("WARN: no product id from search — skipping lookup fixture");
  }

  // get-product — one id + a selected option if available.
  if (firstId) {
    const first = products[0];
    const opt = first?.options?.[0];
    const selected =
      opt && opt.name && Array.isArray(opt.values) && opt.values.length
        ? [{ name: opt.name, value: opt.values[0] }]
        : undefined;
    const args = { id: firstId };
    if (selected) args.selected = selected;
    const getProduct = await callTool("get_product", args);
    await record("get-product.json", getProduct.body);
  } else {
    console.warn("WARN: no product id from search — skipping get-product fixture");
  }

  // error-invalid-filter — deliberately malformed filter (categories object form,
  // which the API now rejects with a tool-level isError). Captures the error shape.
  const errInvalid = await callTool("search_catalog", {
    query: "shoes",
    filters: { categories: [{ id: "gid://shopify/TaxonomyCategory/aa-1" }] },
    pagination: { limit: 3 },
  });
  await record("error-invalid-filter.json", errInvalid.body);

  // tools-list — raw tools/list response (documents the keyless 422 behavior).
  const toolsList = await callToolsList();
  await record("tools-list.json", toolsList.body);

  // --- `like` similarity / multimodal fixtures (Task 0.5, added 2026-07-04) ---
  // Shapes below are the exact accepted forms found live-probing search_catalog;
  // see docs/probe-findings.md for the full probe log and rejected shapes.
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  if (firstId) {
    // search-like-item.json — `like` with an item ref. WORKING SHAPE:
    // like: [{ id: "<product id>" }]  (array of objects; bare string/plain
    // object/array-of-strings are all rejected with isError — see probe log).
    await sleep(1200);
    const searchLikeItem = await callTool("search_catalog", {
      like: [{ id: firstId }],
      pagination: { limit: 5 },
    });
    await record("search-like-item.json", searchLikeItem.body);
  } else {
    console.warn("WARN: no product id from search — skipping search-like-item fixture");
  }

  // search-like-image.json — `like` with a public image URL. WORKING SHAPE:
  // like: [{ image: { content_type, data: "<base64>" } }] — the API requires
  // *inline base64 image bytes*, not a URL reference. Every URL-based shape
  // tried (bare string, {image_url}, {url}, {image:{url}}, arrays thereof) is
  // rejected with isError; the error text names `content_type`/`data` as the
  // required sibling fields, which is how this shape was discovered.
  const imageUrl =
    products[0]?.media?.[0]?.url ?? products[0]?.variants?.[0]?.media?.[0]?.url ?? null;
  if (imageUrl) {
    await sleep(1200);
    try {
      const imgRes = await fetch(imageUrl);
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const data = buf.toString("base64");
      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      const searchLikeImage = await callTool("search_catalog", {
        like: [{ image: { content_type: contentType, data } }],
        pagination: { limit: 5 },
      });
      await record("search-like-image.json", searchLikeImage.body);
    } catch (err) {
      console.warn(`WARN: failed to fetch/record search-like-image fixture: ${err}`);
    }
  } else {
    console.warn("WARN: no product image URL from search — skipping search-like-image fixture");
  }

  // search-multimodal.json — `query` + `like` (item ref) combined. Both modes
  // are accepted together with no error; results overlap heavily with the
  // pure `like` item-ref search (query appears to have limited influence when
  // combined with an item-ref `like`).
  if (firstId) {
    await sleep(1200);
    const searchMultimodal = await callTool("search_catalog", {
      query: "minimalist",
      like: [{ id: firstId }],
      pagination: { limit: 5 },
    });
    await record("search-multimodal.json", searchMultimodal.body);
  } else {
    console.warn("WARN: no product id from search — skipping search-multimodal fixture");
  }

  console.log("Recorded fixtures:");
  for (const f of written) console.log("  " + f);
  console.log(`\nProfile: ${PROFILE}`);
}

main().catch((err) => {
  console.error("RECORD FAILED:", err);
  process.exit(1);
});
