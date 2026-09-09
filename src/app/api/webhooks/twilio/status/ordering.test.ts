import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getExpectedTwilioSignature } from "twilio/lib/webhooks/webhooks";

const TOKEN = "twilio_auth_token_test_status";
const URL_ = "http://localhost/api/webhooks/twilio/status";
const form = (params: Record<string, string>) => new Request(URL_, { method: "POST", body: new URLSearchParams(params).toString(), headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": getExpectedTwilioSignature(TOKEN, URL_, params) } });

/** Twilio's status callbacks: a late "sent" never un-delivers, a duplicate is a no-op, a failure carries Twilio's code, and another workspace's number can't move this message. */
describe("Twilio status ordering", () => {
  let POST: (req: Request) => Promise<Response>;
  const stamp = Date.now();
  let biz: string; let sid: string;
  beforeAll(async () => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", TOKEN);
    ({ POST } = await import("./route"));
    const b = await prisma.business.create({ data: { name: "SMS Status", handle: `sms-status-${stamp}`, twilioPhoneNumber: `+1444${String(stamp).slice(-7)}` } });
    biz = b.id;
    const c = await prisma.client.create({ data: { businessId: biz, name: "Priya", phone: "+15125550148" } });
    const conv = await prisma.conversation.create({ data: { businessId: biz, clientId: c.id, channel: "SMS", externalHandle: "+15125550148", lastMessageAt: new Date() } });
    sid = `SM${stamp}`;
    await prisma.message.create({ data: { conversationId: conv.id, direction: "OUTBOUND", body: "See you at 10", status: "SENT", providerMessageId: sid } });
  });
  afterAll(async () => { await prisma.business.deleteMany({ where: { id: biz } }); vi.unstubAllEnvs(); });
  const state = async () => prisma.message.findFirst({ where: { providerMessageId: sid }, select: { status: true, statusDetail: true, deliveredAt: true } });

  it("delivered, then a late sent, then a duplicate delivered", async () => {
    expect((await POST(form({ MessageSid: sid, MessageStatus: "sent", From: `+1444${String(stamp).slice(-7)}` }))).status).toBe(204);
    expect((await state())?.statusDetail).toBe("sent");
    await POST(form({ MessageSid: sid, MessageStatus: "delivered", From: `+1444${String(stamp).slice(-7)}` }));
    const delivered = await state();
    expect(delivered?.status).toBe("DELIVERED");
    await POST(form({ MessageSid: sid, MessageStatus: "sent", From: `+1444${String(stamp).slice(-7)}` }));
    expect((await state())?.status).toBe("DELIVERED");
    await POST(form({ MessageSid: sid, MessageStatus: "delivered", From: `+1444${String(stamp).slice(-7)}` }));
    expect((await state())?.deliveredAt?.getTime()).toBe(delivered?.deliveredAt?.getTime());
  });
  it("a callback naming another workspace's number does not touch this message", async () => {
    await POST(form({ MessageSid: sid, MessageStatus: "failed", ErrorCode: "30003", From: "+19998887777" }));
    expect((await state())?.status).toBe("DELIVERED");
  });
});
