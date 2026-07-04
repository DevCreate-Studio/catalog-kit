/**
 * Per-IP sliding-window rate limiter for the catalog proxy.
 *
 * IMPORTANT: this is an in-memory, per-instance limiter. State lives in a
 * module-level Map, so it resets on every deploy/restart and is NOT shared
 * across serverless instances or regions. That is good enough to stop a
 * deployed demo proxy from being trivially farmed — it is NOT a security
 * boundary. For real protection use an edge WAF or a shared store (Redis, etc).
 */

/** Requests allowed per window, per key. */
const LIMIT = 20;
/** Sliding window length in milliseconds. */
const WINDOW_MS = 60_000;

/** Ring of recent request timestamps (ms epoch) per key. */
const hits = new Map<string, number[]>();

/**
 * Injectable clock. Defaults to `Date.now`; overridable via {@link setClock}
 * so tests can advance time deterministically (e.g. to prove a key whose
 * window fully expires is evicted from the Map).
 */
let now: () => number = () => Date.now();

/** Override the limiter's clock (tests only). Pass no arg to restore `Date.now`. */
export function setClock(clock?: () => number): void {
  now = clock ?? (() => Date.now());
}

/** Clear all rate-limit state (tests only). */
export function __resetRateLimit(): void {
  hits.clear();
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the oldest in-window hit ages out (when `ok` is false). */
  retryAfterSeconds: number;
}

/**
 * Derive the rate-limit key from the request.
 *
 * SECURITY: the leftmost hop of `x-forwarded-for` is fully attacker-controlled
 * — any client can send `X-Forwarded-For: <anything>` and Vercel appends to it
 * rather than replacing it, so the leftmost value cannot be trusted to identify
 * the caller. We therefore prefer Vercel's platform-set `x-vercel-forwarded-for`
 * header (written by the edge, not spoofable by the client). When that is
 * absent we fall back to the LAST hop of `x-forwarded-for` (the hop closest to
 * our infrastructure, i.e. the one the proxy in front of us observed — still
 * imperfect but far harder to forge than the leftmost), then `x-real-ip`, then
 * `"local"` for local dev, which buckets all unattributed traffic together.
 */
export function rateLimitKey(req: Request): string {
  const vercel = req.headers.get("x-vercel-forwarded-for")?.trim();
  if (vercel) return vercel;

  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",");
    // LAST hop, not first: the leftmost hop is client-supplied and spoofable.
    const last = hops[hops.length - 1]?.trim();
    if (last) return last;
  }

  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "local";
}

/**
 * Record a hit for `key` and report whether it is within the sliding window.
 * Prunes timestamps older than the window on each call.
 */
export function checkRateLimit(key: string): RateLimitResult {
  const t = now();
  const cutoff = t - WINDOW_MS;
  const recent = (hits.get(key) ?? []).filter((ts) => ts > cutoff);

  if (recent.length >= LIMIT) {
    hits.set(key, recent);
    const oldest = recent[0] ?? t;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + WINDOW_MS - t) / 1000));
    return { ok: false, retryAfterSeconds };
  }

  recent.push(t);
  hits.set(key, recent);
  return { ok: true, retryAfterSeconds: 0 };
}

/**
 * Evict keys whose sliding window has fully expired.
 *
 * MEMORY: `checkRateLimit` only ever rewrites the key it touches, so a key that
 * stops receiving traffic would otherwise retain its (now-stale) timestamp
 * array forever — unbounded growth, one entry per unique IP ever seen. Callers
 * should sweep periodically; after pruning, any key left with an empty window
 * is deleted so the Map cannot grow without bound.
 */
export function pruneRateLimit(): void {
  const cutoff = now() - WINDOW_MS;
  for (const [key, timestamps] of hits) {
    const recent = timestamps.filter((ts) => ts > cutoff);
    if (recent.length === 0) {
      hits.delete(key);
    } else if (recent.length !== timestamps.length) {
      hits.set(key, recent);
    }
  }
}
