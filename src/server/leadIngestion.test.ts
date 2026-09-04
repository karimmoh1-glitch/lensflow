import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { ingestInboundMessage } from "./leadIngestion";

/**
 * Integration test against a real database (DATABASE_URL) — this is the exact scenario
 * every inbound webhook (Twilio SMS, Resend email) depends on: a provider redelivering
 * the same message must never create a second conversation/lead. Uses its own isolated
 * Business, cleaned up via cascade delete in afterAll — never touches seeded/demo data.
 */
describe("ingestInboundMessage idempotency", () => {
  let businessId: string;

  beforeAll(async () => {
    const business = await prisma.business.create({
      data: { name: "Test Fixture Business", handle: `test-fixture-${Date.now()}` },
    });
    businessId = business.id;
  });

  afterAll(async () => {
    await prisma.business.delete({ where: { id: businessId } });
  });

  it("redelivering the same providerMessageId does not create a duplicate conversation/lead/message", async () => {
    const first = await ingestInboundMessage({
      businessId,
      channel: "SMS",
      senderName: "+15551234567",
      senderHandle: "+15551234567",
      body: "Do you have availability next week?",
      clientPhone: "+15551234567",
      providerMessageId: "SM_test_dedup_1",
    });
    expect(first.duplicate).toBe(false);
    expect(first.conversation).toBeTruthy();

    const second = await ingestInboundMessage({
      businessId,
      channel: "SMS",
      senderName: "+15551234567",
      senderHandle: "+15551234567",
      body: "Do you have availability next week?",
      clientPhone: "+15551234567",
      providerMessageId: "SM_test_dedup_1",
    });
    expect(second.duplicate).toBe(true);
    expect(second.conversation.id).toBe(first.conversation!.id);

    const messages = await prisma.message.count({ where: { conversationId: first.conversation!.id } });
    expect(messages).toBe(1);

    const leads = await prisma.lead.count({ where: { businessId } });
    expect(leads).toBe(1);
  });

  it("two different providerMessageIds from the same sender append to one conversation, not two", async () => {
    await ingestInboundMessage({
      businessId,
      channel: "SMS",
      senderName: "+15559876543",
      senderHandle: "+15559876543",
      body: "First message",
      clientPhone: "+15559876543",
      providerMessageId: "SM_test_thread_1",
    });
    await ingestInboundMessage({
      businessId,
      channel: "SMS",
      senderName: "+15559876543",
      senderHandle: "+15559876543",
      body: "Second message",
      clientPhone: "+15559876543",
      providerMessageId: "SM_test_thread_2",
    });

    const conversations = await prisma.conversation.count({
      where: { businessId, externalHandle: "+15559876543" },
    });
    expect(conversations).toBe(1);
  });
});

/**
 * Regression: an automated email (a DoorDash confirmation from a no-reply address) must be
 * stored — All Inbox keeps everything — but must not become a client or a lead, and must
 * be classified out of Priority. A person writing in still creates both.
 */
describe("ingestInboundMessage classification", () => {
  let businessId: string;

  beforeAll(async () => {
    const business = await prisma.business.create({ data: { name: "Classify Fixture", handle: `classify-fixture-${Date.now()}` } });
    businessId = business.id;
  });

  afterAll(async () => {
    await prisma.business.delete({ where: { id: businessId } });
  });

  it("stores an automated email without creating a client or a lead", async () => {
    const r = await ingestInboundMessage({
      businessId,
      channel: "EMAIL",
      senderName: "DoorDash",
      senderHandle: "no-reply@doordash.com",
      clientEmail: "no-reply@doordash.com",
      subject: "Your order has been confirmed",
      body: "Your DoorDash order from Thai Basil is confirmed and on its way.",
      providerMessageId: "email_test_doordash_1",
    });
    expect(r.category).toBe("AUTOMATED");
    expect(r.client).toBeNull();
    expect(r.lead).toBeNull();
    expect(await prisma.client.count({ where: { businessId } })).toBe(0);
    expect(await prisma.lead.count({ where: { businessId } })).toBe(0);
    const stored = await prisma.conversation.findUnique({ where: { id: r.conversation.id } });
    expect(stored?.category).toBe("AUTOMATED");
    expect(stored?.clientId).toBeNull();
    expect(await prisma.message.count({ where: { conversationId: r.conversation.id } })).toBe(1);
  });

  it("keeps a real inquiry as priority and creates the lead and client", async () => {
    const r = await ingestInboundMessage({
      businessId,
      channel: "EMAIL",
      senderName: "Sarah Kim",
      senderHandle: "sarah.kim@gmail.com",
      clientEmail: "sarah.kim@gmail.com",
      subject: "Friday?",
      body: "Hey! Do you have anything available Friday afternoon?",
      providerMessageId: "email_test_sarah_1",
    });
    expect(r.category).toBe("PRIORITY");
    expect(r.client).not.toBeNull();
    expect(r.lead).not.toBeNull();
    expect(r.client!.relationship).toBe("LEAD");
    expect(await prisma.client.count({ where: { businessId } })).toBe(1);
  });

  it("a newsletter with list headers is promotional, even from a person-looking address", async () => {
    const r = await ingestInboundMessage({
      businessId,
      channel: "EMAIL",
      senderName: "Jane at Brand",
      senderHandle: "jane@brand.example",
      clientEmail: "jane@brand.example",
      subject: "Weekly digest",
      body: "Here's what's new. Unsubscribe any time.",
      headers: { listUnsubscribe: "<mailto:unsub@brand.example>" },
      providerMessageId: "email_test_news_1",
    });
    expect(r.category).toBe("PROMOTIONAL");
    expect(await prisma.client.count({ where: { businessId } })).toBe(1); // still just Sarah
  });
});

describe("ingestInboundMessage relationships and corrections", () => {
  let businessId: string;

  beforeAll(async () => {
    const business = await prisma.business.create({ data: { name: "Relationship Fixture", handle: `relationship-fixture-${Date.now()}` } });
    businessId = business.id;
  });

  afterAll(async () => {
    await prisma.business.delete({ where: { id: businessId } });
  });

  it("an existing customer stays a customer even when a later message looks automated", async () => {
    const client = await prisma.client.create({ data: { businessId, name: "Priya Patel", email: "priya@customer.example", relationship: "CUSTOMER" } });
    const r = await ingestInboundMessage({
      businessId,
      channel: "EMAIL",
      senderName: "Priya Patel",
      senderHandle: "priya@customer.example",
      clientEmail: "priya@customer.example",
      subject: "Your order confirmation — quick question",
      body: "Can you resend the receipt for the deposit? Order number is on it I think.",
      providerMessageId: "customer-transactional-1",
    });
    expect(r.category).toBe("PRIORITY");
    expect(r.client?.id).toBe(client.id);
    const after = await prisma.client.findUnique({ where: { id: client.id } });
    expect(after?.relationship).toBe("CUSTOMER");
    expect(await prisma.client.count({ where: { businessId } })).toBe(1);
  });

  it("a stored correction for this business changes where the next message lands — and only for this business", async () => {
    await prisma.senderRule.create({ data: { businessId, kind: "domain", value: "bookingtool.example", category: "PRIORITY" } });
    const here = await ingestInboundMessage({
      businessId,
      channel: "EMAIL",
      senderName: "Booking Tool",
      senderHandle: "noreply@bookingtool.example",
      clientEmail: "noreply@bookingtool.example",
      subject: "Booking request received",
      body: "We received your booking request.",
      providerMessageId: "rule-1",
    });
    expect(here.category).toBe("PRIORITY");
    expect(here.conversation.categoryReason).toMatch(/You marked/);

    const other = await prisma.business.create({ data: { name: "Other Tenant", handle: `other-tenant-${Date.now()}` } });
    try {
      const there = await ingestInboundMessage({
        businessId: other.id,
        channel: "EMAIL",
        senderName: "Booking Tool",
        senderHandle: "noreply@bookingtool.example",
        clientEmail: "noreply@bookingtool.example",
        subject: "Booking request received",
        body: "We received your booking request.",
        providerMessageId: "rule-2",
      });
      expect(there.category).toBe("AUTOMATED");
      expect(await prisma.client.count({ where: { businessId: other.id } })).toBe(0);
    } finally {
      await prisma.business.delete({ where: { id: other.id } });
    }
  });

  it("a platform's mail is a vendor, and a teammate on the business's own domain is internal", async () => {
    const stripe = await ingestInboundMessage({ businessId, channel: "EMAIL", senderName: "Stripe", senderHandle: "receipts@stripe.com", clientEmail: "receipts@stripe.com", subject: "Your Stripe payout of $312.00", body: "A payout was sent to your bank account.", providerMessageId: "vendor-1" });
    expect(stripe.category).toBe("VENDOR");
    expect(stripe.client).toBeNull();
    const owner = await prisma.user.create({ data: { name: "Owner", email: `owner-${Date.now()}@alexrivera.example`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: owner.id, businessId, role: "OWNER" } });
    const mate = await ingestInboundMessage({ businessId, channel: "EMAIL", senderName: "Dana", senderHandle: "dana@alexrivera.example", clientEmail: "dana@alexrivera.example", subject: "Saturday coverage", body: "Can you cover the 2pm on Saturday? I'm double-booked.", providerMessageId: "internal-1" });
    expect(mate.category).toBe("INTERNAL");
    expect(mate.client).toBeNull();
    await prisma.user.delete({ where: { id: owner.id } });
  });
});
