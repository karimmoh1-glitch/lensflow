import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { addDays, addHours } from "date-fns";
import { prisma } from "@/lib/db";
import { fireAutomationEvent } from "./automationRunner";
import { ingestInboundMessage } from "./leadIngestion";
import { rescheduleBooking } from "@/app/actions/bookings";
import { inviteTeammate } from "@/app/actions/invitations";

/**
 * The same event arriving several times at once — a provider retrying a webhook, two
 * serverless instances handling one booking, two staff rescheduling into the same slot —
 * must leave the database in exactly one consistent state. These run real concurrent
 * calls against the real database.
 */
describe("concurrency", () => {
  let businessId: string;
  let clientId: string;
  let serviceId: string;
  let session: { userId: string; activeBusinessId: string };
  const day = addDays(new Date(), 10);
  const at = (h: number, m = 0) => new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m));

  beforeAll(async () => {
    const stamp = Date.now();
    const business = await prisma.business.create({ data: { name: "Concurrency Fixture", handle: `conc-${stamp}`, timezone: "UTC", planTier: "PRO", billingStatus: "ACTIVE", bookingLeadHours: 0, bufferMinutes: 0 } });
    businessId = business.id;
    const owner = await prisma.user.create({ data: { name: "Owner", email: `conc-owner-${stamp}@conc-fixture.invalid`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: owner.id, businessId, role: "OWNER" } });
    session = { userId: owner.id, activeBusinessId: businessId };
    await prisma.availability.create({ data: { businessId, weekday: day.getUTCDay(), startMin: 0, endMin: 24 * 60 } });
    const service = await prisma.service.create({ data: { businessId, name: "Session", priceCents: 10000, durationMins: 60 } });
    serviceId = service.id;
    const client = await prisma.client.create({ data: { businessId, name: "Sam Lee", email: `conc-client-${stamp}@conc-fixture.invalid`, relationship: "CUSTOMER" } });
    clientId = client.id;
  });

  afterAll(async () => {
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.user.deleteMany({ where: { email: { contains: "@conc-fixture.invalid" } } });
  });

  it("one booking event firing five times at once sends one confirmation", async () => {
    const conv = await prisma.conversation.create({ data: { businessId, clientId, channel: "EMAIL", externalHandle: "sam@example.com", category: "PRIORITY", lastMessageAt: new Date() } });
    const booking = await prisma.booking.create({ data: { businessId, clientId, serviceId, conversationId: conv.id, startAt: at(9), endAt: at(10), status: "BOOKED", totalCents: 10000 } });
    const automation = await prisma.automation.create({ data: { businessId, name: "Confirm", trigger: "BOOKING_CREATED", offsetHours: 0, action: "SEND_CONFIRMATION", messageTemplate: "Booked, {{name}}." } });
    await Promise.all(Array.from({ length: 5 }).map(() => fireAutomationEvent({ businessId, trigger: "BOOKING_CREATED", targetType: "booking", targetId: booking.id })));
    const written = await prisma.message.count({ where: { conversationId: conv.id, direction: "OUTBOUND" } });
    expect(written).toBe(1);
    const runs = await prisma.automationExecution.findMany({ where: { automationId: automation.id, targetId: booking.id } });
    expect(runs.filter((r) => r.result !== "skipped")).toHaveLength(1);
  });

  it("five reschedules into one free slot: exactly one lands, the rest are told the time is gone", async () => {
    const bookings = await Promise.all(
      Array.from({ length: 5 }).map((_, i) => prisma.booking.create({ data: { businessId, clientId, serviceId, startAt: at(11 + i), endAt: at(12 + i), status: "CONFIRMED", totalCents: 10000 } }))
    );
    const target = at(20);
    const results = await Promise.all(bookings.map((b) => rescheduleBooking(b.id, target.toISOString(), { notify: false }, session)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).every((r) => /isn't available|no longer available/i.test((r as { error: string }).error))).toBe(true);
    expect(await prisma.booking.count({ where: { businessId, startAt: target, status: { not: "CANCELED" } } })).toBe(1);
  });

  it("five teammate invitations at once never exceed the plan's seats", async () => {
    // Business: 10 seats. Owner takes one; fill to 9 with pending invitations, then fire 5 at once.
    await prisma.business.update({ where: { id: businessId }, data: { planTier: "BUSINESS" } });
    for (let i = 0; i < 8; i++) await prisma.invitation.create({ data: { businessId, email: `pending-${i}@example.com`, role: "PHOTOGRAPHER", token: `tok-${businessId}-${i}`, invitedByUserId: session.userId, expiresAt: addHours(new Date(), 48) } });
    const form = (i: number) => { const f = new FormData(); f.set("name", `Person ${i}`); f.set("email", `burst-${i}-${businessId}@example.com`); return f; };
    const results = await Promise.all(Array.from({ length: 5 }).map((_, i) => inviteTeammate(form(i), session)));
    const accepted = results.filter((r) => r.link).length;
    const seats = await prisma.orgMembership.count({ where: { businessId, role: { not: "CLIENT" }, status: "ACTIVE" } });
    const pending = await prisma.invitation.count({ where: { businessId, role: { not: "CLIENT" }, status: "PENDING" } });
    expect(seats + pending).toBeLessThanOrEqual(10);
    expect(accepted).toBe(1);
    expect(results.filter((r) => r.error).every((r) => /includes 10 team members/.test(r.error!))).toBe(true);
    await prisma.business.update({ where: { id: businessId }, data: { planTier: "PRO" } });
  });

  it("the same inbound message delivered five times at once becomes one conversation with one message", async () => {
    const providerMessageId = `SM_conc_${Date.now()}`;
    const results = await Promise.allSettled(
      Array.from({ length: 5 }).map(() => ingestInboundMessage({ businessId, channel: "SMS", senderName: "+15125550100", senderHandle: "+15125550100", body: "Anything open next week?", providerMessageId }))
    );
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    const convs = await prisma.conversation.findMany({ where: { businessId, channel: "SMS", externalHandle: "+15125550100" } });
    expect(convs).toHaveLength(1);
    expect(await prisma.message.count({ where: { conversationId: convs[0].id } })).toBe(1);
    expect(await prisma.client.count({ where: { businessId, phone: "+15125550100" } })).toBe(1);
  });
});
