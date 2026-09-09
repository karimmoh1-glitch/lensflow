import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { subDays, addDays, setHours } from "date-fns";
import { prisma } from "@/lib/db";
import { ingestInboundMessage } from "./leadIngestion";
import { getNextActions } from "./nextActions";
import { gatherBusinessFacts } from "./copilotFacts";
import { answerFromRecords } from "@/lib/copilotAnswer";
import { findMergeCandidates, mergeClientRecords } from "./identity";
import { buildAgentBrief } from "./businessAgent";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
// The provider is the one thing not under test: every send here "arrives".
vi.mock("@/server/deliver", () => ({ deliverToCustomer: async () => ({ status: "SENT", providerMessageId: `sent-${Math.random().toString(36).slice(2)}`, statusDetail: "accepted", via: "gmail" }) }));

/**
 * Realistic businesses through the real ingestion path, the next-action engine, the
 * assistant's facts and the agent's brief: a photographer, a videographer, a cleaner, a
 * consultant, a pile of automated mail, and one human on three channels. Every
 * expectation is something the owner would see.
 */
const stamp = Date.now();
type Biz = { id: string; userId: string; session: { userId: string; activeBusinessId: string } };
const made: string[] = [];
async function business(name: string, services: Array<[string, number]>): Promise<Biz> {
  const b = await prisma.business.create({ data: { name, handle: `${name.toLowerCase().replace(/\W+/g, "-")}-${stamp}`, planTier: "PRO", billingStatus: "ACTIVE", timezone: "America/Los_Angeles" } });
  const u = await prisma.user.create({ data: { name: "Owner", email: `${b.handle}@example.com`, passwordHash: "x" } });
  await prisma.orgMembership.create({ data: { userId: u.id, businessId: b.id, role: "OWNER" } });
  await prisma.service.createMany({ data: services.map(([n, p]) => ({ businessId: b.id, name: n, priceCents: p, durationMins: 60 })) });
  made.push(b.id);
  return { id: b.id, userId: u.id, session: { userId: u.id, activeBusinessId: b.id } };
}
const email = (biz: Biz, from: { name: string; email: string }, subject: string, body: string, headers?: Record<string, string | null>) =>
  ingestInboundMessage({ businessId: biz.id, channel: "EMAIL", senderName: from.name, senderHandle: from.email, clientEmail: from.email, subject, body, providerMessageId: `sc-${stamp}-${Math.random().toString(36).slice(2)}`, headers: headers ?? null } as Parameters<typeof ingestInboundMessage>[0]);
const quiet = (leadId: string, daysAgoReplied: number) => prisma.lead.update({ where: { id: leadId }, data: { respondedAt: subDays(new Date(), daysAgoReplied), lastInboundAt: subDays(new Date(), daysAgoReplied + 1), status: "CONTACTED" } });

afterAll(async () => { await prisma.business.deleteMany({ where: { id: { in: made } } }); });

describe("photographer", () => {
  let biz: Biz;
  beforeAll(async () => { biz = await business("Lens Studio", [["Wedding", 320000], ["Newborn session", 35000], ["Family session", 45000]]); });

  it("wedding + newborn inquiries become people with the facts; both need a reply, longest wait first", async () => {
    const w = await email(biz, { name: "Priya Patel", email: `priya-${stamp}@gmail.com` }, "Wedding in June", "Hi! We're getting married June 20 at Willows Lodge and would love to talk about wedding photography. What do your packages look like?");
    const n = await email(biz, { name: "Dana Kim", email: `dana-${stamp}@gmail.com` }, "Newborn photos", "Our baby is due in October and we'd like a newborn session at home in Redmond. Budget is around $500. Are you available?");
    expect(w.category).toBe("PRIORITY"); expect(n.category).toBe("PRIORITY");
    expect(n.lead?.budgetCents).toBe(50000);
    await prisma.lead.update({ where: { id: w.lead!.id }, data: { lastInboundAt: subDays(new Date(), 1) } });
    const { actions } = await getNextActions(biz.id);
    expect(actions.map((a) => a.person.name)).toEqual(["Priya Patel", "Dana Kim"]);
    expect(actions[0]).toMatchObject({ kind: "reply", stage: "New inquiry", headline: "Priya needs your reply", draftMode: "reply" });
    expect(actions[1].value).toMatchObject({ basis: "budget", known: true, label: "Their budget: $500" });
    expect(actions[0].why).not.toMatch(/score|rank|\d{2,}%/i);
  });

  it("a $500 quote goes out, the lead goes silent: known money at risk, a follow-up, and the assistant can say who was quoted", async () => {
    const { sendReplyAction } = await import("@/app/actions/inbox");
    const lead = await prisma.lead.findFirstOrThrow({ where: { businessId: biz.id, extractedName: { contains: "Dana" } } });
    await sendReplyAction(lead.conversationId!, "Hi Dana! A newborn session at home is $500 including 20 edited photos. October works — shall I hold the 12th?", false, biz.session);
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.quotedCents).toBe(50000);
    expect(after.respondedAt).not.toBeNull();
    expect(after.followUpAt).not.toBeNull(); // the three-day reminder
    await quiet(lead.id, 4);
    await prisma.lead.update({ where: { id: lead.id }, data: { followUpAt: null } });
    const read = await getNextActions(biz.id);
    const dana = read.actions.find((a) => a.person.leadId === lead.id)!;
    expect(dana).toMatchObject({ kind: "follow_up", stage: "Quote sent, no answer", atRisk: true, headline: "Dana may be going cold", draftMode: "follow_up" });
    expect(dana.value).toMatchObject({ basis: "quoted", known: true, label: "Quoted $500" });
    expect(read.atRisk.knownCents).toBe(50000);
    const facts = await gatherBusinessFacts(biz.id);
    expect(answerFromRecords("Who did I quote this week?", facts.data)).toContain("Dana Kim — $500");
    expect(answerFromRecords("What should I work on today?", facts.data)).toMatch(/1\. Priya needs your reply/);
    // The wedding's list price is bigger than Dana's quote — and it is labelled as the estimate it is.
    expect(answerFromRecords("What's my biggest opportunity?", facts.data)).toContain("Priya Patel — About $3,200, the service's price (an estimate, not a quote)");
    // The agent proposes from the same list, so it can't disagree with Today.
    const brief = await buildAgentBrief(biz.id);
    expect(brief.proposals.map((p) => p.kind)).toEqual(["reply", "follow_up"]);
    expect(brief.proposals[1].valueCents).toBe(50000);
  });

  it("a booking request lands as high intent; a booking three days out that isn't confirmed asks to be confirmed", async () => {
    const r = await email(biz, { name: "Marcus Bell", email: `marcus-${stamp}@gmail.com` }, "Book a family session", "I'd like to book a family session for Saturday the 19th at 10am, please. How do I lock it in?");
    expect(r.lead?.intent).toBe("HIGH");
    const service = await prisma.service.findFirstOrThrow({ where: { businessId: biz.id, name: "Family session" } });
    await prisma.booking.create({ data: { businessId: biz.id, clientId: r.client!.id, serviceId: service.id, startAt: setHours(addDays(new Date(), 2), 10), endAt: setHours(addDays(new Date(), 2), 11), status: "BOOKED", totalCents: 45000 } });
    const { actions } = await getNextActions(biz.id);
    const confirm = actions.find((a) => a.kind === "confirm_booking")!;
    expect(confirm).toMatchObject({ stage: "Booked, not confirmed", headline: "Confirm Marcus's booking" });
    expect(confirm.value?.label).toBe("Booked at $450");
    // Replies still come before the confirmation.
    expect(actions.findIndex((a) => a.kind === "reply")).toBeLessThan(actions.indexOf(confirm));
  });
});

describe("videographer, cleaner, consultant", () => {
  it("a wedding-video inquiry and a pricing question both need a reply; a quote request and a scheduling ask are read as such", async () => {
    const v = await business("Frame Films", [["Wedding film", 450000]]);
    const a = await email(v, { name: "Elena Ruiz", email: `elena-${stamp}@gmail.com` }, "Wedding video", "We're looking for a wedding film for September 5 next year in Sonoma. Can you send pricing?");
    expect(a.category).toBe("PRIORITY"); expect(a.lead?.intent).not.toBe("UNKNOWN");
    const { actions } = await getNextActions(v.id);
    expect(actions[0]).toMatchObject({ kind: "reply", person: { name: "Elena Ruiz" } });
    expect(actions[0].value).toMatchObject({ basis: "service", known: false });

    const c = await business("Spotless Homes", [["Deep clean", 22000]]);
    const q = await email(c, { name: "Tom Nguyen", email: `tom-${stamp}@gmail.com` }, "Quote for a deep clean", "Could I get a quote for a deep clean of a 3-bedroom house? Ideally next Tuesday morning.");
    expect(q.category).toBe("PRIORITY");
    expect((await getNextActions(c.id)).actions[0].detail).toMatch(/Deep clean/);

    const k = await business("North Consulting", [["Discovery call", 0], ["Strategy engagement", 500000]]);
    const d = await email(k, { name: "Aisha Bello", email: `aisha-${stamp}@gmail.com` }, "Discovery call?", "I run a 12-person agency and would like a discovery call about a strategy engagement this quarter.");
    expect(d.category).toBe("PRIORITY");
    await quiet(d.lead!.id, 5);
    const read = await getNextActions(k.id);
    expect(read.actions[0]).toMatchObject({ kind: "follow_up", stage: "Waiting on them", atRisk: true });
  });
});

describe("automated mail", () => {
  it("DoorDash, Amazon, a Meta notification, a newsletter, a receipt, a calendar notice and a noreply never reach People, the list, or the assistant", async () => {
    const biz = await business("Quiet Inbox", [["Session", 30000]]);
    const rs = await Promise.all([
      email(biz, { name: "DoorDash", email: "no-reply@doordash.com" }, "Your order is on its way", "Your order from Pho 99 is on its way. This is an automated message."),
      email(biz, { name: "Amazon.com", email: "shipment-tracking@amazon.com" }, "Your package has shipped", "Your package will arrive Thursday. Track your package."),
      email(biz, { name: "Instagram", email: "no-reply@mail.instagram.com" }, "You have 3 new notifications", "See what you missed on Instagram."),
      email(biz, { name: "Gear Weekly", email: "newsletter@gearweekly.co" }, "20% off this week", "Flash sale. Unsubscribe | View in browser", { listUnsubscribe: "<mailto:u@gearweekly.co>", listId: "gear.gearweekly.co" }),
      email(biz, { name: "Uber Receipts", email: "receipts@uber.com" }, "Your Tuesday trip", "Total $18.40. Do not reply to this email."),
      email(biz, { name: "Google Calendar", email: "calendar-notification@google.com" }, "Invitation: Sync @ Thu", "You have been invited to the following event."),
      email(biz, { name: "Acme", email: "noreply@acme-billing.com" }, "Your invoice is ready", "Your monthly invoice is attached. Do not reply."),
    ]);
    for (const r of rs) { expect(r.category, r.conversation.externalHandle ?? "").not.toBe("PRIORITY"); expect(r.client).toBeNull(); }
    expect(await prisma.client.count({ where: { businessId: biz.id } })).toBe(0);
    expect((await getNextActions(biz.id)).actions).toHaveLength(0);
    const facts = await gatherBusinessFacts(biz.id);
    expect(answerFromRecords("What should I work on today?", facts.data)).toMatch(/^Nothing needs you right now/);
  });
});

describe("one human on three channels", () => {
  it("stays three records without a shared identifier, is suggested — never merged — on a full name, and merges on the owner's word", async () => {
    const biz = await business("Threads Studio", [["Session", 30000]]);
    const ig = await ingestInboundMessage({ businessId: biz.id, channel: "INSTAGRAM", senderName: "Sarah Johnson", senderHandle: `igsid_${stamp}`, body: "Hey, are you available September 14?", providerMessageId: `ig-${stamp}` } as Parameters<typeof ingestInboundMessage>[0]);
    const gm = await email(biz, { name: "Sarah Johnson", email: `sarah-${stamp}@gmail.com` }, "Hi", "Hi, this is Sarah — following up on my Instagram message about September 14.");
    const sms = await ingestInboundMessage({ businessId: biz.id, channel: "SMS", senderName: "Sarah Johnson", senderHandle: "+15125550199", body: "Just following up.", providerMessageId: `sms-${stamp}` } as Parameters<typeof ingestInboundMessage>[0]);
    expect(new Set([ig.client!.id, gm.client!.id, sms.client!.id]).size).toBe(3);
    const suggestions = await findMergeCandidates(biz.id, gm.client!.id);
    expect(suggestions.map((s) => s.basis)).toEqual(["name", "name"]);
    expect(suggestions[0].why).toMatch(/Not proven/);
    // A first name alone is never enough.
    const solo = await email(biz, { name: "Sarah", email: `sarah2-${stamp}@gmail.com` }, "Hi", "Hi there, quick question about pricing.");
    expect(await findMergeCandidates(biz.id, solo.client!.id)).toHaveLength(0);
    // Conflicting identifiers block the suggestion.
    const other = await email(biz, { name: "Sarah Johnson", email: `sarahj-other-${stamp}@yahoo.com` }, "Hi", "Different Sarah here.");
    expect((await findMergeCandidates(biz.id, gm.client!.id)).some((s) => s.id === other.client!.id)).toBe(false);
    // Merge on the owner's word: history moves, identifiers union, the other row is gone.
    const r = await mergeClientRecords(biz.id, gm.client!.id, ig.client!.id);
    expect(r.ok).toBe(true);
    const kept = await prisma.client.findUniqueOrThrow({ where: { id: gm.client!.id }, include: { conversations: true, leads: true } });
    expect(kept.conversations).toHaveLength(2);
    expect(kept.instagram).toBe(`igsid_${stamp}`);
    expect(await prisma.client.findUnique({ where: { id: ig.client!.id } })).toBeNull();
    // Another workspace can't reach in.
    const stranger = await business("Stranger", [["Session", 1000]]);
    expect(await mergeClientRecords(stranger.id, gm.client!.id, sms.client!.id)).toMatchObject({ ok: false });
    expect(await prisma.client.count({ where: { businessId: biz.id } })).toBe(4);
  });

  it("a thank-you after your reply keeps the lead answered; a follow-up question reopens it", async () => {
    const b = await prisma.business.create({ data: { name: "Ack Studio", handle: `ack-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` } });
    made.push(b.id);
    const first = await ingestInboundMessage({ businessId: b.id, channel: "EMAIL", senderName: "Dana Ortiz", senderHandle: "dana.ortiz@outlook.com", clientEmail: "dana.ortiz@outlook.com", subject: "Headshots", body: "Hi! Do you do headshots for a team of six? What would that cost?", providerMessageId: `ack-1-${Date.now()}` });
    await prisma.lead.update({ where: { id: first.lead!.id }, data: { respondedAt: new Date(), status: "CONTACTED" } });
    await ingestInboundMessage({ businessId: b.id, channel: "EMAIL", senderName: "Dana Ortiz", senderHandle: "dana.ortiz@outlook.com", clientEmail: "dana.ortiz@outlook.com", subject: "Re: Headshots", body: "Perfect, thank you so much! Talk soon.", providerMessageId: `ack-2-${Date.now()}` });
    let lead = await prisma.lead.findUnique({ where: { id: first.lead!.id } });
    expect(lead?.respondedAt).not.toBeNull();
    expect((await getNextActions(b.id)).actions.find((a) => a.person.leadId === lead!.id)).toBeUndefined();
    await ingestInboundMessage({ businessId: b.id, channel: "EMAIL", senderName: "Dana Ortiz", senderHandle: "dana.ortiz@outlook.com", clientEmail: "dana.ortiz@outlook.com", subject: "Re: Headshots", body: "Thanks! Actually, could we do it on the 20th instead?", providerMessageId: `ack-3-${Date.now()}` });
    lead = await prisma.lead.findUnique({ where: { id: first.lead!.id } });
    expect(lead?.respondedAt).toBeNull();
    expect((await getNextActions(b.id)).actions.find((a) => a.person.leadId === lead!.id)?.kind).toBe("reply");
  });
});
