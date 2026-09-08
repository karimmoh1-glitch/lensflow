import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { subDays } from "date-fns";
import { prisma } from "@/lib/db";
import { ingestInboundMessage } from "./leadIngestion";
import { getAttention } from "./attention";
import { getColdLeads } from "./coldLeads";
import { getAwayDigest } from "./awayDigest";
import { readOpportunity, senderKind } from "@/lib/opportunity";
import { splitMessage } from "@/lib/cleanMessage";

/**
 * The whole loop on the ten messages a real photographer gets, through the real ingestion
 * path: cleaning, classification, People, the lead, the opportunity reading, Priority,
 * attention, leads going cold, the away digest. No sludge: machines never become people.
 */
const stamp = Date.now();
let businessId: string;
const inbound = (over: { senderName: string; senderHandle: string; body: string; subject?: string; headers?: Record<string, string | null> }) =>
  ingestInboundMessage({ businessId, channel: "EMAIL", senderName: over.senderName, senderHandle: over.senderHandle, clientEmail: over.senderHandle, body: over.body, subject: over.subject ?? "", providerMessageId: `loop-${stamp}-${Math.random().toString(36).slice(2)}`, headers: over.headers ?? null } as Parameters<typeof ingestInboundMessage>[0]);

beforeAll(async () => {
  const b = await prisma.business.create({ data: { name: "Loop Photography", handle: `loop-${stamp}`, planTier: "PRO", billingStatus: "ACTIVE" } });
  businessId = b.id;
  await prisma.service.createMany({ data: [
    { businessId, name: "Newborn session", priceCents: 35000, durationMins: 90 },
    { businessId, name: "Family session", priceCents: 45000, durationMins: 60 },
    { businessId, name: "Wedding", priceCents: 320000, durationMins: 480 },
  ] });
});
afterAll(async () => { await prisma.business.delete({ where: { id: businessId } }).catch(() => {}); });

describe("the product loop, end to end", () => {
  it("1 photographer inquiry → person, lead with the facts, Priority, waiting for a reply", async () => {
    const r = await inbound({ senderName: "Sarah Johnson", senderHandle: `sarah-${stamp}@gmail.com`, subject: "Family portraits in October?", body: "Hi! We're looking for a family session in October at Marymoor Park around sunset. Our budget is around $500. Are you available?\n\nOn Sun, Aug 30, 2026 at 4:35 PM Studio <s@x.com>\nwrote:\n\n> earlier" });
    expect(r.category).toBe("PRIORITY");
    expect(r.client).not.toBeNull();
    expect(r.lead?.intent).toBe("MEDIUM");
    expect(r.lead?.budgetCents).toBe(50000);
    expect(r.lead?.requestedDateText).toMatch(/October/i);
    const stored = await prisma.message.findFirstOrThrow({ where: { conversationId: r.conversation.id } });
    expect(splitMessage(stored.body).text).not.toMatch(/wrote:/);
    const o = readOpportunity({ category: r.category, relationship: "LEAD", lead: { status: r.lead!.status, intent: r.lead!.intent, respondedAt: null, lastInboundAt: r.lead!.lastInboundAt, followUpAt: null, createdAt: r.lead!.createdAt, serviceName: "Family session", requestedDateText: r.lead!.requestedDateText, budgetCents: r.lead!.budgetCents }, lastWordIsTheirs: true });
    expect(o.kind).toBe("potential_client");
    expect(o.reason).toMatch(/waiting for your reply/);
    expect(o.rank).toBeGreaterThan(50);
  });

  it("3–6 a delivery notice, a receipt, junk and a newsletter never become people, leads or attention", async () => {
    const before = await prisma.client.count({ where: { businessId } });
    const rs = await Promise.all([
      inbound({ senderName: "DoorDash", senderHandle: "no-reply@doordash.com", subject: "Your order has been delivered", body: "Your order from Thai Basil has been delivered. Enjoy! This is an automated message." }),
      inbound({ senderName: "Uber Receipts", senderHandle: "receipts@uber.com", subject: "Your Tuesday trip with Uber", body: "Total $18.40. Thanks for riding. Do not reply to this email." }),
      inbound({ senderName: "Prize Desk", senderHandle: "winner@lucky-draw.biz", subject: "Congratulations you have won", body: "Congratulations you have won a lottery prize claim. Wire transfer fee required." }),
      inbound({ senderName: "Gear Weekly", senderHandle: "newsletter@gearweekly.co", subject: "20% off lighting this week only", body: "Flash sale on strobes. Unsubscribe | View in browser", headers: { listUnsubscribe: "<mailto:u@gearweekly.co>", listId: "gear.gearweekly.co" } }),
    ]);
    for (const r of rs) { expect(r.category).not.toBe("PRIORITY"); expect(r.client).toBeNull(); expect(r.lead).toBeNull(); expect(senderKind(r.category)).toBe("AUTOMATED"); }
    expect(await prisma.client.count({ where: { businessId } })).toBe(before);
    expect((await getAttention(businessId)).some((a) => /DoorDash|Uber|Prize|Gear/.test(a.name))).toBe(false);
    expect(await prisma.analyticsEvent.count({ where: { businessId, name: "automated_message_filtered" } })).toBe(4);
  });

  it("2 & 10 an existing customer who writes again stays Priority and is a client, not a stranger", async () => {
    const r1 = await inbound({ senderName: "Maria Lopez", senderHandle: `maria-${stamp}@gmail.com`, body: "Hi, could we do another family session this spring?" });
    await prisma.client.update({ where: { id: r1.client!.id }, data: { relationship: "CUSTOMER" } });
    const r2 = await inbound({ senderName: "Maria Lopez", senderHandle: `maria-${stamp}@gmail.com`, body: "ok" });
    expect(r2.category).toBe("PRIORITY");
    expect(r2.client!.id).toBe(r1.client!.id);
    const o = readOpportunity({ category: "PRIORITY", relationship: "CUSTOMER", lead: { status: "NEW", respondedAt: null, lastInboundAt: new Date(), followUpAt: null, createdAt: new Date() }, lastWordIsTheirs: true });
    expect(o.label).toBe("Client");
  });

  it("7 & 9 a high-value booking inquiry outranks a plain question in Priority", async () => {
    const r = await inbound({ senderName: "Jordan Kim", senderHandle: `jordan-${stamp}@gmail.com`, subject: "Wedding on June 14", body: "We'd like to book you for our wedding on June 14 in Kirkland. Please hold the date if you can!" });
    expect(r.lead?.intent).toBe("HIGH");
    const high = readOpportunity({ category: "PRIORITY", relationship: "LEAD", lead: { status: "NEW", intent: "HIGH", respondedAt: null, lastInboundAt: new Date(), followUpAt: null, createdAt: new Date(), serviceName: "Wedding", requestedDateText: "June 14", estimatedValueCents: 320000 }, lastWordIsTheirs: true });
    const plain = readOpportunity({ category: "PRIORITY", relationship: "LEAD", lead: { status: "NEW", intent: "UNKNOWN", respondedAt: null, lastInboundAt: new Date(), followUpAt: null, createdAt: new Date() }, lastWordIsTheirs: true });
    expect(high.rank).toBeGreaterThan(plain.rank);
    // Their message is the last word, so the next step is the reply; the booking is made from the thread.
    expect(high.nextAction?.label).toBe("Reply");
  });

  it("8 a ghosted lead surfaces under leads going cold with what happened, and disappears when set aside", async () => {
    const r = await inbound({ senderName: "Alex Chen", senderHandle: `alex-${stamp}@gmail.com`, body: "How much for a newborn session next month?" });
    await prisma.lead.update({ where: { id: r.lead!.id }, data: { status: "CONTACTED", respondedAt: subDays(new Date(), 5), lastInboundAt: subDays(new Date(), 6) } });
    const cold = await getColdLeads(businessId);
    const alex = cold.find((c) => c.name === "Alex Chen");
    expect(alex).toBeDefined();
    expect(alex!.daysQuiet).toBe(5);
    expect(alex!.happened).toMatch(/you replied 5 days ago and nothing has come back/);
    expect(alex!.opportunity.reason).toMatch(/your reply went unanswered/);
    expect(alex!.estimatedValueCents).toBe(35000);
    await prisma.lead.update({ where: { id: r.lead!.id }, data: { status: "COLD" } });
    expect((await getColdLeads(businessId)).some((c) => c.name === "Alex Chen")).toBe(false);
  });

  it("the away digest counts only what changed, links to the lists, and sums only known service prices", async () => {
    const digest = await getAwayDigest(businessId, subDays(new Date(), 1));
    expect(digest).not.toBeNull();
    const keys = digest!.items.map((i) => i.key);
    expect(keys).toContain("new_people");
    expect(keys).toContain("waiting");
    expect(digest!.items.every((i) => i.href.startsWith("/dashboard"))).toBe(true);
    // Sarah's family session ($450), Jordan's wedding ($3,200) and Maria's family session ($450); Alex is COLD, so out.
    expect(digest!.quotedCount).toBe(3);
    expect(digest!.quotedCents).toBe(45000 + 320000 + 45000);
    expect(await getAwayDigest(businessId, new Date(Date.now() - 30 * 60_000))).toBeNull();
    expect(await getAwayDigest(businessId, null)).toBeNull();
  });
});
