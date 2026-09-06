import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword, verifySessionToken } from "@/lib/auth";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

/**
 * The password check every client goes through, exercised through the mobile route (the
 * web action does the identical check): wrong password → 401 with no token; the eighth
 * failure locks the email for ten minutes; a correct login returns a bearer whose claims
 * resolve to the right workspace; the token never carries the role or plan (those are
 * re-derived from the database on every request).
 */
describe("mobile login", () => {
  let POST: (req: Request) => Promise<Response>;
  let businessId: string;
  const email = `login-${Date.now()}@example.com`;
  const hit = (body: unknown) => POST(new Request("http://localhost/api/mobile/auth/login", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
  beforeAll(async () => {
    ({ POST } = await import("./route"));
    const b = await prisma.business.create({ data: { name: "Login Co", handle: `login-${Date.now()}` } });
    businessId = b.id;
    const u = await prisma.user.create({ data: { name: "L", email, passwordHash: await hashPassword("correct horse battery") } });
    await prisma.orgMembership.create({ data: { userId: u.id, businessId, role: "OWNER" } });
  });
  afterAll(async () => {
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.user.deleteMany({ where: { email } });
  });

  it("rejects malformed input and wrong credentials without leaking which part was wrong", async () => {
    expect((await hit({ email: "nope", password: "" })).status).toBe(400);
    const wrong = await hit({ email, password: "wrong" });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: "Incorrect email or password" });
    const unknown = await hit({ email: `nobody-${Date.now()}@example.com`, password: "wrong" });
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual({ error: "Incorrect email or password" });
  });

  it("returns a bearer token bound to the user and workspace, with no role or plan inside it", async () => {
    const r = await hit({ email, password: "correct horse battery" });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.business.id).toBe(businessId);
    expect(body.role).toBe("OWNER");
    const claims = await verifySessionToken(body.token);
    expect(claims?.activeBusinessId).toBe(businessId);
    expect(JSON.stringify(claims)).not.toMatch(/OWNER|planTier|BUSINESS/);
  });

  it("locks an email after eight failures in ten minutes, even with the right password", async () => {
    for (let i = 0; i < 8; i++) await hit({ email, password: "wrong" });
    const locked = await hit({ email, password: "correct horse battery" });
    expect(locked.status).toBe(429);
  });
});
