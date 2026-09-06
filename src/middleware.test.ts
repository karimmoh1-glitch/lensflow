import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";

vi.stubEnv("JWT_SECRET", "test-secret-for-middleware");

/** Protected prefixes bounce anonymous and forged sessions to /login; a valid session passes;
 * the mobile API is never redirected (bearer auth happens in the route). */
describe("middleware", () => {
  const load = async () => (await import("./middleware")).middleware;
  const req = (path: string, cookie?: string) => new NextRequest(`https://daythread.org${path}`, { headers: cookie ? { cookie: `lf_session=${cookie}` } : {} });

  it("anonymous → /login for every protected prefix", async () => {
    const mw = await load();
    for (const p of ["/dashboard", "/dashboard/billing", "/onboarding", "/portal", "/partner", "/workspaces"]) {
      const r = await mw(req(p));
      expect(r.headers.get("location")).toBe("https://daythread.org/login");
    }
  });

  it("a forged or tampered session is treated as anonymous", async () => {
    const mw = await load();
    const forged = await new SignJWT({ userId: "x" }).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode("another-secret"));
    expect((await mw(req("/dashboard", forged))).headers.get("location")).toBe("https://daythread.org/login");
    expect((await mw(req("/dashboard", "not.a.jwt"))).headers.get("location")).toBe("https://daythread.org/login");
  });

  it("a valid session passes, and public pages never redirect", async () => {
    const mw = await load();
    const valid = await new SignJWT({ userId: "x" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode("test-secret-for-middleware"));
    expect((await mw(req("/dashboard", valid))).headers.get("location")).toBeNull();
    expect((await mw(req("/login"))).headers.get("location")).toBeNull();
    expect((await mw(req("/api/mobile/me"))).headers.get("location")).toBeNull();
  });
});
