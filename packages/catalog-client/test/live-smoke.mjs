/**
 * Live smoke gate — the pre-release check that the kit still talks to the real
 * Shopify Global Catalog (UCP) endpoint.
 *
 * NOT part of the vitest suite or CI: this file reaches the network and is named
 * `live-smoke.mjs` (no `.test`/`.spec`) so the default vitest glob never picks
 * it up. It imports the BUILT dist, so build first:
 *
 *   pnpm --filter catalog-kit build
 *   node packages/catalog-client/test/live-smoke.mjs
 *
 * Runs keyless (anonymous tier). Reads AGENT_PROFILE_URL from the environment,
 * falling back to Shopify's published sample profile (the known-working value in
 * .env.example). Exercises all three tools end to end:
 *   1. searchCatalog(real config)
 *   2. lookupCatalog({ids:[<id from the search>]})
 *   3. getProduct({id, selected: <from the search result>})
 *
 * Prints one line per call (ok / latency / counts). Exits non-zero on any
 * failure, 0 on success. Anonymous rate limits are real, so there is a 1200 ms
 * sleep between calls (the transport also retries on 429 / rate-limit bodies).
 */

import { createCatalogClient } from "../dist/index.js";

const PROFILE_URL =
  process.env.AGENT_PROFILE_URL ??
  "https://shopify.dev/ucp/agent-profiles/2026-04-08/valid-with-capabilities.json";

const SLEEP_MS = 1200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function line(ok, label, ms, detail) {
  const mark = ok ? "ok  " : "FAIL";
  console.log(`${mark} ${label.padEnd(14)} ${String(ms).padStart(5)}ms  ${detail}`);
}

async function timed(fn) {
  const start = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - start };
}

async function main() {
  console.log(`live smoke — profile: ${PROFILE_URL}`);
  const client = createCatalogClient({ agentProfileUrl: PROFILE_URL });
  console.log(`tier: ${client.tier}`);

  let failed = false;

  // 1. search
  let firstProductId;
  let firstSelected;
  try {
    const { value: search, ms } = await timed(() =>
      client.searchCatalog({
        version: 1,
        scope: { type: "global" },
        query: "wireless headphones",
        filters: { available: true },
        pagination: { limit: 5 },
      }),
    );
    const products = search.products ?? [];
    firstProductId = products[0]?.id;
    firstSelected = products[0]?.selected;
    const ok = products.length > 0 && Boolean(firstProductId);
    failed = failed || !ok;
    line(ok, "searchCatalog", ms, `products=${products.length} first=${firstProductId ?? "—"}`);
    if (!ok) throw new Error("search returned no usable product id");
  } catch (err) {
    line(false, "searchCatalog", 0, String(err?.message ?? err));
    process.exit(1);
  }

  await sleep(SLEEP_MS);

  // 2. lookup (using an id from the search)
  try {
    const { value: lookup, ms } = await timed(() =>
      client.lookupCatalog({ ids: [firstProductId] }),
    );
    const count = (lookup.products ?? []).length;
    const ok = count >= 1;
    failed = failed || !ok;
    line(ok, "lookupCatalog", ms, `products=${count}`);
  } catch (err) {
    failed = true;
    line(false, "lookupCatalog", 0, String(err?.message ?? err));
  }

  await sleep(SLEEP_MS);

  // 3. get product (passing selected through from the search result)
  try {
    const args = { id: firstProductId };
    if (firstSelected !== undefined) args.selected = firstSelected;
    const { value: gp, ms } = await timed(() => client.getProduct(args));
    const ok = Boolean(gp.product?.id);
    failed = failed || !ok;
    line(ok, "getProduct", ms, `product=${gp.product?.id ?? "—"}`);
  } catch (err) {
    failed = true;
    line(false, "getProduct", 0, String(err?.message ?? err));
  }

  if (failed) {
    console.log("live smoke: FAILED");
    process.exit(1);
  }
  console.log("live smoke: PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("live smoke: unexpected error", err);
  process.exit(1);
});
