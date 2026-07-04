/**
 * Self-hosted UCP agent profile.
 *
 * Serves the repo-root sample profile (`profile/agent-profile.json`) at
 * `/agent-profile.json` with `Content-Type: application/json`. Once this app is
 * deployed, `https://<host>/agent-profile.json` is a valid `AGENT_PROFILE_URL`:
 * Shopify's fetcher requires the JSON content type and rejects `text/plain`
 * (e.g. a GitHub gist raw URL — see docs/probe-findings.md). Hosting the profile
 * here is the fix for that content-type problem — zero external hosting needed
 * for a first run.
 *
 * Importing the JSON across the workspace root is fine (resolveJsonModule is on
 * in tsconfig; the depth `../../../../` resolves to the repo root).
 */
import profile from "../../../../profile/agent-profile.json";

// The profile itself is static config, so a short public cache is safe here —
// this is NOT search-result data (compliance's no-store rule applies only to
// catalog results, served by app/api/catalog/route.ts).
export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(profile), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=300",
    },
  });
}
