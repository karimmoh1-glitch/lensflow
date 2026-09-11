import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";

const ip = { value: "198.51.100.77" };
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": ip.value }), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

import { getSlotsForDate } from "@/app/actions/publicBooking";

/**
 * The public booking page is unauthenticated by design, but it answers from the owner's real
 * calendar. Anything it returns, anyone can read, so it has to be metered and it must not
 * turn a malformed input into a server error.
 */
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

describe("public availability", () => {
  const ids: string[] = [];
  let handle: string;
  let serviceId: string;

  beforeAll(async () => {
    const s = stamp();
    handle = `pub-${s}`;
    const business = await prisma.business.create({ data: { name: "Public Co", handle, timezone: "America/Chicago" } });
    ids.push(business.id);
    serviceId = (await prisma.service.create({ data: { businessId: business.id, name: "Consultation", priceCents: 10_000, durationMins: 60 } })).id;
    // Open every weekday so "tomorrow" always has real slots, whatever day the suite runs.
    await prisma.availability.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ businessId: business.id, weekday, startMin: 9 * 60, endMin: 17 * 60 })),
    });
  });
  afterAll(async () => { await prisma.business.deleteMany({ where: { id: { in: ids } } }); });

  /** Far enough out to clear any booking lead time, close enough to be a real request. */
  const soon = () => new Date(Date.now() + 5 * 86_400_000).toISOString();

  it("an unparseable or absurd date answers empty rather than erroring", async () => {
    ip.value = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    expect(await getSlotsForDate(handle, "not a date", serviceId)).toEqual([]);
    expect(await getSlotsForDate(handle, "", serviceId)).toEqual([]);
    // Far past and far future are not booking requests, and must not become calendar reads.
    expect(await getSlotsForDate(handle, new Date(Date.now() - 40 * 86_400_000).toISOString(), serviceId)).toEqual([]);
    expect(await getSlotsForDate(handle, new Date(Date.now() + 900 * 86_400_000).toISOString(), serviceId)).toEqual([]);
  });

  it("a service from another business is not quotable through this handle", async () => {
    ip.value = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    const other = await prisma.business.create({ data: { name: "Other Pub", handle: `pub2-${stamp()}`, timezone: "America/Chicago" } });
    ids.push(other.id);
    const theirService = await prisma.service.create({ data: { businessId: other.id, name: "Theirs", priceCents: 1, durationMins: 30 } });
    expect(await getSlotsForDate(handle, soon(), theirService.id)).toEqual([]);
    expect(await getSlotsForDate("no-such-handle", soon(), serviceId)).toEqual([]);
  });

  it("is metered, so it cannot be used to read a business's calendar shape without limit", async () => {
    ip.value = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    let answered = 0;
    for (let i = 0; i < 130; i++) {
      const slots = await getSlotsForDate(handle, soon(), serviceId);
      if (slots.length > 0) answered++;
    }
    // The limit is 120 an hour; a caller cannot keep reading past it.
    expect(answered).toBeLessThanOrEqual(120);
    expect(answered).toBeGreaterThan(0);
  });
});
