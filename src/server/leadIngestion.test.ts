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
