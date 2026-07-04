# Changelog

All notable changes to `catalog-kit` will be documented in this file.

## Unreleased

## 0.1.0 — 2026-07-04

Initial release.

- `catalog-kit` npm package: typed client for the Shopify Global Catalog (UCP MCP) — keyless anonymous + token auth tiers, JSON-RPC transport with retry/backoff, `CatalogConfig` contract + `buildSearchArguments()`, `search_catalog`/`lookup_catalog`/`get_product` tools with lenient response parsing, `image_url` → base64 like-entry resolution, generated JSON Schema.
- Next.js demo app: landing with live keyless teaser, three-panel configurator, three-tool playground with product inspector, preset-driven demo storefront.
- Four schema-validated example presets; 9 documentation pages; agent-ready artifacts (AGENTS.md, Claude Code skill, llms.txt, offline fixtures).
