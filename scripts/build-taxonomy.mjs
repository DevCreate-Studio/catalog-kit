#!/usr/bin/env node
// @ts-check
//
// build-taxonomy.mjs — generate the compact taxonomy dataset the configurator's
// category picker consumes, from Shopify's published Standard Product Taxonomy.
//
// Zero dependencies, plain Node. Deterministic output (stable ordering, no
// timestamps) so `--check` can diff the committed files against a fresh build
// and fail CI on drift.
//
// Source: github.com/Shopify/product-taxonomy, pinned to TAXONOMY_COMMIT_SHA below
// (the commit tag v2026-05 resolves to — see the comment there for how to bump it).
// We parse `dist/en/categories.txt` (~2 MB) rather than `taxonomy.json` (~95 MB):
// each line is `{GID} : {Ancestor} > … > {Category}`, and the GID short code
// (e.g. `ap-2-1`) encodes the parent chain (drop the last `-N` segment → parent).
//
// Emits:
//   apps/web/public/taxonomy.json     — array of {gid, name, parentGid|null, level}.
//     `fullName` is intentionally NOT stored (categories.txt would push the file
//     well past ~3 MB); the picker reconstructs breadcrumbs from the parent chain.
//   apps/web/lib/taxonomy-meta.json    — {tag, count, generatedFrom} for display.
//   apps/web/lib/attribute-values.json — canonical value labels for the three
//     API-supported attribute names (Color, Size, Target gender), parsed from
//     `dist/en/attribute_values.txt`. Small enough to import statically. "Size"
//     uses the generic taxonomy `Size` attribute (GID 2778) — the base list that
//     spans apparel/numeric/age sizes; per-category size variants are not merged.
//
// Usage:
//   node scripts/build-taxonomy.mjs            # download + write all files
//   node scripts/build-taxonomy.mjs --json     # machine summary to stdout, no writes
//   node scripts/build-taxonomy.mjs --check    # exit non-zero if a rebuild would change the files

import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Pinned to a commit SHA (not a movable tag) for supply-chain integrity — a
// tag can be force-moved to point at different content after the fact, a SHA
// cannot. This SHA is the commit `v2026-05` resolved to on 2026-07-04
// (`gh api repos/Shopify/product-taxonomy/git/refs/tags/v2026-05`). Bump by
// resolving the new tag to its SHA the same way, and re-run `pnpm taxonomy`
// to adopt a newer Shopify taxonomy version.
const TAXONOMY_TAG = "v2026-05"; // kept for display/meta only — not used in the URL below
const TAXONOMY_COMMIT_SHA = "7023a7ef5832a2115e8cf6efb65bd60f1787e333"; // resolved from tag v2026-05
const SOURCE_REPO = "Shopify/product-taxonomy";
const DIST_BASE = `https://raw.githubusercontent.com/${SOURCE_REPO}/${TAXONOMY_COMMIT_SHA}/dist/en`;
const CATEGORIES_URL = `${DIST_BASE}/categories.txt`;
const ATTRIBUTE_VALUES_URL = `${DIST_BASE}/attribute_values.txt`;

const CATEGORY_PREFIX = "gid://shopify/TaxonomyCategory/";

// The only attribute names the Catalog API honors (see docs/probe-findings.md).
// We emit canonical value lists for exactly these, keyed by the API name.
const SUPPORTED_ATTRIBUTES = ["Color", "Size", "Target gender"];

const OUT_DATA = join(ROOT, "apps/web/public/taxonomy.json");
const OUT_META = join(ROOT, "apps/web/lib/taxonomy-meta.json");
const OUT_ATTRS = join(ROOT, "apps/web/lib/attribute-values.json");

const argv = process.argv.slice(2);
const JSON_MODE = argv.includes("--json");
const CHECK_MODE = argv.includes("--check");

/**
 * Parse `categories.txt` into the compact picker dataset.
 * @param {string} text
 * @returns {{ entries: Array<{gid: string, name: string, parentGid: string|null, level: number}>, version: string|null }}
 */
function parseCategories(text) {
  const lines = text.split("\n");
  /** @type {Array<{gid: string, name: string, parentGid: string|null, level: number}>} */
  const entries = [];
  let version = null;

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (line.trim() === "") continue;
    if (line.startsWith("#")) {
      // "# Shopify Product Taxonomy - Categories: 2026-05"
      const m = line.match(/Categories:\s*([0-9-]+)\s*$/);
      if (m) version = m[1];
      continue;
    }
    const sep = line.indexOf(" : ");
    if (sep === -1) continue;
    const gid = line.slice(0, sep).trim();
    const path = line.slice(sep + 3).trim();
    if (!gid.startsWith(CATEGORY_PREFIX)) continue;

    // Leaf display name = last breadcrumb segment.
    const segments = path.split(" > ");
    const name = segments[segments.length - 1].trim();
    // level = depth from root (root categories are level 0).
    const level = segments.length - 1;

    // Parent GID from the short code: `ap-2-1` → `ap-2`; `ap` (no dash) → root.
    const code = gid.slice(CATEGORY_PREFIX.length);
    const lastDash = code.lastIndexOf("-");
    const parentGid =
      lastDash === -1 ? null : `${CATEGORY_PREFIX}${code.slice(0, lastDash)}`;

    entries.push({ gid, name, parentGid, level });
  }

  // Deterministic ordering: sort by GID string. Stable across runs.
  entries.sort((a, b) => (a.gid < b.gid ? -1 : a.gid > b.gid ? 1 : 0));
  return { entries, version };
}

/**
 * Parse `attribute_values.txt` into `{ [attributeName]: string[] }` for the
 * supported attribute names only. Lines are `{GID} : {Value name} [{Attribute}]`.
 * @param {string} text
 * @returns {Record<string, string[]>}
 */
function parseAttributeValues(text) {
  /** @type {Record<string, string[]>} */
  const byAttr = {};
  for (const name of SUPPORTED_ATTRIBUTES) byAttr[name] = [];

  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (line.trim() === "" || line.startsWith("#")) continue;
    const sep = line.indexOf(" : ");
    if (sep === -1) continue;
    const rest = line.slice(sep + 3).trim();
    // "{Value name} [{Attribute name}]" — attribute is the last bracketed group.
    const m = rest.match(/^(.*)\s\[([^\]]+)\]$/);
    if (!m) continue;
    const value = m[1].trim();
    const attr = m[2].trim();
    if (attr in byAttr && !byAttr[attr].includes(value)) {
      byAttr[attr].push(value);
    }
  }

  // Deterministic, human-friendly ordering. "Other" sorts to the end.
  for (const name of SUPPORTED_ATTRIBUTES) {
    byAttr[name].sort((a, b) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b, "en", { numeric: true });
    });
    if (byAttr[name].length === 0) {
      throw new Error(`Parsed 0 values for attribute "${name}" — format may have changed.`);
    }
  }
  return byAttr;
}

/**
 * Fetch a source file as text.
 * @param {string} url
 * @returns {Promise<string>}
 */
async function download(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }
  return res.text();
}

/**
 * Build the output file contents (as strings) from the source texts.
 * @param {string} categoriesText
 * @param {string} attributeValuesText
 */
function build(categoriesText, attributeValuesText) {
  const { entries, version } = parseCategories(categoriesText);
  if (entries.length === 0) {
    throw new Error("Parsed 0 categories — source format may have changed.");
  }

  const attributeValues = parseAttributeValues(attributeValuesText);

  // Compact JSON (no pretty-printing) to minimize the shipped file size.
  const dataJson = JSON.stringify(entries) + "\n";

  const meta = {
    tag: TAXONOMY_TAG,
    version: version ?? TAXONOMY_TAG.replace(/^v/, ""),
    count: entries.length,
    generatedFrom: `github.com/${SOURCE_REPO} (${TAXONOMY_TAG})`,
  };
  const metaJson = JSON.stringify(meta, null, 2) + "\n";

  const attrsJson = JSON.stringify(attributeValues, null, 2) + "\n";

  return { dataJson, metaJson, attrsJson, count: entries.length, attributeValues };
}

async function main() {
  // --check regenerates to memory and diffs against committed files.
  const [categoriesText, attributeValuesText] = await Promise.all([
    download(CATEGORIES_URL),
    download(ATTRIBUTE_VALUES_URL),
  ]);
  const { dataJson, metaJson, attrsJson, count, attributeValues } = build(
    categoriesText,
    attributeValuesText,
  );

  const files = [
    [OUT_DATA, dataJson],
    [OUT_META, metaJson],
    [OUT_ATTRS, attrsJson],
  ];

  if (CHECK_MODE) {
    const drift = [];
    for (const [path, content] of files) {
      let current = null;
      try {
        current = readFileSync(path, "utf8");
      } catch {
        current = null;
      }
      if (current !== content) drift.push(relative(ROOT, path));
    }
    if (drift.length > 0) {
      process.stderr.write(
        `taxonomy drift: ${drift.join(", ")} would change. Run \`pnpm taxonomy\` and commit.\n`,
      );
      process.exit(1);
    }
    process.stdout.write("taxonomy.json / taxonomy-meta.json are up to date.\n");
    process.exit(0);
  }

  const attrCounts = Object.fromEntries(
    Object.entries(attributeValues).map(([k, v]) => [k, v.length]),
  );

  if (JSON_MODE) {
    const summary = {
      tag: TAXONOMY_TAG,
      count,
      attributeValues: attrCounts,
      files: files.map(([path, content]) => ({
        file: relative(ROOT, path),
        bytes: Buffer.byteLength(content, "utf8"),
      })),
    };
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
    process.exit(0);
  }

  // Write to a `.tmp` sibling then rename into place — renameSync is atomic on
  // the same filesystem, so a kill mid-write never leaves a committed output
  // file partially written/corrupted.
  for (const [path, content] of files) {
    const tmpPath = `${path}.tmp`;
    writeFileSync(tmpPath, content, "utf8");
    renameSync(tmpPath, path);
    const kb = (Buffer.byteLength(content, "utf8") / 1024).toFixed(1);
    process.stdout.write(`wrote ${relative(ROOT, path)} (${kb} KB)\n`);
  }
  const attrSummary = Object.entries(attrCounts)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  process.stdout.write(
    `taxonomy ${TAXONOMY_TAG}: ${count} categories, attribute values (${attrSummary}) from github.com/${SOURCE_REPO}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
