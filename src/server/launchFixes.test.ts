import { describe, it, expect, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { signOAuthStateRaw, verifyOAuthStateWithNonce } from "@/lib/integrations/oauthState";
import { activateIntegration } from "@/server/integrationQuota";
import { processMetaEnvelope } from "@/server/metaInbound";
import { ingestInboundMessage } from "@/server/leadIngestion";

let visitor = 0;
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": `198.51.100.${(visitor++ % 200) + 1}` }), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/**
 * Regressions from the pre-launch audit. Each of these was live in production: sign-in
 * with Google refused its own state, a complimentary Business workspace was held to Free's
 * connection limit, a DM arriving after a token expired was thrown away, and a booking-page
 * submission created a second person for someone who had already written in.
 */
describe("launch fixes", () => {
  const ids: string[] = [];
  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
  });
  const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  it("Sign in with Google: the state the sign-in signs is the state the callback accepts", async () => {
    const { state, nonce } = await signOAuthStateRaw({ provider: "google", purpose: "signin", businessId: "signin", userId: "signin" });
    const r = await verifyOAuthStateWithNonce("google", state, nonce);
    expect(r).toEqual({ ok: true, state: { businessId: "signin", userId: "signin", purpose: "signin" } });
  });

  it("a complimentary Business workspace connects a third channel; the quota reads compedPlan, not just the tier", async () => {
    const b = await prisma.business.create({ data: { name: "Comped", handle: `comped-${stamp()}`, planTier: "FREE", billingStatus: null, compedPlan: "BUSINESS" } });
    ids.push(b.id);
    const cred = (p: string) => ({ externalAccount: `${p}@example.com`, externalId: `${p}-${b.id}`, accessToken: "tok", refreshToken: "ref", wanted: false });
    for (const provider of ["EMAIL", "GOOGLE_CALENDAR", "APPLE_CALENDAR"] as const) {
      const r = await activateIntegration({ businessId: b.id, provider, create: cred(provider), update: cred(provider) });
      expect(r.ok, provider).toBe(true);
    }
    expect(await prisma.integration.count({ where: { businessId: b.id, status: "CONNECTED" } })).toBe(3);
  });

  it("an Instagram DM delivered after the token expired is stored for the reconnect, not discarded", async () => {
    const b = await prisma.business.create({ data: { name: "Expired IG", handle: `expired-ig-${stamp()}` } });
    ids.push(b.id);
    const igId = `ig_${stamp()}`;
    await prisma.integration.create({ data: { businessId: b.id, provider: "INSTAGRAM", status: "NEEDS_ATTENTION", externalId: igId, externalAccount: "@expired", accessToken: "IGAAtoken", lastError: "Instagram's token expired — reconnect" } });
    const mid = `mid_${stamp()}`;
    const r = await processMetaEnvelope({ object: "instagram", entry: [{ id: igId, time: 1, messaging: [{ sender: { id: "igsid_late" }, recipient: { id: igId }, timestamp: 1, message: { mid, text: "Do you still have Saturday the 20th open?" } }] }] });
    expect(r.handled).toBe(1);
    const msg = await prisma.message.findFirst({ where: { providerMessageId: mid, conversation: { businessId: b.id } } });
    expect(msg?.body).toContain("Saturday the 20th");
    // A disconnected row still owns nothing.
    await prisma.integration.updateMany({ where: { businessId: b.id, provider: "INSTAGRAM" }, data: { status: "NOT_CONNECTED" } });
    const r2 = await processMetaEnvelope({ object: "instagram", entry: [{ id: igId, time: 2, messaging: [{ sender: { id: "igsid_late" }, recipient: { id: igId }, timestamp: 2, message: { mid: `${mid}_2`, text: "hello?" } }] }] });
    expect(r2.handled).toBe(0);
  });

  it("a booking-page inquiry from someone who already texted joins that person: one client, however the email is cased or the phone is written", async () => {
    const b = await prisma.business.create({ data: { name: "Identity", handle: `identity-${stamp()}` } });
    ids.push(b.id);
    await ingestInboundMessage({ businessId: b.id, channel: "SMS", senderName: "Sarah", senderHandle: "+15125550148", body: "Hi! Are you available September 14 for a family session?", providerMessageId: `sms-${stamp()}` });
    const { submitWebsiteLead } = await import("@/app/actions/websiteLead");
    const r = await submitWebsiteLead(b.handle, { name: "Sarah Johnson", email: "Sarah.Johnson@Gmail.com", phone: "(512) 555-0148", message: "Following up on the family session — this is Sarah." });
    expect(r.ok).toBe(true);
    const clients = await prisma.client.findMany({ where: { businessId: b.id } });
    expect(clients).toHaveLength(1);
    expect(clients[0].phone).toBe("+15125550148");
    expect(clients[0].email).toBe("sarah.johnson@gmail.com");
  });
});
