/**
 * Shared landing-page constants: the canonical repo URL, clone command, and
 * doc blob links. Docs render on GitHub for now (Task 5.3), so doc links point
 * at the repo's blob paths rather than an in-app route.
 */
export const GITHUB_URL = "https://github.com/DevCreate-Studio/catalog-kit";
export const GITHUB_REPO = "DevCreate-Studio/catalog-kit";
export const CLONE_COMMAND = `git clone ${GITHUB_URL}`;

/** Credits. */
export const AUTHOR_NAME = "Alex ElChehimi";
export const AUTHOR_URL = "https://x.com/alex_chehimi";
export const STUDIO_NAME = "DevCreate.Studio";
export const STUDIO_URL = "https://devcreate.studio";

/** Link to a doc file rendered on GitHub (docs/ render there). */
export function docLink(file: string): string {
  return `${GITHUB_URL}/blob/main/docs/${file}`;
}

export const DOCS = {
  gettingStarted: docLink("getting-started.md"),
  configuration: docLink("configuration.md"),
  apiReference: docLink("api-reference.md"),
  recipes: docLink("recipes.md"),
  compliance: docLink("compliance.md"),
  agentGuide: docLink("agent-guide.md"),
} as const;

/** The one copy-paste prompt handed to an agent. */
export const AGENT_PROMPT = `Clone github.com/DevCreate-Studio/catalog-kit and read AGENTS.md, then build me a <your idea> on the Global Catalog.`;
