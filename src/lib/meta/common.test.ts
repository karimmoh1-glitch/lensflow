import { describe, it, expect, vi, afterEach } from "vitest";
import { createHmac } from "crypto";
import { verifyMetaSignature, safeEqual, graphFetch, MetaApiError, isTokenInvalid, isPermissionError, isOutsideServiceWindow, userFacingMetaError, scrubMetaMessage } from "./common";

/**
 * The webhook signature is the only thing standing between a public URL and a forged
 * customer message, so it is tested the way an attacker would probe it: right length wrong
 * characters, right characters wrong length, another app's secret, a body changed by one
 * byte. Every one of these must be a clean `false` — never a throw, which the route would
 * turn into a 500 and Meta would retry forever.
 */
const SECRET = "b0b1c2d3e4f5a6978899aabbccddeeff";
const sign = (body: string, secret = SECRET) => "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");

describe("verifyMetaSignature", () => {
  const body = JSON.stringify({ object: "instagram", entry: [{ id: "ig_1" }] });

  it("accepts a signature Meta would actually send", () => {
    expect(verifyMetaSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("accepts an uppercase hex digest (Meta's casing is not guaranteed)", () => {
    expect(verifyMetaSignature(body, sign(body).toUpperCase().replace("SHA256=", "sha256="), SECRET)).toBe(true);
  });

  it("rejects a body changed by a single byte", () => {
    expect(verifyMetaSignature(body + " ", sign(body), SECRET)).toBe(false);
  });

  it("rejects a signature made with another app's secret", () => {
    expect(verifyMetaSignature(body, sign(body, "ffffffffffffffffffffffffffffffff"), SECRET)).toBe(false);
  });

  it("rejects a forged signature of the right length but non-hex characters, without throwing", () => {
    // The regression this guards: Buffer.from(…, "hex") stops at the first bad character,
    // so timingSafeEqual used to be handed a short buffer and threw a RangeError — turning
    // a forged request into a 500 instead of a 401.
    expect(() => verifyMetaSignature(body, "sha256=" + "z".repeat(64), SECRET)).not.toThrow();
    expect(verifyMetaSignature(body, "sha256=" + "z".repeat(64), SECRET)).toBe(false);
    expect(verifyMetaSignature(body, "sha256=" + "0z".repeat(32), SECRET)).toBe(false);
    expect(verifyMetaSignature(body, "sha256=" + "0".repeat(63) + "!", SECRET)).toBe(false);
  });

  it("rejects the wrong length, the wrong prefix, a missing header and an empty secret", () => {
    expect(verifyMetaSignature(body, "sha256=00", SECRET)).toBe(false);
    expect(verifyMetaSignature(body, "sha256=" + "0".repeat(128), SECRET)).toBe(false);
    expect(verifyMetaSignature(body, "sha1=" + "0".repeat(40), SECRET)).toBe(false);
    expect(verifyMetaSignature(body, sign(body).replace("sha256=", ""), SECRET)).toBe(false);
    expect(verifyMetaSignature(body, null, SECRET)).toBe(false);
    expect(verifyMetaSignature(body, sign(body), "")).toBe(false);
  });

  it("signs over the exact bytes, including unicode", () => {
    const unicode = JSON.stringify({ text: "Café ☕ — naïve" });
    expect(verifyMetaSignature(unicode, sign(unicode), SECRET)).toBe(true);
    expect(verifyMetaSignature(unicode.replace("Café", "Cafe"), sign(unicode), SECRET)).toBe(false);
  });
});

describe("safeEqual", () => {
  it("matches identical strings and nothing else", () => {
    expect(safeEqual("verify-me", "verify-me")).toBe(true);
    expect(safeEqual("verify-me", "verify-mE")).toBe(false);
    expect(safeEqual("verify-me", "verify-me ")).toBe(false);
    expect(safeEqual("", "")).toBe(false);
    expect(safeEqual(null, "verify-me")).toBe(false);
    expect(safeEqual("verify-me", undefined)).toBe(false);
  });
});

describe("graphFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed JSON on success", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ id: "17841400000" }), { status: 200 }));
    expect(await graphFetch<{ id: string }>("https://graph.instagram.com/me")).toMatchObject({ id: "17841400000" });
  });

  it("turns Meta's error envelope into a MetaApiError carrying code and subcode", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: { message: "Invalid OAuth access token", code: 190, error_subcode: 463, type: "OAuthException" } }), { status: 401 }));
    let caught: unknown = null;
    try {
      await graphFetch("https://graph.facebook.com/v21.0/me");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(MetaApiError);
    expect((caught as MetaApiError).code).toBe(190);
    expect((caught as MetaApiError).subcode).toBe(463);
    expect(isTokenInvalid(caught)).toBe(true);
  });

  it("treats a provider 500 as transient, never as a dead token", async () => {
    vi.stubGlobal("fetch", async () => new Response("<html>500</html>", { status: 500 }));
    let caught: unknown = null;
    try {
      await graphFetch("https://graph.facebook.com/v21.0/me");
    } catch (err) {
      caught = err;
    }
    expect((caught as MetaApiError).status).toBe(500);
    expect(isTokenInvalid(caught)).toBe(false);
    expect(userFacingMetaError(caught, "fallback")).toMatch(/problem on their side/i);
  });

  it("refuses a 200 whose body is not the JSON the caller expects", async () => {
    vi.stubGlobal("fetch", async () => new Response("<!doctype html><h1>Sorry</h1>", { status: 200 }));
    await expect(graphFetch("https://graph.facebook.com/v21.0/me")).rejects.toThrow(/could not be read/i);
  });

  it("gives up on a provider that never responds, instead of hanging the request", async () => {
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      })
    );
    let caught: unknown = null;
    try {
      await graphFetch("https://graph.facebook.com/v21.0/me", {}, 20);
    } catch (err) {
      caught = err;
    }
    expect((caught as MetaApiError).status).toBe(504);
    expect(isTokenInvalid(caught)).toBe(false);
    expect(userFacingMetaError(caught, "fallback")).toMatch(/didn't respond in time/i);
  });

  it("reports an unreachable provider without inventing a cause", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    await expect(graphFetch("https://graph.facebook.com/v21.0/me")).rejects.toThrow(/could not be reached/i);
  });
});

describe("error classification", () => {
  it("names token, permission and window failures separately", () => {
    expect(isTokenInvalid(new MetaApiError(400, 190, "x"))).toBe(true);
    expect(isTokenInvalid(new MetaApiError(400, 102, "x"))).toBe(true);
    expect(isTokenInvalid(new MetaApiError(401, null, "x"))).toBe(true);
    expect(isTokenInvalid(new MetaApiError(400, 131047, "x"))).toBe(false);
    expect(isPermissionError(new MetaApiError(403, 200, "x"))).toBe(true);
    expect(isOutsideServiceWindow(new MetaApiError(400, 131047, "x"))).toBe(true);
    expect(isOutsideServiceWindow(new MetaApiError(400, 190, "x"))).toBe(false);
    expect(isTokenInvalid(new Error("nope"))).toBe(false);
  });

  it("explains the 24-hour window in words a business owner can act on", () => {
    expect(userFacingMetaError(new MetaApiError(400, 131047, "Re-engagement message"), "fallback")).toMatch(/24 hours/);
  });
});

describe("scrubMetaMessage", () => {
  it("removes every credential shape Meta puts in an error message", () => {
    const dirty = "Bad token EAAGm0PX4ZCpsBA1 and IGAAQZBxyz123456 and IGQVJYbadtoken12345 client_secret=abcdef0123456789 access_token=EAAsecretvalue Bearer eyJhbGciOi.J9.sig";
    const clean = scrubMetaMessage(dirty);
    expect(clean).not.toContain("EAAGm0PX4ZCpsBA1");
    expect(clean).not.toContain("IGAAQZBxyz123456");
    expect(clean).not.toContain("IGQVJYbadtoken12345");
    expect(clean).not.toContain("abcdef0123456789");
    expect(clean).not.toContain("eyJhbGciOi.J9.sig");
    expect(clean).toContain("[token]");
  });

  it("never returns an unbounded provider message", () => {
    expect(scrubMetaMessage("x".repeat(5000)).length).toBeLessThanOrEqual(200);
  });
});
