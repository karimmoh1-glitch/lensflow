import { describe, it, expect } from "vitest";
import { clientIpFrom } from "@/lib/rateLimit";

/**
 * Every rate limit in the product is keyed on this string: signup, login, password reset,
 * invitation acceptance, public availability, the Calendly webhook. If a caller can choose
 * the key, none of those limits exist. `x-forwarded-for` is a list the caller may prepend
 * to, so only the hop our own proxy appended — or a header only our edge sets — counts.
 */
describe("caller identity for rate limiting", () => {
  it("prefers the headers our own edge sets", () => {
    expect(clientIpFrom(new Headers({ "x-vercel-forwarded-for": "203.0.113.7", "x-forwarded-for": "1.1.1.1" }))).toBe("203.0.113.7");
    expect(clientIpFrom(new Headers({ "x-real-ip": "203.0.113.8", "x-forwarded-for": "1.1.1.1" }))).toBe("203.0.113.8");
  });

  it("a caller cannot mint a fresh identity by prepending to x-forwarded-for", () => {
    const real = "203.0.113.9";
    const keys = new Set(
      ["evil-1", "evil-2", "evil-3"].map((spoof) => clientIpFrom(new Headers({ "x-forwarded-for": `${spoof}, ${real}` }))),
    );
    // All three attempts land on the same bucket, so the limit actually counts them.
    expect([...keys]).toEqual([real]);
  });

  it("falls back safely when nothing identifies the caller", () => {
    expect(clientIpFrom(new Headers())).toBe("unknown");
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "   " }))).toBe("unknown");
    expect(clientIpFrom(new Headers({ "x-real-ip": "" }))).toBe("unknown");
  });

  it("a single hop is still the caller", () => {
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "203.0.113.10" }))).toBe("203.0.113.10");
  });
});
