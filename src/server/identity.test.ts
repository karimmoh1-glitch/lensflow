import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { findKnownClient, normalizePhone, normalizeEmail } from "./identity";

describe("identity", () => {
  let aId: string;
  let bId: string;
  beforeAll(async () => {
    const stamp = Date.now();
    aId = (await prisma.business.create({ data: { name: "Id A", handle: `id-a-${stamp}` } })).id;
    bId = (await prisma.business.create({ data: { name: "Id B", handle: `id-b-${stamp}` } })).id;
    await prisma.client.create({ data: { businessId: aId, name: "Sarah Kim", email: "Sarah@Example.com", phone: "+15125550148", instagram: "ig_17841" } });
    await prisma.client.create({ data: { businessId: bId, name: "Sarah Kim", email: "sarah@example.com", phone: "+15125550148" } });
  });
  afterAll(async () => {
    await prisma.business.delete({ where: { id: aId } });
    await prisma.business.delete({ where: { id: bId } });
  });

  it("normalizes phones and emails", () => {
    expect(normalizePhone("(512) 555-0148")).toBe("+15125550148");
    expect(normalizePhone("+1 512 555 0148")).toBe("+15125550148");
    expect(normalizePhone("5125550148")).toBe("+15125550148");
    expect(normalizePhone("12")).toBeNull();
    expect(normalizeEmail("  Sarah@Example.COM ")).toBe("sarah@example.com");
    expect(normalizeEmail("not-an-email")).toBeNull();
  });
  it("joins the same person across email, phone and Instagram — inside one business only", async () => {
    const byEmail = await findKnownClient({ businessId: aId, channel: "EMAIL", senderHandle: "sarah@example.com", senderName: "S. Kim" });
    const byPhone = await findKnownClient({ businessId: aId, channel: "SMS", senderHandle: "(512) 555-0148", senderName: "+15125550148" });
    const byIg = await findKnownClient({ businessId: aId, channel: "INSTAGRAM", senderHandle: "ig_17841", senderName: "@sarah" });
    expect(byEmail.client?.businessId).toBe(aId);
    expect(byPhone.client?.id).toBe(byEmail.client?.id);
    expect(byIg.client?.id).toBe(byEmail.client?.id);
    const inB = await findKnownClient({ businessId: bId, channel: "INSTAGRAM", senderHandle: "ig_17841", senderName: "@sarah" });
    expect(inB.client).toBeNull(); // B never linked that Instagram id
  });
  it("never merges on a name alone across channels", async () => {
    const r = await findKnownClient({ businessId: aId, channel: "WHATSAPP", senderHandle: "+15550000000", senderName: "Sarah Kim" });
    expect(r.client).toBeNull();
  });
});
