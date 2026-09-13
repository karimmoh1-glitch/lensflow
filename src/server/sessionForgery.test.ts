import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { SignJWT } from "jose";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

import { requireBusiness, verifySessionToken, createSessionToken, isSessionClaims } from "@/lib/auth";
import { signOAuthStateRaw } from "@/lib/integrations/oauthState";
import { updateBusinessProfile } from "@/app/actions/settings";
import { toggleAutomation } from "@/app/actions/automations";

/**
 * Server actions are public endpoints: every argument, including an optional `session`, can
 * be posted by anyone. These pin that a posted object never acts as a session, that an OAuth
 * state never works as a login, and that a revoked token stays revoked.
 */
describe("sessions cannot be forged", () => {
  let businessId: string;
  let userId: string;
  beforeAll(async () => {
    const s = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    businessId = (await prisma.business.create({ data: { name: "Forgery target", handle: `forgery-${s}` } })).id;
    userId = (await prisma.user.create({ data: { name: "Victim", email: `victim-${s}@example.test`, passwordHash: "x" } })).id;
    await prisma.orgMembership.create({ data: { userId, businessId, role: "OWNER" } });
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.business.deleteMany({ where: { id: businessId } });
  });

  it("a posted plain object is not a session outside the test runner's own fixtures", async () => {
    vi.stubEnv("DAYTHREAD_STRICT_SESSIONS", "1");
    const forged = { userId, activeBusinessId: businessId, sv: 0 };
    expect(await requireBusiness(forged)).toBeNull();
    await expect(toggleAutomation("anything", true, forged as never)).rejects.toThrow(/unauthorized/);
    const r = await updateBusinessProfile({ name: "Hijacked", bio: "", timezone: "UTC", bufferMinutes: 0, bookingLeadHours: 0 }, forged as never).catch((e: Error) => e);
    expect(r instanceof Error ? r.message : JSON.stringify(r)).toMatch(/unauthorized/i);
    expect((await prisma.business.findUniqueOrThrow({ where: { id: businessId } })).name).toBe("Forgery target");
    // The same person, through a token this server signed, is honoured.
    const verified = await verifySessionToken(await createSessionToken({ userId, activeBusinessId: businessId }));
    expect(verified).not.toBeNull();
    expect((await requireBusiness(verified))?.business.id).toBe(businessId);
  });

  it("an OAuth state token is not a session", async () => {
    const { state } = await signOAuthStateRaw({ provider: "zoom", purpose: "meetings", businessId, userId });
    expect(await verifySessionToken(state)).toBeNull();
    // Even a token signed with the session key but shaped like a state is refused.
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || "dev-only-insecure-secret");
    const stateShaped = await new SignJWT({ businessId, userId, nonce: "n", provider: "zoom", purpose: "meetings" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("10m").sign(secret);
    expect(await verifySessionToken(stateShaped)).toBeNull();
    expect(isSessionClaims({ userId, typ: "state" })).toBe(false);
    expect(isSessionClaims({ userId, sv: 0 })).toBe(true);
  });

  it("a token issued before a password change stays dead on every path", async () => {
    const token = await createSessionToken({ userId, activeBusinessId: businessId });
    expect(await verifySessionToken(token)).not.toBeNull();
    await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("an unsigned or alg:none token is refused", async () => {
    const none = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ userId, typ: "session", sv: 1 })).toString("base64url")}.`;
    expect(await verifySessionToken(none)).toBeNull();
    expect(await verifySessionToken("garbage")).toBeNull();
  });
});
