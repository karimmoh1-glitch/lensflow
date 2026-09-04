import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { fireAutomationEvent, runScheduledAutomations, interpolate } from "./automationRunner";
import { addHours } from "date-fns";

/**
 * The runner against a real database. No email provider is configured in tests, so the
 * honest result is "not_configured" with a NOT_DELIVERED message in the thread — never
 * "sent". What matters here is the contract: one execution per (automation, target), the
 * message written into the client's thread with its true status, an entitlement check at
 * run time, and the scheduled sweep finding what's due.
 */
describe("automation runner", () => {
  let businessId: string;
  let clientId: string;
  let bookingId: string;
  let automationId: string;

  beforeAll(async () => {
    const business = await prisma.business.create({ data: { name: "Runner Fixture", handle: `runner-fixture-${Date.now()}`, planTier: "PRO", billingStatus: "ACTIVE" } });
    businessId = business.id;
    const service = await prisma.service.create({ data: { businessId, name: "Brand Session", priceCents: 35000, durationMins: 90 } });
    const client = await prisma.client.create({ data: { businessId, name: "Sarah Kim", email: "sarah@runner.example", relationship: "CUSTOMER" } });
    clientId = client.id;
    const conv = await prisma.conversation.create({ data: { businessId, clientId, channel: "EMAIL", externalHandle: "sarah@runner.example", lastMessageAt: new Date() } });
    const booking = await prisma.booking.create({ data: { businessId, clientId, serviceId: service.id, conversationId: conv.id, startAt: addHours(new Date(), 20), endAt: addHours(new Date(), 21), status: "BOOKED", totalCents: 35000, depositCents: 10500 } });
    bookingId = booking.id;
    const automation = await prisma.automation.create({ data: { businessId, name: "Booking confirmation", trigger: "BOOKING_CREATED", offsetHours: 0, action: "SEND_CONFIRMATION", messageTemplate: "Thanks for booking with {{business}}, {{name}}! {{service}} on {{date}} at {{time}}." } });
    automationId = automation.id;
  });

  afterAll(async () => {
    await prisma.business.delete({ where: { id: businessId } });
  });

  it("interpolates templates without leaving placeholders behind", () => {
    expect(interpolate("Hi {{name}}, {{service}} on {{date}}{{missing}}.", { name: "Sarah", service: "Brand Session", date: "Friday" })).toBe("Hi Sarah, Brand Session on Friday.");
  });

  it("runs once per target, writes the message into the thread, and never twice", async () => {
    const first = await fireAutomationEvent({ businessId, trigger: "BOOKING_CREATED", targetType: "booking", targetId: bookingId });
    expect(first.ran).toBe(1);
    const execs = await prisma.automationExecution.findMany({ where: { automationId } });
    expect(execs).toHaveLength(1);
    expect(execs[0].result).toBe("not_configured");
    const outbound = await prisma.message.findMany({ where: { direction: "OUTBOUND", conversation: { businessId, clientId } } });
    expect(outbound).toHaveLength(1);
    expect(outbound[0].status).toBe("NOT_DELIVERED");
    expect(outbound[0].body).toContain("Thanks for booking with Runner Fixture, Sarah!");
    expect(outbound[0].body).toContain("Brand Session on");

    // A not_configured run is retried (the channel may exist next time) but a sent or
    // skipped one never is — simulate a sent one and fire again.
    await prisma.automationExecution.updateMany({ where: { automationId }, data: { result: "sent" } });
    await fireAutomationEvent({ businessId, trigger: "BOOKING_CREATED", targetType: "booking", targetId: bookingId });
    expect(await prisma.automationExecution.count({ where: { automationId } })).toBe(1);
    expect(await prisma.message.count({ where: { direction: "OUTBOUND", conversation: { businessId, clientId } } })).toBe(1);
  });

  it("the scheduled sweep finds a shoot due within the reminder window", async () => {
    const reminder = await prisma.automation.create({ data: { businessId, name: "Shoot reminder", trigger: "DAYS_BEFORE_SHOOT", offsetHours: 24, action: "SEND_REMINDER", messageTemplate: "Reminder: {{service}} is {{date}} at {{time}}." } });
    const summary = await runScheduledAutomations(new Date());
    expect(summary.not_configured).toBeGreaterThanOrEqual(1);
    const exec = await prisma.automationExecution.findFirst({ where: { automationId: reminder.id, targetId: bookingId } });
    expect(exec?.result).toBe("not_configured");
    expect(summary.failed).toBe(0);
    // Once it has actually gone out, the sweep never sends it again.
    await prisma.automationExecution.updateMany({ where: { automationId: reminder.id }, data: { result: "sent" } });
    await runScheduledAutomations(new Date());
    expect(await prisma.automationExecution.count({ where: { automationId: reminder.id } })).toBe(1);
  });

  it("stops running for a business whose plan lapsed — server-side, not just the toggle", async () => {
    await prisma.business.update({ where: { id: businessId }, data: { billingStatus: "CANCELED" } });
    const lapsed = await prisma.automation.create({ data: { businessId, name: "Thank-you", trigger: "SHOOT_COMPLETED", offsetHours: 0, action: "SEND_THANK_YOU", messageTemplate: "Thank you!" } });
    await fireAutomationEvent({ businessId, trigger: "SHOOT_COMPLETED", targetType: "booking", targetId: bookingId });
    const exec = await prisma.automationExecution.findFirst({ where: { automationId: lapsed.id } });
    expect(exec?.result).toBe("skipped");
    expect(await prisma.message.count({ where: { direction: "OUTBOUND", conversation: { businessId, clientId } } })).toBe(2);
  });
});
