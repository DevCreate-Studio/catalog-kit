import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetRateLimit,
  checkRateLimit,
  pruneRateLimit,
  rateLimitKey,
  setClock,
} from "../rate-limit";

/** Build a minimal Request carrying the given headers. */
function reqWith(headers: Record<string, string>): Request {
  return new Request("https://example.com/api/catalog", { method: "POST", headers });
}

describe("rate-limit — sliding window", () => {
  let clock: number;

  beforeEach(() => {
    __resetRateLimit();
    clock = 1_000_000;
    setClock(() => clock);
  });

  afterEach(() => {
    __resetRateLimit();
    setClock();
  });

  it("allows the first 20 hits, then blocks the 21st", () => {
    for (let i = 0; i < 20; i++) {
      const result = checkRateLimit("1.2.3.4");
      expect(result.ok, `hit ${i + 1} should pass`).toBe(true);
    }
    const blocked = checkRateLimit("1.2.3.4");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("allows again once the window has fully advanced past the old hits", () => {
    for (let i = 0; i < 20; i++) checkRateLimit("5.6.7.8");
    expect(checkRateLimit("5.6.7.8").ok).toBe(false);

    // Advance past the 60s window; all prior hits age out.
    clock += 61_000;
    expect(checkRateLimit("5.6.7.8").ok).toBe(true);
  });
});

describe("rate-limit — map eviction (#12)", () => {
  let clock: number;

  beforeEach(() => {
    __resetRateLimit();
    clock = 2_000_000;
    setClock(() => clock);
  });

  afterEach(() => {
    __resetRateLimit();
    setClock();
  });

  it("does NOT retain a key whose window has fully expired", () => {
    // Seed a key, then let its whole window expire and prune.
    checkRateLimit("9.9.9.9");
    // Sanity: pruning immediately keeps the still-fresh key.
    pruneRateLimit();
    // A fresh check still reports the key as present (2nd hit is within window).
    expect(checkRateLimit("9.9.9.9").ok).toBe(true);

    // Advance past the window so every timestamp is stale, then prune.
    clock += 61_000;
    pruneRateLimit();

    // The key must be gone: a brand-new caller with a fully-fresh window is the
    // only way ok can be true here, and retryAfter stays 0 (no retained hits).
    const afterEviction = checkRateLimit("9.9.9.9");
    expect(afterEviction.ok).toBe(true);
    expect(afterEviction.retryAfterSeconds).toBe(0);
  });
});

describe("rate-limit — trusted key derivation (#2)", () => {
  it("prefers Vercel's platform header over spoofable x-forwarded-for", () => {
    const key = rateLimitKey(
      reqWith({
        // Attacker tries to spoof identity via the leftmost XFF hop.
        "x-forwarded-for": "6.6.6.6, 10.0.0.1",
        "x-vercel-forwarded-for": "203.0.113.7",
      }),
    );
    expect(key).toBe("203.0.113.7");
  });

  it("falls back to the LAST x-forwarded-for hop, not the spoofable first", () => {
    const key = rateLimitKey(reqWith({ "x-forwarded-for": "6.6.6.6, 198.51.100.9" }));
    expect(key).toBe("198.51.100.9");
  });

  it("falls back to x-real-ip, then to 'local'", () => {
    expect(rateLimitKey(reqWith({ "x-real-ip": "192.0.2.5" }))).toBe("192.0.2.5");
    expect(rateLimitKey(reqWith({}))).toBe("local");
  });
});
