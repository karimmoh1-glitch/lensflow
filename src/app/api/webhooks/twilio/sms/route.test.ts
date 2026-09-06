import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getExpectedTwilioSignature } from "twilio/lib/webhooks/webhooks";

const TOKEN = "twilio_auth_token_test_inbound";
const URL_ = "http://localhost/api/webhooks/twilio/sms";
function form(params: Record<string, string>, sig?: string) {
  const body = new URLSearchParams(params).toString();
  return new Request(URL_, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": sig ?? getExpectedTwilioSignature(TOKEN, URL_, params) } });
}

/** Inbound SMS: forged signatures are refused, an unknown destination number is acknowledged
 * but ignored, and a real one lands in exactly the business that owns the number. */
describe("Twilio inbound SMS", () => {
  let POST: (req: Request) => Promise<Response>;
  let aId: string;
  let bId: string;
  const stamp = Date.now();
  beforeAll(async () => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", TOKEN);
    ({ POST } = await import("./route"));
    aId = (await prisma.business.create({ data: { name: "SMS A", handle: `sms-a-${stamp}`, twilioPhoneNumber: `+1555${String(stamp).slice(-7)}` } })).id;
    bId = (await prisma.business.create({ data: { name: "SMS B", handle: `sms-b-${stamp}` } })).id;
  });
  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: [aId, bId] } } });
    vi.unstubAllEnvs();
  });

  it("refuses a forged signature", async () => {
    const r = await POST(form({ From: "+15550001111", To: "+15550002222", Body: "hi", MessageSid: "SM1" }, "forged"));
    expect(r.status).toBe(403);
  });

  it("acknowledges an unknown number without creating anything", async () => {
    const r = await POST(form({ From: "+15550001111", To: "+19990000000", Body: "hi", MessageSid: "SM2" }));
    expect(r.status).toBe(200);
    expect(await prisma.conversation.count({ where: { businessId: { in: [aId, bId] } } })).toBe(0);
  });

  it("routes a signed message to the business that owns the number, and only there", async () => {
    const a = await prisma.business.findUniqueOrThrow({ where: { id: aId } });
    const r = await POST(form({ From: "+15550001111", To: a.twilioPhoneNumber!, Body: "Do you have Saturday open?", MessageSid: `SM3-${stamp}` }));
    expect(r.status).toBe(200);
    const convs = await prisma.conversation.findMany({ where: { businessId: aId }, include: { messages: true } });
    expect(convs).toHaveLength(1);
    expect(convs[0].channel).toBe("SMS");
    expect(convs[0].messages[0].body).toBe("Do you have Saturday open?");
    expect(await prisma.conversation.count({ where: { businessId: bId } })).toBe(0);
    // Twilio retries the same MessageSid: not ingested twice.
    await POST(form({ From: "+15550001111", To: a.twilioPhoneNumber!, Body: "Do you have Saturday open?", MessageSid: `SM3-${stamp}` }));
    expect(await prisma.message.count({ where: { conversation: { businessId: aId } } })).toBe(1);
  });
});
