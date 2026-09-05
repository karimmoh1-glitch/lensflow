import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getExpectedTwilioSignature } from "twilio/lib/webhooks/webhooks";

const TOKEN = "twilio_auth_token_test";
let POST: (req: Request) => Promise<Response>;
const URL_ = "http://localhost/api/webhooks/twilio/status";
function form(params: Record<string, string>, sig?: string) {
  const body = new URLSearchParams(params).toString();
  return new Request(URL_, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": sig ?? getExpectedTwilioSignature(TOKEN, URL_, params) } });
}

describe("Twilio status callback", () => {
  let businessId: string;
  let messageId: string;
  beforeAll(async () => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", TOKEN);
    ({ POST } = await import("./route"));
    const b = await prisma.business.create({ data: { name: "Tw", handle: `tw-${Date.now()}` } });
    businessId = b.id;
    const c = await prisma.client.create({ data: { businessId, name: "T", phone: "+15550009999" } });
    const conv = await prisma.conversation.create({ data: { businessId, clientId: c.id, channel: "SMS", externalHandle: "+15550009999", lastMessageAt: new Date() } });
    messageId = (await prisma.message.create({ data: { conversationId: conv.id, direction: "OUTBOUND", body: "hi", status: "SENT", providerMessageId: "SM123" } })).id;
  });
  afterAll(async () => {
    await prisma.business.delete({ where: { id: businessId } });
    vi.unstubAllEnvs();
  });
  it("rejects a forged signature", async () => {
    expect((await POST(form({ MessageSid: "SM123", MessageStatus: "delivered" }, "bad"))).status).toBe(403);
    expect((await prisma.message.findUnique({ where: { id: messageId } }))?.status).toBe("SENT");
  });
  it("records delivered, then failed with Twilio's code — never the other way round", async () => {
    await POST(form({ MessageSid: "SM123", MessageStatus: "delivered" }));
    expect((await prisma.message.findUnique({ where: { id: messageId } }))?.status).toBe("DELIVERED");
    await POST(form({ MessageSid: "SM123", MessageStatus: "undelivered", ErrorCode: "30003" }));
    const m = await prisma.message.findUnique({ where: { id: messageId } });
    expect(m?.status).toBe("FAILED");
    expect(m?.statusDetail).toContain("30003");
  });
});
