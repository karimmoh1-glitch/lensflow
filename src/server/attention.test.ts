import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { subDays, subHours, addHours, addDays, startOfDay, setHours } from "date-fns";
import { prisma } from "@/lib/db";
import { getAttention } from "./attention";

let a: string, b: string;
const now = new Date();
// Anchored to the calendar, not to a fixed offset: "tomorrow" must not depend on the hour the suite runs.
const tomorrowAt10 = setHours(startOfDay(addDays(now, 1)), 10);
async function person(businessId: string, name: string, opts: { inbound: Date | null; responded: Date | null; followUp?: Date | null; status?: "NEW" | "CONTACTED" | "BOOKED"; archived?: boolean; category?: "PRIORITY" | "PROMOTIONAL"; service?: boolean }) {
  const client = await prisma.client.create({ data: { businessId, name, email: `${name.toLowerCase().replace(/\s+/g, "-")}@attention-fixture.invalid` } });
  const conv = await prisma.conversation.create({ data: { businessId, clientId: client.id, channel: "EMAIL", archived: opts.archived ?? false, category: opts.category ?? "PRIORITY", lastMessageAt: opts.inbound ?? now } });
  const service = opts.service ? await prisma.service.create({ data: { businessId, name: "Portrait session", priceCents: 20000, durationMins: 60 } }) : null;
  const lead = await prisma.lead.create({ data: { businessId, clientId: client.id, conversationId: conv.id, extractedName: name, status: opts.status ?? "NEW", lastInboundAt: opts.inbound, respondedAt: opts.responded, followUpAt: opts.followUp ?? null, serviceId: service?.id, requestedDateText: opts.service ? "June 14" : null } });
  return { client, conv, lead, service };
}

beforeAll(async () => {
  a = (await prisma.business.create({ data: { name: "Attention A", handle: `attention-a-${Date.now()}` } })).id;
  b = (await prisma.business.create({ data: { name: "Attention B", handle: `attention-b-${Date.now()}` } })).id;
});
afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: { in: [a, b] } } });
});

describe("getAttention", () => {
  it("surfaces exactly the right people, in the right order, with the reason", async () => {
    await person(a, "Old Wait", { inbound: subDays(now, 2), responded: null, service: true });
    await person(a, "New Wait", { inbound: subHours(now, 1), responded: null });
    await person(a, "Replied Recently", { inbound: subDays(now, 3), responded: subDays(now, 1), status: "CONTACTED" });
    await person(a, "Gone Quiet", { inbound: subDays(now, 9), responded: subDays(now, 5), status: "CONTACTED" });
    await person(a, "Reminder Due", { inbound: subDays(now, 9), responded: subDays(now, 8), followUp: subHours(now, 2), status: "CONTACTED" });
    await person(a, "Reminder Later", { inbound: subDays(now, 9), responded: subDays(now, 8), followUp: addDays(now, 2), status: "CONTACTED" });
    await person(a, "Already Booked", { inbound: subHours(now, 1), responded: null, status: "BOOKED" });
    await person(a, "Archived", { inbound: subHours(now, 1), responded: null, archived: true });
    await person(a, "Newsletter", { inbound: subHours(now, 1), responded: null, category: "PROMOTIONAL" });
    const booked = await person(a, "Booked Soon", { inbound: subDays(now, 9), responded: subDays(now, 8), status: "CONTACTED" });
    await prisma.booking.create({ data: { businessId: a, clientId: booked.client.id, serviceId: (await prisma.service.create({ data: { businessId: a, name: "Wedding", priceCents: 100000, durationMins: 480 } })).id, startAt: tomorrowAt10, endAt: addHours(tomorrowAt10, 8), status: "BOOKED", totalCents: 100000 } });
    // The other tenant: never visible here.
    await person(b, "Other Tenant", { inbound: subHours(now, 1), responded: null });

    const rows = await getAttention(a, now);
    expect(rows.map((r) => [r.name, r.item.kind])).toEqual([
      ["Old Wait", "waiting_reply"],
      ["New Wait", "waiting_reply"],
      ["Reminder Due", "follow_up_due"],
      ["Booked Soon", "confirm_booking"],
      ["Gone Quiet", "follow_up_suggested"],
    ]);
    expect(rows[0].detail).toBe("Asked about Portrait session for June 14");
    expect(rows[0].item.why).toMatch(/They asked about a booking/);
    expect(rows[3].item.why).toMatch(/Wedding is tomorrow and isn't confirmed yet/);
    expect(rows.find((r) => r.name === "Booked Soon")?.item.kind).toBe("confirm_booking");
    expect(rows.some((r) => r.name === "Other Tenant")).toBe(false);
    expect((await getAttention(b, now)).map((r) => r.name)).toEqual(["Other Tenant"]);
  });
});
