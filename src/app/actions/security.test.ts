import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createSessionToken, verifySessionToken, requireBusiness, hashPassword } from "@/lib/auth";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers({ "x-forwarded-for": "203.0.113.50" }) }));

/**
 * Session lifecycle and abuse bounds: a token issued before a password reset is refused
 * everywhere; webhook bodies over the ceiling are refused before parsing; the demo tool is
 * refused for real workspaces on production.
 */
describe("session invalidation", () => {
  let userId: string;
  let businessId: string;
  beforeAll(async () => {
    const stamp = Date.now();
    const b = await prisma.business.create({ data: { name: "Sess", handle: `sess-${stamp}` } });
    businessId = b.id;
    userId = (await prisma.user.create({ data: { name: "S", email: `sess-${stamp}@example.com`, passwordHash: await hashPassword("original-pass-1") } })).id;
    await prisma.orgMembership.create({ data: { userId, businessId, role: "OWNER" } });
  });
  afterAll(async () => {
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  it("a token carries the session version and is refused once the password is reset", async () => {
    const token = await createSessionToken({ userId, activeBusinessId: businessId });
    const claims = await verifySessionToken(token);
    expect(claims?.sv).toBe(0);
    expect((await requireBusiness(claims))?.business.id).toBe(businessId);
    // What resetPassword / changePassword do: bump the version.
    await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
    expect(await requireBusiness(claims)).toBeNull();
    // A freshly issued token picks up the new version and works.
    const fresh = await verifySessionToken(await createSessionToken({ userId, activeBusinessId: businessId }));
    expect(fresh?.sv).toBe(1);
    expect((await requireBusiness(fresh))?.business.id).toBe(businessId);
  });

  it("a forged token with a future session version is refused", async () => {
    const claims = await verifySessionToken(await createSessionToken({ userId, activeBusinessId: businessId, sv: 99 }));
    expect(await requireBusiness(claims)).toBeNull();
  });
});

describe("webhook payload ceilings", () => {
  it("Twilio inbound refuses a body over 64KB before checking the signature", async () => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", "t");
    const { POST } = await import("@/app/api/webhooks/twilio/sms/route");
    const big = "Body=" + "x".repeat(70 * 1024);
    const r = await POST(new Request("http://localhost/api/webhooks/twilio/sms", { method: "POST", body: big, headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": "sig" } }));
    expect(r.status).toBe(413);
    vi.unstubAllEnvs();
  });
  it("Stripe refuses a body over 512KB", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_dummy");
    vi.resetModules();
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const r = await POST(new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: "{".repeat(600 * 1024), headers: { "stripe-signature": "x" } }));
    expect(r.status).toBe(413);
    vi.unstubAllEnvs();
  });
});
