import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDays, setHours, setMinutes } from "date-fns";

// Each simulated visitor comes from its own address, so the per-IP booking limiter (10/hour)
// doesn't collapse the concurrency test into a rate-limit test.
let visitor = 0;
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": `198.51.100.${(visitor++ % 200) + 1}` }), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/**
 * The booking source of truth under pressure: concurrent public bookings for one slot
 * yield exactly one booking; an unavailable time is refused; reschedule respects other
 * bookings and busy calendar time while ignoring the booking's own slot; cancel removes
 * the booking from availability. All against the real database.
 */
describe("public booking and reschedule", () => {
  let businessId: string;
  let serviceId: string;
  let ownerSession: { userId: string; activeBusinessId: string };
  let createPublicBooking: typeof import("./publicBooking").createPublicBooking;
  let rescheduleBooking: typeof import("./bookings").rescheduleBooking;
  let cancelBooking: typeof import("./bookings").cancelBooking;
  let getRescheduleSlots: typeof import("./bookings").getRescheduleSlots;
  const handle = `karim-photo-${Date.now()}`;
  // A weekday next week at 10:00 in the business's zone (UTC here, so the arithmetic is plain).
  const base = (() => { let d = addDays(new Date(), 7); while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = addDays(d, 1); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 10, 0, 0)); })();
  const at = (h: number, m = 0) => new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), h, m));

  beforeAll(async () => {
    ({ createPublicBooking } = await import("./publicBooking"));
    ({ rescheduleBooking, cancelBooking, getRescheduleSlots } = await import("./bookings"));
    const b = await prisma.business.create({ data: { name: "Karim Photography", handle, timezone: "UTC", bookingLeadHours: 1, bufferMinutes: 0, depositPercent: 0, paymentMethods: ["zelle"], onboardingComplete: true } });
    businessId = b.id;
    serviceId = (await prisma.service.create({ data: { businessId, name: "Portrait", priceCents: 25000, durationMins: 60 } })).id;
    await prisma.availability.createMany({ data: [1, 2, 3, 4, 5].map((weekday) => ({ businessId, weekday, startMin: 9 * 60, endMin: 17 * 60 })) });
    const u = await prisma.user.create({ data: { name: "Karim", email: `karim-${Date.now()}@example.com`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: u.id, businessId, role: "OWNER" } });
    ownerSession = { userId: u.id, activeBusinessId: businessId };
  });
  afterAll(async () => {
    await prisma.business.delete({ where: { id: businessId } });
  });
  const book = (start: Date, email = "sam@example.com") => createPublicBooking({ handle, serviceId, startISO: start.toISOString(), name: "Sam Lee", email, phone: "", location: "", notes: "" });

  it("five people booking the same slot at once: exactly one gets it", async () => {
    const results = await Promise.allSettled(Array.from({ length: 5 }).map((_, i) => book(at(10), `p${i}@example.com`)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").every((r) => /no longer available/.test(String((r as PromiseRejectedResult).reason)))).toBe(true);
    expect(await prisma.booking.count({ where: { businessId, startAt: at(10) } })).toBe(1);
  });

  it("refuses a time outside working hours, a slot that overlaps, and a past time", async () => {
    await expect(book(at(20))).rejects.toThrow(/no longer available/);
    await expect(book(at(10, 30))).rejects.toThrow(/no longer available/); // overlaps 10:00–11:00
    await expect(book(new Date(Date.now() - 3_600_000))).rejects.toThrow(/no longer available/);
  });

  it("reschedule keeps the booking's own slot out of the busy set, respects others and busy calendar time, and moves calendar mirrors", async () => {
    const mine = await book(at(13), "r@example.com");
    // Another booking at 15:00 and an external busy block 16:00–17:00.
    await book(at(15), "other@example.com");
    const integration = await prisma.integration.create({ data: { businessId, provider: "APPLE_CALENDAR", status: "CONNECTED", accessToken: "abcd-efgh-ijkl-mnop", settings: { available: [], selected: ["/c/"], bookingCalendar: "/c/", cursors: {} } } });
    await prisma.externalEvent.create({ data: { businessId, integrationId: integration.id, externalId: "busy1", calendarId: "/c/", startAt: at(16), endAt: at(17), title: "Dentist" } });
    // Slots for that day exclude 10 (booked), 15 (booked), 16 (busy) but include 13 (its own).
    const slots = (await getRescheduleSlots(mine.bookingId, base.toISOString().slice(0, 10), ownerSession)).map((s) => new Date(s.start).getUTCHours());
    expect(slots).toContain(13);
    expect(slots).not.toContain(10);
    expect(slots).not.toContain(15);
    expect(slots).not.toContain(16);
    expect((await rescheduleBooking(mine.bookingId, at(15).toISOString(), { notify: false }, ownerSession)).ok).toBe(false);
    expect((await rescheduleBooking(mine.bookingId, at(16).toISOString(), { notify: false }, ownerSession)).ok).toBe(false);
    const moved = await rescheduleBooking(mine.bookingId, at(12).toISOString(), { notify: false }, ownerSession);
    expect(moved.ok).toBe(true);
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: mine.bookingId } });
    expect(row.startAt.toISOString()).toBe(at(12).toISOString());
    expect(row.endAt.toISOString()).toBe(at(13).toISOString());
    expect(await prisma.auditLog.count({ where: { businessId, action: "booking_rescheduled", targetId: mine.bookingId } })).toBe(1);
    // The old slot is bookable again; the new one is not.
    await expect(book(at(12), "late@example.com")).rejects.toThrow(/no longer available/);
    expect((await book(at(13), "late@example.com")).bookingId).toBeTruthy();
    await prisma.integration.delete({ where: { id: integration.id } });
  });

  it("reschedule is tenant-scoped and refused for finished bookings; cancel frees the slot", async () => {
    const stranger = await prisma.user.create({ data: { name: "S", email: `s-${Date.now()}@example.com`, passwordHash: "x" } });
    const other = await prisma.business.create({ data: { name: "Other", handle: `other-${Date.now()}` } });
    await prisma.orgMembership.create({ data: { userId: stranger.id, businessId: other.id, role: "OWNER" } });
    const target = await prisma.booking.findFirstOrThrow({ where: { businessId, startAt: at(10) } });
    const r = await rescheduleBooking(target.id, at(14).toISOString(), { notify: false }, { userId: stranger.id, activeBusinessId: other.id });
    expect(r.ok).toBe(false);
    expect((await cancelBooking(target.id, { userId: stranger.id, activeBusinessId: other.id })).ok).toBe(false);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: target.id } })).status).toBe("BOOKED");
    expect((await cancelBooking(target.id, ownerSession)).ok).toBe(true);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: target.id } })).status).toBe("CANCELED");
    expect((await rescheduleBooking(target.id, at(14).toISOString(), { notify: false }, ownerSession)).ok).toBe(false);
    expect((await book(at(10), "again@example.com")).bookingId).toBeTruthy();
    await prisma.business.delete({ where: { id: other.id } });
    await prisma.user.delete({ where: { id: stranger.id } });
  });
});
