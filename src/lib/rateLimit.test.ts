import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rateLimit } from "./rateLimit";

// A unique key prefix per test avoids cross-test bucket collisions in the shared
// module-level Map — rateLimit() has no reset/teardown hook by design (it's meant to
// persist for the life of the process), so tests must namespace their own keys instead.
let counter = 0;
function key(name: string) {
  counter += 1;
  return `test:${name}:${counter}`;
}

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the limit", () => {
    const k = key("basic");
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(k, { limit: 5, windowMs: 60_000 }).ok).toBe(true);
    }
  });

  it("blocks the request immediately after the limit is reached", () => {
    const k = key("block");
    for (let i = 0; i < 3; i++) rateLimit(k, { limit: 3, windowMs: 60_000 });
    const result = rateLimit(k, { limit: 3, windowMs: 60_000 });
    expect(result.ok).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("different keys never share a bucket — one caller can't lock out another", () => {
    const a = key("a");
    const b = key("b");
    for (let i = 0; i < 5; i++) rateLimit(a, { limit: 5, windowMs: 60_000 });
    expect(rateLimit(a, { limit: 5, windowMs: 60_000 }).ok).toBe(false);
    expect(rateLimit(b, { limit: 5, windowMs: 60_000 }).ok).toBe(true);
  });

  it("resets once the window elapses", () => {
    const k = key("reset");
    rateLimit(k, { limit: 1, windowMs: 1000 });
    expect(rateLimit(k, { limit: 1, windowMs: 1000 }).ok).toBe(false);

    vi.advanceTimersByTime(1001);

    expect(rateLimit(k, { limit: 1, windowMs: 1000 }).ok).toBe(true);
  });

  it("retryAfterSeconds counts down correctly toward the window boundary", () => {
    const k = key("countdown");
    rateLimit(k, { limit: 1, windowMs: 10_000 });
    vi.advanceTimersByTime(4000);
    const result = rateLimit(k, { limit: 1, windowMs: 10_000 });
    expect(result.ok).toBe(false);
    expect(result.retryAfterSeconds).toBe(6);
  });
});
