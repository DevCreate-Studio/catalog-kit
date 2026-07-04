#!/usr/bin/env node
// Live probe of the Shopify Global Catalog (UCP) MCP endpoint.
// Plain Node >=20, zero dependencies.
//
// Sends JSON-RPC `tools/call` requests with the required
// meta['ucp-agent'].profile injected into the tool-call arguments (the exact
// envelope that works keyless — verified 2026-07-04). Runs, in order:
//   1. tools/list  (a real tool call is used to enumerate tools, since the raw
//      tools/list method still needs a profile and is exercised via search)
//   2. search_catalog { query, filters, pagination }
//   3. lookup_catalog { one id from the search result }
//   4. get_product   { one product id + one selected option }
//
// Also runs a set of targeted quirk re-verification probes, plus (added
// 2026-07-04) a systematic probe of `like` similarity + multimodal search
// shapes: item-ref, public image URL, and `query` + `like` combined.
//
// Usage:
//   AGENT_PROFILE_URL=<url> node scripts/probe.mjs           # human-readable
//   AGENT_PROFILE_URL=<url> node scripts/probe.mjs --json     # machine report
//
// Falls back to Shopify's published sample profile (application/json, verified
// working) when AGENT_PROFILE_URL is unset.

const ENDPOINT = "https://catalog.shopify.com/api/ucp/mcp";
const FALLBACK_PROFILE =
  "https://shopify.dev/ucp/agent-profiles/2026-04-08/valid-with-capabilities.json";
const PROFILE = process.env.AGENT_PROFILE_URL || FALLBACK_PROFILE;
const JSON_MODE = process.argv.includes("--json");

const RATE_LIMIT_HEADERS = [
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "ratelimit-limit",
  "ratelimit-remaining",
  "ratelimit-reset",
  "retry-after",
  "x-request-id",
  "x-shopify-ucp-mcp-api-version",
  "shopify-complexity-score",
];

let rpcId = 0;

/**
 * POST a JSON-RPC tools/call. Returns { httpStatus, latencyMs, headers, body }.
 * The profile is injected into arguments.meta['ucp-agent'].profile and the
 * tool payload is placed under arguments.catalog (the working UCP MCP envelope).
 */
async function callTool(name, catalog) {
  const body = {
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
  };
  const started = Date.now();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const latencyMs = Date.now() - started;
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { _raw: text };
  }
  const headers = {};
  for (const h of RATE_LIMIT_HEADERS) {
    const v = res.headers.get(h);
    if (v != null) headers[h] = v;
  }
  return { httpStatus: res.status, latencyMs, headers, body: parsed };
}

/** Pull `result.structuredContent` (or `result`) from a JSON-RPC response body. */
function content(body) {
  return body?.result?.structuredContent ?? body?.result ?? null;
}

/** Summarize a tool response for the human-readable log. */
function summarize(label, r) {
  const c = content(r.body);
  const err = r.body?.error;
  const keys = c && typeof c === "object" ? Object.keys(c) : [];
  const products = Array.isArray(c?.products) ? c.products.length : null;
  const msgs = Array.isArray(c?.messages) ? c.messages.length : null;
  console.log(`\n[${label}]`);
  console.log(`  http=${r.httpStatus} latency=${r.latencyMs}ms`);
  if (err) console.log(`  jsonrpc error: ${JSON.stringify(err)}`);
  if (keys.length) console.log(`  result keys: ${keys.join(", ")}`);
  if (products != null) console.log(`  products: ${products}`);
  if (msgs != null) console.log(`  messages[]: ${msgs}`);
  if (Object.keys(r.headers).length)
    console.log(`  headers: ${JSON.stringify(r.headers)}`);
}

async function main() {
  const report = { endpoint: ENDPOINT, profile: PROFILE, calls: {}, quirks: {} };

  // 1. tools/list — real method, profile carried in params.meta.
  const listStarted = Date.now();
  const listRes = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/list",
      id: ++rpcId,
      params: { meta: { "ucp-agent": { profile: PROFILE } } },
    }),
  });
  const listLatency = Date.now() - listStarted;
  const listBody = await listRes.json().catch(() => ({}));
  const toolNames = Array.isArray(listBody?.result?.tools)
    ? listBody.result.tools.map((t) => t.name)
    : [];
  report.calls.tools_list = {
    httpStatus: listRes.status,
    latencyMs: listLatency,
    tools: toolNames,
    error: listBody?.error ?? null,
  };
  if (!JSON_MODE) {
    console.log(`\n[tools/list]`);
    console.log(`  http=${listRes.status} latency=${listLatency}ms`);
    if (listBody?.error)
      console.log(`  jsonrpc error: ${JSON.stringify(listBody.error)}`);
    console.log(`  tools: ${toolNames.join(", ") || "(none returned)"}`);
  }

  // 2. search_catalog
  const search = await callTool("search_catalog", {
    query: "wireless headphones",
    filters: { available: true, price: { max: 15000 } },
    pagination: { limit: 5 },
  });
  if (!JSON_MODE) summarize("search_catalog", search);
  const sc = content(search.body);
  const products = Array.isArray(sc?.products) ? sc.products : [];
  const firstId = products[0]?.id ?? null;
  report.calls.search_catalog = {
    httpStatus: search.httpStatus,
    latencyMs: search.latencyMs,
    productCount: products.length,
    resultKeys: sc ? Object.keys(sc) : [],
    pagination: sc?.pagination ?? null,
    headers: search.headers,
    firstId,
  };

  // 3. lookup_catalog with one id from the search result.
  let lookup = null;
  if (firstId) {
    lookup = await callTool("lookup_catalog", { ids: [firstId] });
    if (!JSON_MODE) summarize("lookup_catalog", lookup);
    const lc = content(lookup.body);
    report.calls.lookup_catalog = {
      httpStatus: lookup.httpStatus,
      latencyMs: lookup.latencyMs,
      productCount: Array.isArray(lc?.products) ? lc.products.length : null,
      resultKeys: lc ? Object.keys(lc) : [],
      headers: lookup.headers,
    };
  }

  // 4. get_product with a product id + one selected option.
  if (firstId) {
    const first = products[0];
    // Try to surface a selectable option from the search result.
    const opt = first?.options?.[0];
    const selected =
      opt && opt.name && Array.isArray(opt.values) && opt.values.length
        ? [{ name: opt.name, value: opt.values[0] }]
        : undefined;
    const getArgs = { id: firstId };
    if (selected) getArgs.selected = selected;
    const getProduct = await callTool("get_product", getArgs);
    if (!JSON_MODE) summarize("get_product", getProduct);
    const gc = content(getProduct.body);
    report.calls.get_product = {
      httpStatus: getProduct.httpStatus,
      latencyMs: getProduct.latencyMs,
      resultKeys: gc ? Object.keys(gc) : [],
      selectedSent: selected ?? null,
      headers: getProduct.headers,
    };
  }

  // --- Targeted quirk re-verification probes ---
  if (!JSON_MODE) console.log("\n=== QUIRK RE-VERIFICATION ===");

  // Q1: pagination.limit = 51 -> clamp/behavior.
  const over = await callTool("search_catalog", {
    query: "headphones",
    pagination: { limit: 51 },
  });
  const overC = content(over.body);
  report.quirks.limit_51 = {
    httpStatus: over.httpStatus,
    error: over.body?.error ?? null,
    productCount: Array.isArray(overC?.products) ? overC.products.length : null,
    pagination: overC?.pagination ?? null,
    messages: overC?.messages ?? null,
  };
  if (!JSON_MODE)
    console.log(
      `\n[limit=51] http=${over.httpStatus} products=${report.quirks.limit_51.productCount} pagination=${JSON.stringify(overC?.pagination)} error=${JSON.stringify(over.body?.error) ?? "none"}`,
    );

  // Q2: categories as documented object {id} form (expected: 0 results / ignored).
  const catObj = await callTool("search_catalog", {
    query: "shoes",
    filters: {
      categories: [{ id: "gid://shopify/TaxonomyCategory/aa-1" }],
    },
    pagination: { limit: 3 },
  });
  const catObjC = content(catObj.body);
  report.quirks.categories_object_form = {
    httpStatus: catObj.httpStatus,
    error: catObj.body?.error ?? null,
    productCount: Array.isArray(catObjC?.products) ? catObjC.products.length : null,
    messages: catObjC?.messages ?? null,
  };
  if (!JSON_MODE)
    console.log(
      `\n[categories object {id}] http=${catObj.httpStatus} products=${report.quirks.categories_object_form.productCount} messages=${JSON.stringify(catObjC?.messages)} error=${JSON.stringify(catObj.body?.error)}`,
    );

  // Q3: categories as string GID form (expected: matches).
  const catStr = await callTool("search_catalog", {
    query: "shoes",
    filters: { categories: ["gid://shopify/TaxonomyCategory/aa-1"] },
    pagination: { limit: 3 },
  });
  const catStrC = content(catStr.body);
  report.quirks.categories_string_gid = {
    httpStatus: catStr.httpStatus,
    error: catStr.body?.error ?? null,
    productCount: Array.isArray(catStrC?.products) ? catStrC.products.length : null,
    messages: catStrC?.messages ?? null,
  };
  if (!JSON_MODE)
    console.log(
      `\n[categories string GID] http=${catStr.httpStatus} products=${report.quirks.categories_string_gid.productCount} messages=${JSON.stringify(catStrC?.messages)}`,
    );

  // Q4: rating shape {variant:{min,min_count}}.
  const rating = await callTool("search_catalog", {
    query: "headphones",
    filters: { rating: { variant: { min: 4, min_count: 10 } } },
    pagination: { limit: 3 },
  });
  const ratingC = content(rating.body);
  report.quirks.rating_variant_shape = {
    httpStatus: rating.httpStatus,
    error: rating.body?.error ?? null,
    productCount: Array.isArray(ratingC?.products) ? ratingC.products.length : null,
    messages: ratingC?.messages ?? null,
    firstRating: ratingC?.products?.[0]?.rating ?? null,
  };
  if (!JSON_MODE)
    console.log(
      `\n[rating {variant:{min,min_count}}] http=${rating.httpStatus} products=${report.quirks.rating_variant_shape.productCount} firstRating=${JSON.stringify(ratingC?.products?.[0]?.rating)} messages=${JSON.stringify(ratingC?.messages)}`,
    );

  // Q5: ships_to object + ships_from array shapes.
  const ships = await callTool("search_catalog", {
    query: "headphones",
    filters: { ships_to: { country: "US" }, ships_from: [{ country: "CA" }] },
    pagination: { limit: 3 },
  });
  const shipsC = content(ships.body);
  report.quirks.shipping_shapes = {
    httpStatus: ships.httpStatus,
    error: ships.body?.error ?? null,
    productCount: Array.isArray(shipsC?.products) ? shipsC.products.length : null,
    messages: shipsC?.messages ?? null,
  };
  if (!JSON_MODE)
    console.log(
      `\n[ships_to obj / ships_from arr] http=${ships.httpStatus} products=${report.quirks.shipping_shapes.productCount} messages=${JSON.stringify(shipsC?.messages)}`,
    );

  // Q6: unsupported attribute name -> messages[] behavior.
  const badAttr = await callTool("search_catalog", {
    query: "headphones",
    filters: {
      attributes: [{ name: "ZZ_totally_unsupported_attr", values: ["nope"] }],
    },
    pagination: { limit: 3 },
  });
  const badAttrC = content(badAttr.body);
  report.quirks.unsupported_attribute_messages = {
    httpStatus: badAttr.httpStatus,
    error: badAttr.body?.error ?? null,
    productCount: Array.isArray(badAttrC?.products) ? badAttrC.products.length : null,
    messages: badAttrC?.messages ?? null,
  };
  if (!JSON_MODE)
    console.log(
      `\n[unsupported attribute] http=${badAttr.httpStatus} products=${report.quirks.unsupported_attribute_messages.productCount} messages=${JSON.stringify(badAttrC?.messages)}`,
    );

  // Q7: minor units confirmation — capture a price object from search.
  const priceSample =
    products[0]?.price ??
    products[0]?.variants?.[0]?.price ??
    products[0]?.offer?.price ??
    products[0]?.offers?.[0]?.price ??
    null;
  report.quirks.price_minor_units_sample = priceSample;
  if (!JSON_MODE)
    console.log(`\n[price sample] ${JSON.stringify(priceSample)}`);

  // --- `like` similarity / multimodal search probes (Task 0.5, added 2026-07-04) ---
  // Uses a real product id + image URL taken live from the `search_catalog` result
  // above (`products`, `firstId`). Systematically tries plausible shapes, in order,
  // for each mode, and records the exact accepted/rejected shape + error text.
  if (!JSON_MODE) console.log("\n=== LIKE / SIMILARITY / MULTIMODAL PROBES ===");

  const likeProbes = { itemRef: [], image: [], multimodal: [] };
  const seedProduct = products[0] ?? null;
  const seedProductId = seedProduct?.id ?? null;
  const seedVariantId = seedProduct?.variants?.[0]?.id ?? null;
  const seedImageUrl =
    seedProduct?.media?.[0]?.url ?? seedProduct?.variants?.[0]?.media?.[0]?.url ?? null;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Redact inline base64 image `data` fields so logs/reports stay readable. */
  function redactCatalog(catalog) {
    const clone = JSON.parse(JSON.stringify(catalog));
    const likeArr = Array.isArray(clone.like) ? clone.like : clone.like ? [clone.like] : [];
    for (const item of likeArr) {
      if (item && item.image && typeof item.image.data === "string") {
        item.image.data = `<base64 ${item.image.data.length} chars omitted>`;
      }
    }
    return clone;
  }

  /**
   * Run one attempt, log/record it, and report whether it was accepted.
   * Retries on rate limiting (HTTP 429, or the jsonrpc -32600 "Rate limit
   * exceeded" seen on this endpoint) with backoff, since these are transport
   * throttling, not a verdict on the shape under test.
   */
  async function tryLike(bucket, label, catalog) {
    const full = { ...catalog, pagination: { limit: 5 } };
    let r;
    for (let attempt = 0; attempt < 5; attempt++) {
      r = await callTool("search_catalog", full);
      const rateLimited =
        r.httpStatus === 429 ||
        (r.body?.error?.code === -32600 &&
          /rate limit/i.test(String(r.body?.error?.data ?? r.body?.error?.message ?? "")));
      if (!rateLimited) break;
      const backoffMs = 2000 * (attempt + 1);
      if (!JSON_MODE)
        console.log(`  (rate limited, retrying in ${backoffMs}ms...)`);
      await sleep(backoffMs);
    }
    // A successful probe means: HTTP 200, no top-level jsonrpc error, and the
    // tool did not set result.isError. Anything else (429s, transport errors,
    // tool-level isError) counts as not-working for this attempt.
    const transportError = r.body?.error ?? null;
    const isError = r.body?.result?.isError === true || transportError != null;
    const errText = r.body?.result?.isError
      ? r.body?.result?.content?.[0]?.text
      : transportError
        ? JSON.stringify(transportError)
        : null;
    const c = content(r.body);
    const prodCount = Array.isArray(c?.products) ? c.products.length : null;
    const succeeded = r.httpStatus === 200 && !isError && Array.isArray(c?.products);
    const entry = {
      label,
      catalog: redactCatalog(full),
      httpStatus: r.httpStatus,
      isError,
      errorText: errText,
      productCount: prodCount,
      firstProductIds: Array.isArray(c?.products)
        ? c.products.slice(0, 3).map((p) => p.id)
        : [],
    };
    bucket.push(entry);
    if (!JSON_MODE) {
      console.log(`\n[like: ${label}]`);
      console.log(`  request.catalog: ${JSON.stringify(redactCatalog(full))}`);
      console.log(
        `  http=${r.httpStatus} isError=${isError} products=${prodCount}`,
      );
      if (errText) console.log(`  errorText: ${errText}`);
    }
    await sleep(1200); // gentle pacing to avoid tripping rate limits
    return { isError: !succeeded, catalog: full, entry };
  }

  // 1. `like` with an item ref — try shapes in order until one succeeds.
  let workingItemRef = null;
  if (seedProductId) {
    const attempts = [
      ["bare string id", { like: seedProductId }],
      ["{id} object", { like: { id: seedProductId } }],
      ["[{id}] array of object", { like: [{ id: seedProductId }] }],
      ["[string] array of strings", { like: [seedProductId] }],
    ];
    for (const [label, catalog] of attempts) {
      const { isError, catalog: full } = await tryLike(likeProbes.itemRef, label, catalog);
      if (!isError && !workingItemRef) workingItemRef = full;
    }
    // Fall back to a variant GID if the product id was rejected in every shape.
    if (!workingItemRef && seedVariantId) {
      const variantAttempts = [
        ["bare string variant GID", { like: seedVariantId }],
        ["{id} object variant GID", { like: { id: seedVariantId } }],
        ["[{id}] array of object variant GID", { like: [{ id: seedVariantId }] }],
        ["[string] array of strings variant GID", { like: [seedVariantId] }],
      ];
      for (const [label, catalog] of variantAttempts) {
        const { isError, catalog: full } = await tryLike(likeProbes.itemRef, label, catalog);
        if (!isError && !workingItemRef) workingItemRef = full;
      }
    }
  }

  // 2. `like` with a public image URL — try shapes in order. If a working item-ref
  // shape used an inline object (`{id: ...}`), also try the analogous `{image: ...}`
  // forms as soon as an error names the expected sibling field.
  let workingImage = null;
  let seedImageB64 = null;
  let seedImageContentType = null;
  if (seedImageUrl) {
    const urlAttempts = [
      ["bare string URL", { like: seedImageUrl }],
      ["{image_url} object", { like: { image_url: seedImageUrl } }],
      ["{url} object", { like: { url: seedImageUrl } }],
      ["{image:{url}} nested object", { like: { image: { url: seedImageUrl } } }],
      ["[imageUrl] array of strings", { like: [seedImageUrl] }],
      ["[{image_url}] array of objects", { like: [{ image_url: seedImageUrl }] }],
      ["[{image:{url}}] array of nested objects", { like: [{ image: { url: seedImageUrl } }] }],
    ];
    for (const [label, catalog] of urlAttempts) {
      const { isError, catalog: full } = await tryLike(likeProbes.image, label, catalog);
      if (!isError && !workingImage) workingImage = full;
    }
    // The array-of-object schema error reveals `image` must be `{content_type, data}`
    // (inline base64), not a URL. Fetch the image and try that shape.
    if (!workingImage) {
      try {
        const imgRes = await fetch(seedImageUrl);
        const buf = Buffer.from(await imgRes.arrayBuffer());
        seedImageB64 = buf.toString("base64");
        seedImageContentType = imgRes.headers.get("content-type") || "image/jpeg";
        const { isError, catalog: full } = await tryLike(
          likeProbes.image,
          "[{image:{content_type,data}}] inline base64",
          { like: [{ image: { content_type: seedImageContentType, data: seedImageB64 } }] },
        );
        if (!isError && !workingImage) workingImage = full;
      } catch (err) {
        if (!JSON_MODE) console.log(`  (failed to fetch seed image for base64 probe: ${err})`);
      }
    }
  }

  // 3. multimodal: `query` + the working `like` shape together.
  let multimodalResult = null;
  if (workingItemRef) {
    const catalog = { query: "minimalist", ...workingItemRef };
    delete catalog.pagination;
    catalog.pagination = { limit: 5 };
    const { entry } = await tryLike(likeProbes.multimodal, "query + like(item-ref)", catalog);
    multimodalResult = entry;
  }
  if (workingImage || seedImageB64) {
    const likePart = workingImage
      ? workingImage.like
      : [{ image: { content_type: seedImageContentType, data: seedImageB64 } }];
    const catalog = { query: "minimalist", like: likePart, pagination: { limit: 5 } };
    await tryLike(likeProbes.multimodal, "query + like(image)", catalog);
  }

  report.like = {
    seedProductId,
    seedVariantId,
    seedImageUrl,
    // entries already have base64 image data redacted by redactCatalog().
    workingItemRefShape: workingItemRef ? redactCatalog(workingItemRef) : null,
    workingImageShape: workingImage
      ? redactCatalog(workingImage)
      : seedImageB64
        ? redactCatalog({
            like: [{ image: { content_type: seedImageContentType, data: seedImageB64 } }],
          })
        : null,
    itemRefAttempts: likeProbes.itemRef,
    imageAttempts: likeProbes.image,
    multimodalAttempts: likeProbes.multimodal,
  };

  if (JSON_MODE) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    console.log("\n=== DONE ===");
    console.log(`profile: ${PROFILE}`);
  }
}

main().catch((err) => {
  console.error("PROBE FAILED:", err);
  process.exit(1);
});
