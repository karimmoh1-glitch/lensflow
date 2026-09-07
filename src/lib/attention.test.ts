import { describe, it, expect } from "vitest";
import { subDays, subHours, addDays, addHours } from "date-fns";
import { leadAttention, bookingAttention, sortAttention, type LeadFacts } from "./attention";

const now = new Date("2026-09-07T15:00:00Z");
const base: LeadFacts = { status: "NEW", respondedAt: null, lastInboundAt: subHours(now, 2), followUpAt: null, createdAt: subHours(now, 2), hasService: false, hasDate: false, hidden: false, hasUpcomingBooking: false };

describe("leadAttention — who needs you, and why", () => {
  it("a new inquiry with no reply is waiting", () => {
    const a = leadAttention(base, now);
    expect(a?.kind).toBe("waiting_reply");
    expect(a?.why).toBe("They wrote today; nothing has gone back yet.");
  });
  it("names the booking ask when there is one", () => {
    expect(leadAttention({ ...base, hasDate: true }, now)?.why).toMatch(/They asked about a booking\.$/);
  });
  it("a reply settles it", () => {
    expect(leadAttention({ ...base, status: "CONTACTED", respondedAt: subHours(now, 1) }, now)).toBeNull();
  });
  it("their reply after yours re-opens it — never a false negative", () => {
    const a = leadAttention({ ...base, status: "CONTACTED", respondedAt: subDays(now, 2), lastInboundAt: subDays(now, 1) }, now);
    expect(a?.kind).toBe("waiting_reply");
    expect(a?.why).toMatch(/yesterday/);
  });
  it("silence after your reply becomes a follow-up only after three days", () => {
    const replied = { ...base, status: "CONTACTED", lastInboundAt: subDays(now, 5), respondedAt: subDays(now, 2) };
    expect(leadAttention(replied, now)).toBeNull();
    const a = leadAttention({ ...replied, respondedAt: subDays(now, 3) }, now);
    expect(a?.kind).toBe("follow_up_suggested");
    expect(a?.why).toBe("You replied 3 days ago; they haven't answered.");
  });
  it("no nudge when a booking is already coming up, or when the owner planned a follow-up for later", () => {
    const replied = { ...base, status: "CONTACTED", lastInboundAt: subDays(now, 9), respondedAt: subDays(now, 8) };
    expect(leadAttention({ ...replied, hasUpcomingBooking: true }, now)).toBeNull();
    expect(leadAttention({ ...replied, followUpAt: addDays(now, 2) }, now)).toBeNull();
  });
  it("a reminder that has come due surfaces, with the date it was set for", () => {
    const a = leadAttention({ ...base, status: "CONTACTED", lastInboundAt: subDays(now, 9), respondedAt: subDays(now, 8), followUpAt: subHours(now, 3) }, now);
    expect(a?.kind).toBe("follow_up_due");
    expect(a?.why).toBe("You asked to be reminded today.");
  });
  it("their message outranks a due reminder", () => {
    expect(leadAttention({ ...base, followUpAt: subHours(now, 1) }, now)?.kind).toBe("waiting_reply");
  });
  it("booked, lost, cold, archived or non-person threads never surface", () => {
    for (const status of ["BOOKED", "LOST", "COLD"]) expect(leadAttention({ ...base, status }, now)).toBeNull();
    expect(leadAttention({ ...base, hidden: true }, now)).toBeNull();
  });
  it("nothing inbound and nothing sent is not attention", () => {
    expect(leadAttention({ ...base, lastInboundAt: null }, now)).toBeNull();
  });
});

describe("bookingAttention", () => {
  it("an unconfirmed booking within three days needs confirming", () => {
    const a = bookingAttention({ status: "BOOKED", startAt: addHours(now, 20), label: "Sarah · Portrait session" }, now);
    expect(a?.kind).toBe("confirm_booking");
    expect(a?.why).toBe("Sarah · Portrait session is tomorrow and isn't confirmed yet.");
  });
  it("confirmed, past, or far-off bookings do not", () => {
    expect(bookingAttention({ status: "CONFIRMED", startAt: addHours(now, 20), label: "x" }, now)).toBeNull();
    expect(bookingAttention({ status: "BOOKED", startAt: subHours(now, 2), label: "x" }, now)).toBeNull();
    expect(bookingAttention({ status: "BOOKED", startAt: addDays(now, 5), label: "x" }, now)).toBeNull();
  });
});

describe("sortAttention", () => {
  it("replies first, oldest wait first", () => {
    const rows = [
      { id: "nudge", item: leadAttention({ ...base, status: "CONTACTED", lastInboundAt: subDays(now, 9), respondedAt: subDays(now, 5) }, now)! },
      { id: "recent", item: leadAttention({ ...base, lastInboundAt: subHours(now, 1) }, now)! },
      { id: "old", item: leadAttention({ ...base, lastInboundAt: subDays(now, 2) }, now)! },
    ];
    expect(sortAttention(rows).map((r) => r.id)).toEqual(["old", "recent", "nudge"]);
  });
});
