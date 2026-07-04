#!/usr/bin/env node
// @ts-check
//
// build-llms-txt.mjs — generate llms.txt + llms-full.txt from docs/ + README.
//
// Zero dependencies, plain Node. Deterministic output (stable ordering, no
// timestamps) so `--check` can diff the committed files against a fresh build
// and fail CI on drift.
//
// Usage:
//   node scripts/build-llms-txt.mjs            # write llms.txt + llms-full.txt
//   node scripts/build-llms-txt.mjs --json     # machine summary to stdout, no writes
//   node scripts/build-llms-txt.mjs --check    # exit non-zero if a rebuild would change the files
//
// Formats:
//   llms.txt      — llmstxt.org index: H1, blockquote summary, Docs + Optional sections.
//   llms-full.txt — README + AGENTS.md + all docs concatenated, path-delimited.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const argv = process.argv.slice(2);
const JSON_MODE = argv.includes("--json");
const CHECK_MODE = argv.includes("--check");

/** One-liner summary of the whole kit, used as the llms.txt blockquote. */
const SUMMARY =
  "An MIT-licensed, agent-ready starter kit for the Shopify Global Catalog (UCP): " +
  "a typed keyless client plus a Next.js configurator, playground, and demo, all driven " +
  "by one portable CatalogConfig JSON contract.";

/**
 * Docs in reading order, each with a hand-written one-line description (better
 * quality than parsing the first paragraph). Paths are repo-relative.
 */
const DOCS = [
  ["docs/getting-started.md", "Clone → keyless dev path, the agent-profile gotcha, optional credentials, first query."],
  ["docs/configuration.md", "Every filter and parameter — shape, real wire payload, and the gotchas, with a validated-behavior table."],
  ["docs/api-reference.md", "The auth tier ladder, the three catalog tools, CatalogError codes, and the messages[] contract."],
  ["docs/recipes.md", "Full runnable app patterns: gift finder, query-variant union, dupe finder, price watcher."],
  ["docs/agent-guide.md", "Building with AI agents — why the repo is agent-ready, copy-paste prompts, and using the client inside your own agents."],
  ["docs/compliance.md", "Shopify usage rules you must never violate: no result caching, hot-linked images, per-tier rate limits."],
  ["docs/deployment.md", "One-click Vercel deploy, Cloudflare Workers, and hosting your agent profile with the right content type."],
  ["docs/troubleshooting.md", "Empty results, 429s, profile-fetch failures, and 'works local, fails deployed'."],
  ["docs/architecture.md", "The annotated repo tree, the config-contract data flow, and why lenient schemas and no cache."],
];

/** Optional / secondary references for the llms.txt "Optional" section. */
const OPTIONAL = [
  ["AGENTS.md", "The single source of truth for working in the repo — commands, repo map, API gotchas, playbooks."],
  ["README.md", "The pitch — quickstart, presets, feature matrix, docs index."],
  ["packages/catalog-client/schema/catalog-config.schema.json", "JSON Schema for CatalogConfig — validate configs mechanically, no code execution required."],
  ["examples/", "Four portable preset configs (gift-finder, comparison-shopper, niche-marketplace, dupe-finder)."],
];

/**
 * Full-text concatenation order: README first (the pitch), then AGENTS.md (the
 * contract), then all docs in reading order.
 */
const FULL_ORDER = ["README.md", "AGENTS.md", ...DOCS.map(([p]) => p)];

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** Build the llms.txt index (llmstxt.org format). */
function buildIndex() {
  const lines = [];
  lines.push("# catalog-kit");
  lines.push("");
  lines.push(`> ${SUMMARY}`);
  lines.push("");
  lines.push(
    "Everything in this repo is driven by one portable `CatalogConfig` JSON. Start with " +
      "AGENTS.md for the working contract; the docs below teach each surface. Configs validate " +
      "against the JSON Schema without running any code, and the test suite runs offline against " +
      "recorded fixtures (no keys, no network).",
  );
  lines.push("");
  lines.push("## Docs");
  lines.push("");
  for (const [path, desc] of DOCS) {
    const title = titleFor(path);
    lines.push(`- [${title}](${path}): ${desc}`);
  }
  lines.push("");
  lines.push("## Optional");
  lines.push("");
  for (const [path, desc] of OPTIONAL) {
    const title = titleFor(path);
    lines.push(`- [${title}](${path}): ${desc}`);
  }
  lines.push("");
  return lines.join("\n");
}

/** Derive a human title from a repo-relative path. */
function titleFor(path) {
  if (path === "AGENTS.md") return "AGENTS.md";
  if (path === "README.md") return "README";
  if (path.endsWith(".schema.json")) return "CatalogConfig JSON Schema";
  if (path === "examples/") return "Example presets";
  const base = path.split("/").pop().replace(/\.md$/, "");
  const acronyms = { api: "API", ucp: "UCP" };
  return base
    .split("-")
    .map((w) => acronyms[w] ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Build the llms-full.txt concatenation. */
function buildFull() {
  const parts = [];
  for (const rel of FULL_ORDER) {
    const body = read(rel).replace(/\s+$/, "");
    parts.push(`---\n# ${rel}\n\n${body}`);
  }
  // Join with a blank line before each delimiter; first part starts clean.
  return parts.join("\n\n") + "\n";
}

const files = {
  "llms.txt": buildIndex(),
  "llms-full.txt": buildFull(),
};

if (CHECK_MODE) {
  const drift = [];
  for (const [name, content] of Object.entries(files)) {
    let current = null;
    try {
      current = readFileSync(join(ROOT, name), "utf8");
    } catch {
      current = null;
    }
    if (current !== content) drift.push(name);
  }
  if (drift.length > 0) {
    process.stderr.write(
      `llms drift: ${drift.join(", ")} would change. Run \`pnpm llms\` and commit.\n`,
    );
    process.exit(1);
  }
  if (JSON_MODE) {
    process.stdout.write(JSON.stringify({ ok: true, checked: Object.keys(files) }) + "\n");
  } else {
    process.stdout.write("llms.txt / llms-full.txt are up to date.\n");
  }
  process.exit(0);
}

if (JSON_MODE) {
  const summary = {
    generated: Object.entries(files).map(([name, content]) => ({
      file: relative(ROOT, join(ROOT, name)),
      bytes: Buffer.byteLength(content, "utf8"),
      lines: content.split("\n").length,
    })),
    docs: DOCS.length,
    optional: OPTIONAL.length,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  process.exit(0);
}

for (const [name, content] of Object.entries(files)) {
  writeFileSync(join(ROOT, name), content, "utf8");
  process.stdout.write(`wrote ${name} (${Buffer.byteLength(content, "utf8")} bytes)\n`);
}
