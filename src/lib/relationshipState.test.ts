import { describe, it, expect } from "vitest";
import { readRelationship } from "./relationshipState";

const now = new Date("2026-09-03T18:00:00Z");
const h = (n: number) => new Date(now.getTime() - n * 3_600_000);
const base = { upcomingBooking: null, lastCompletedBooking: null, outstandingCents: 0, paidCents: 0, now };

describe("readRelationship", () => {
  it("a fresh inquiry with no reply is waiting on you", () => {
    const r = readRelationship({ ...base, relationship: "LEAD", lead: { status: "NEW", respondedAt: null, lastInboundAt: h(3), createdAt: h(3), hasService: true, hasDate: true }, lastInbound: h(3), lastOutbound: null });
    expect(r.state).toBe("NEW_INQUIRY");
    expect(r.nextAction?.label).toBe("Reply");
    expect(r.standing).toContain("3 hours ago");
  });
  it("after you reply it is contacted, then follow-up after a week of silence", () => {
    const c = readRelationship({ ...base, relationship: "LEAD", lead: null, lastInbound: h(30), lastOutbound: h(20) });
    expect(c.state).toBe("CONTACTED");
    const f = readRelationship({ ...base, relationship: "LEAD", lead: null, lastInbound: h(300), lastOutbound: h(200) });
    expect(f.state).toBe("FOLLOW_UP");
  });
  it("an upcoming booking with a balance owed asks you to collect", () => {
    const r = readRelationship({ ...base, relationship: "CUSTOMER", lastInbound: h(50), lastOutbound: h(40), upcomingBooking: { startAt: h(-72), label: "Wedding consultation · Sep 12", status: "CONFIRMED" }, outstandingCents: 120000, paidCents: 30000 });
    expect(r.state).toBe("BOOKED");
    expect(r.nextAction?.label).toBe("Collect $1,200");
  });
  it("a customer who wrote last is waiting on you; a quiet customer is dormant after 90 days", () => {
    const w = readRelationship({ ...base, relationship: "CUSTOMER", lastInbound: h(20), lastOutbound: h(48), paidCents: 240000 });
    expect(w.state).toBe("WAITING_ON_YOU");
    const d = readRelationship({ ...base, relationship: "CUSTOMER", lastInbound: h(24 * 120), lastOutbound: h(24 * 110), paidCents: 240000 });
    expect(d.state).toBe("DORMANT");
  });
  it("a contact is just a contact", () => {
    expect(readRelationship({ ...base, relationship: "CONTACT", lastInbound: h(1), lastOutbound: null }).state).toBe("CONTACT");
  });
});
