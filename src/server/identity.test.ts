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
  it("joins a WhatsApp number to a client whose phone was stored in a different format", async () => {
    // The WhatsApp webhook supplies a bare wa_id, and the client may have been typed in by
    // hand. Both normalize to the same E.164 number, so it is one person — not two.
    const stamp = Date.now();
    const b = await prisma.business.create({ data: { name: "Id C", handle: `id-c-${stamp}` } });
    const typed = await prisma.client.create({ data: { businessId: b.id, name: "Ana Reyes", phone: "(512) 555-0199" } });
    // Rows written after it, so the old "most recently updated row" shortcut would miss.
    for (let i = 0; i < 5; i++) await prisma.client.create({ data: { businessId: b.id, name: `Other ${i}`, phone: `+1512555${1000 + i}` } });
    const found = await findKnownClient({ businessId: b.id, channel: "WHATSAPP", senderHandle: "+15125550199", senderName: "Ana", phone: "+15125550199" });
    expect(found.client?.id).toBe(typed.id);
    expect(found.matchedOn).toBe("phone");
    // A different number that merely shares a prefix is not the same person.
    const other = await findKnownClient({ businessId: b.id, channel: "WHATSAPP", senderHandle: "+15125550198", senderName: "Someone", phone: "+15125550198" });
    expect(other.client).toBeNull();
    await prisma.business.delete({ where: { id: b.id } });
  });
  it("never merges on a name alone across channels", async () => {
    const r = await findKnownClient({ businessId: aId, channel: "WHATSAPP", senderHandle: "+15550000000", senderName: "Sarah Kim" });
    expect(r.client).toBeNull();
  });
});