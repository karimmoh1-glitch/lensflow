import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Server actions call revalidatePath/redirect, which depend on Next's request-scoped
// render context — unavailable when calling the action function directly outside Next's
// runtime. Mocked as no-ops so the actual authorization logic (the thing under test) runs
// for real against a real database.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { prisma } from "@/lib/db";
import { advanceBookingStatus, cancelBooking, rescheduleBooking, getRescheduleSlots } from "./bookings";
import { checkLeadAvailability, bookLead } from "./leads";

/**
 * Real IDOR regression test: Business B's authenticated owner must never be able to act on
 * Business A's booking, even knowing its id. Every booking action resolves the acting
 * business from the session (never a client-supplied businessId) and scopes its lookup with
 * `WHERE id = ? AND businessId = ?` — if that scoping is ever dropped, this test starts
 * failing instead of silently allowing cross-tenant access.
 */
describe("tenant isolation — bookings", () => {
  let aId: string;
  let bId: string;
  let bookingAId: string;
  let ownerBSession: { userId: string; activeBusinessId: string };

  beforeAll(async () => {
    const stamp = Date.now();
    const a = await prisma.business.create({ data: { name: "Isolation A", handle: `iso-a-${stamp}`, timezone: "UTC" } });
    const b = await prisma.business.create({ data: { name: "Isolation B", handle: `iso-b-${stamp}`, timezone: "UTC" } });
    aId = a.id;
    bId = b.id;
    const ownerB = await prisma.user.create({ data: { name: "Owner B", email: `iso-owner-b-${stamp}@example.com`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: ownerB.id, businessId: bId, role: "OWNER" } });
    ownerBSession = { userId: ownerB.id, activeBusinessId: bId };
    const service = await prisma.service.create({ data: { businessId: aId, name: "Session", priceCents: 30000, durationMins: 60 } });
    const client = await prisma.client.create({ data: { businessId: aId, name: "A Client", email: `iso-client-${stamp}@example.com` } });
    const start = new Date(Date.now() + 3 * 86_400_000);
    const booking = await prisma.booking.create({ data: { businessId: aId, clientId: client.id, serviceId: service.id, startAt: start, endAt: new Date(start.getTime() + 3_600_000), status: "BOOKED", totalCents: 30000 } });
    bookingAId = booking.id;
  });

  afterAll(async () => {
    await prisma.business.delete({ where: { id: aId } });
    await prisma.business.delete({ where: { id: bId } });
    await prisma.user.deleteMany({ where: { email: { contains: "iso-owner-b-" } } });
  });

  it("booking from a thread never uses another business's service, and pays the service's price", async () => {
    // Owner B books their own inquiry but passes Business A's service id (the picker's value
    // is client-supplied): the service must not be found, and nothing may be created.
    const serviceA = await prisma.service.findFirstOrThrow({ where: { businessId: aId } });
    const clientB = await prisma.client.create({ data: { businessId: bId, name: "B Client" } });
    const conv = await prisma.conversation.create({ data: { businessId: bId, clientId: clientB.id, channel: "SMS", externalHandle: "+15550001111", category: "PRIORITY" } });
    const leadB = await prisma.lead.create({ data: { businessId: bId, clientId: clientB.id, conversationId: conv.id, extractedName: "B Client", status: "NEW" } });
    const start = new Date(Date.now() + 4 * 86_400_000);
    await expect(bookLead(leadB.id, start.toISOString(), serviceA.id, ownerBSession)).rejects.toThrow(/Pick a service/);
    expect(await prisma.booking.count({ where: { businessId: bId } })).toBe(0);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadB.id } })).status).toBe("NEW");
    // A lead in Business A cannot be booked by Business B at all.
    const leadA = await prisma.lead.create({ data: { businessId: aId, extractedName: "A Lead", status: "NEW", clientId: (await prisma.client.findFirstOrThrow({ where: { businessId: aId } })).id } });
    await expect(bookLead(leadA.id, start.toISOString(), null, ownerBSession)).rejects.toThrow(/not found/);
    await expect(checkLeadAvailability(leadA.id, "2026-10-01", null, ownerBSession)).rejects.toThrow(/not found/);
    // With their own service it books, at that service's price, and the lead remembers the service.
    const serviceB = await prisma.service.create({ data: { businessId: bId, name: "B Session", priceCents: 12300, durationMins: 30 } });
    await prisma.availability.create({ data: { businessId: bId, weekday: start.getUTCDay(), startMin: 0, endMin: 24 * 60 } });
    const at = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 10, 0));
    const { bookingId } = await bookLead(leadB.id, at.toISOString(), serviceB.id, ownerBSession);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.businessId).toBe(bId);
    expect(booking.totalCents).toBe(12300);
    expect(booking.conversationId).toBe(conv.id);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadB.id } })).serviceId).toBe(serviceB.id);
    // Booking it twice is refused.
    await expect(bookLead(leadB.id, at.toISOString(), serviceB.id, ownerBSession)).rejects.toThrow(/already booked/);
  });

  it("Business B's owner cannot advance Business A's booking", async () => {
    await expect(advanceBookingStatus(bookingAId, "CONFIRMED", ownerBSession)).rejects.toThrow();
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingAId } })).status).toBe("BOOKED");
  });

  it("Business B's owner cannot cancel or reschedule Business A's booking", async () => {
    const canceled = await cancelBooking(bookingAId, ownerBSession);
    expect(canceled.ok).toBe(false);
    const moved = await rescheduleBooking(bookingAId, new Date(Date.now() + 5 * 86_400_000).toISOString(), {}, ownerBSession);
    expect(moved.ok).toBe(false);
    await expect(getRescheduleSlots(bookingAId, new Date().toISOString().slice(0, 10), ownerBSession)).rejects.toThrow();
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingAId } })).status).toBe("BOOKED");
  });

  it("an anonymous caller is refused outright", async () => {
    await expect(advanceBookingStatus(bookingAId, "CONFIRMED", null)).rejects.toThrow();
    await expect(checkLeadAvailability("nope", "2026-10-01")).rejects.toThrow();
  });
});
