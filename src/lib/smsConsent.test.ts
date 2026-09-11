import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

import { consentKeyword, smsConsent } from "@/lib/smsConsent";
import { deliverToCustomer } from "@/server/deliver";

/**
 * Someone who replies STOP has withdrawn consent, and continuing to text them is unlawful
 * in most of the places Daythread's customers operate. The carrier rejects the send, which
 * until now looked like a mysterious delivery failure rather than a decision the product
 * had made and could explain.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

describe("texting someone who asked you to stop", () => {
  const ids: string[] = [];
  let businessId: string;
  let otherBusinessId: string;
  const phone = "+15125550199";

  const say = async (bizId: string, body: string, at = new Date()) => {
    const conversation = await prisma.conversation.findFirstOrThrow({ where: { businessId: bizId, channel: "SMS", externalHandle: phone } });
    await prisma.message.create({ data: { conversationId: conversation.id, direction: "INBOUND", body, createdAt: at } });
  };

  beforeAll(async () => {
    const s = stamp();
    for (const label of ["consent", "other"]) {
      const business = await prisma.business.create({ data: { name: `${label} Co`, handle: `${label}-${s}`, twilioPhoneNumber: `+1512555${label === "consent" ? "0101" : "0102"}` } });
      ids.push(business.id);
      const client = await prisma.client.create({ data: { businessId: business.id, name: "Texter", phone } });
      await prisma.conversation.create({ data: { businessId: business.id, clientId: client.id, channel: "SMS", externalHandle: phone, lastMessageAt: new Date(), category: "PRIORITY" } });
    }
    [businessId, otherBusinessId] = ids;
  });
  afterAll(async () => { await prisma.business.deleteMany({ where: { id: { in: ids } } }); });

  it("recognises the words carriers treat as opting out, and only those", () => {
    for (const word of ["STOP", "stop", " Stop ", "unsubscribe", "CANCEL", "quit", "End", "stop."]) {
      expect(consentKeyword(word), word).toBe("stop");
    }
    for (const word of ["START", "unstop", "Yes", "resume"]) {
      expect(consentKeyword(word), word).toBe("start");
    }
    // A real sentence that merely contains one of the words is a real message.
    for (const sentence of ["please don't cancel my booking", "can we stop at 4pm instead", "Stop by whenever", "I want to quit my gym not this"]) {
      expect(consentKeyword(sentence), sentence).toBeNull();
    }
  });

  it("an ordinary conversation is still textable", async () => {
    await say(businessId, "Hi, are you free Saturday?");
    expect(await smsConsent(businessId, phone)).toBe("ok");
  });

  it("STOP stops it", async () => {
    await say(businessId, "STOP", new Date(Date.now() + 1000));
    expect(await smsConsent(businessId, phone)).toBe("opted_out");
  });

  it("and the send is refused with a reason rather than failing at the carrier", async () => {
    const result = await deliverToCustomer({ businessId, businessName: "consent Co", businessHandle: "consent", channel: "SMS", to: phone, body: "Just checking in" });
    expect(result.status).toBe("NOT_DELIVERED");
    expect(result.statusDetail).toBe("opted_out");
    expect(result.error).toMatch(/replied STOP/i);
    expect(result.error).toMatch(/START/);
  });

  it("one business's opt-out does not silence another's messages", async () => {
    expect(await smsConsent(otherBusinessId, phone)).toBe("ok");
  });

  it("START starts it again", async () => {
    await say(businessId, "START", new Date(Date.now() + 2000));
    expect(await smsConsent(businessId, phone)).toBe("ok");
  });

  it("a number nobody has ever written from is textable", async () => {
    expect(await smsConsent(businessId, "+15125550000")).toBe("ok");
    expect(await smsConsent(businessId, "")).toBe("ok");
  });
});
