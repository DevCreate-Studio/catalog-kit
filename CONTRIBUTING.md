# Contributing to catalog-kit

Thanks for considering a contribution. This project is MIT-licensed and
welcomes issues, PRs, presets, and docs fixes.

## Dev setup

Requirements:

- **Node 20.19+ / 22.12+ / 24** (24 recommended) — transitive dependencies require one of
  these three ranges
- **pnpm 11**

```bash
pnpm install
pnpm dev    # runs the apps/web dev server
pnpm test   # runs the full test suite
```

### You never need API keys or network access to develop

`packages/catalog-client` is tested against **recorded fixtures** committed in
`packages/catalog-client/fixtures/*.json`. These are real, previously-recorded
responses from the live Shopify Global Catalog API. The test suite (`pnpm test`)
runs entirely offline against these fixtures — you do not need a Shopify Dev
Dashboard account, an agent profile, or network access to contribute, run
tests, or pass CI.

If you're changing behavior that depends on the shape of a live API response,
update or add a fixture rather than hand-editing test expectations from
memory.

### Refreshing fixtures (maintainers / when the API changes)

Fixtures are refreshed by hitting the **live** API:

```bash
pnpm fixtures
```

This requires network access and, for some scenarios, live credentials. Most
contributors will not need to run this — it's typically done by a maintainer
when the upstream API surface changes. If you do run it, re-run `pnpm test`
afterwards and confirm nothing unexpectedly broke.

## Keeping AGENTS.md current

`AGENTS.md` is the single source of truth for how agents (and humans) work in
this repo — commands, repo map, API gotchas, and conventions.

**Any PR that changes commands, project structure, or conventions must update
`AGENTS.md` in the same PR.** Reviewers will ask for this if it's missing.
Editor-specific pointer files (`CLAUDE.md`, `.cursor/rules/catalog-kit.mdc`,
`.github/copilot-instructions.md`) just point at `AGENTS.md` — never duplicate
its content there.

## Versioning

catalog-kit is a **clone-and-build starter, not an npm package** — there are no
changesets and no release workflow. If you're proposing a change to the client
(`packages/catalog-client`), just describe it clearly in your PR.

## Commit messages

This repo uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(client): add rating filter to buildSearchArguments
fix(web): correct minor-units conversion in price input
docs: clarify storefront scope in configuration.md
chore: bump tsup
```

Common types: `feat`, `fix`, `docs`, `chore`, `test`, `refactor`, `ci`.
Scope with `(client)` or `(web)` when a change is package-specific.

## Pull requests

- Keep PRs focused — one logical change per PR.
- Make sure `pnpm lint`, `pnpm test`, and `pnpm build` all pass locally before
  opening.
- Fill out the PR template checklist (tests, AGENTS.md).

## Contributing a preset

Presets (`examples/*.config.json`) are one of the easiest ways to contribute —
see the **preset** issue template for a guided submission, and
`packages/catalog-client/schema/catalog-config.schema.json` to validate your
config before submitting.

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). By
participating, you agree to uphold it.
