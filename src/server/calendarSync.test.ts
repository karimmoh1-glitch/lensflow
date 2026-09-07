import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { syncCalendarIn, pushBookingToCalendars } from "./calendarSync";
import { saveCalendarSelection } from "@/app/actions/calendars";
import { disconnectIntegration } from "@/app/actions/connect";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/** Google Calendar sync against recorded API responses: initial, incremental, cancellation,
 * 410 full resync, all-day and recurring instances, mirror events, selection, disconnect. */
type Script = Record<string, (url: URL, init?: RequestInit) => Response>;
let script: Script = {};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  for (const [key, handler] of Object.entries(script)) if (url.href.includes(key)) return handler(url, init);
  if (url.href.startsWith("https://oauth2.googleapis.com/revoke")) return new Response("", { status: 200 });
  return json({ error: `unexpected ${url.href}` }, 500);
}));

describe("Google Calendar sync", () => {
  let businessId: string;
  let integrationId: string;
  let ownerSession: { userId: string; activeBusinessId: string };
  beforeAll(async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    const stamp = Date.now();
    businessId = (await prisma.business.create({ data: { name: "Sync", handle: `sync-${stamp}`, timezone: "America/Chicago" } })).id;
    const user = await prisma.user.create({ data: { name: "O", email: `sync-${stamp}@example.com`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: user.id, businessId, role: "OWNER" } });
    ownerSession = { userId: user.id, activeBusinessId: businessId };
    integrationId = (await prisma.integration.create({ data: { businessId, provider: "GOOGLE_CALENDAR", status: "CONNECTED", externalAccount: "o@example.com", accessToken: "ya29.x", refreshToken: "1//r", tokenExpiresAt: new Date(Date.now() + 3600e3), settings: { available: [{ id: "primary", name: "Primary", primary: true, timeZone: "America/Chicago" }, { id: "work", name: "Work" }], selected: ["primary"], bookingCalendar: "primary", cursors: {} } } })).id;
  });
  afterAll(async () => {
    await prisma.business.delete({ where: { id: businessId } });
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  const row = () => prisma.integration.findUniqueOrThrow({ where: { id: integrationId } });

  it("initial sync stores timed, all-day and recurring instances, skips mirrors, keeps the sync token", async () => {
    script = {
      "/calendars/primary/events": (url) => {
        expect(url.searchParams.get("singleEvents")).toBe("true");
        expect(url.searchParams.get("syncToken")).toBeNull();
        return json({ items: [
          { id: "a", status: "confirmed", summary: "Dentist", start: { dateTime: "2026-09-10T14:00:00Z" }, end: { dateTime: "2026-09-10T15:00:00Z" } },
          { id: "b", status: "confirmed", summary: "Offsite", start: { date: "2026-09-12" }, end: { date: "2026-09-13" } },
          { id: "c_20260914T130000Z", status: "confirmed", summary: "Standup", recurringEventId: "c", start: { dateTime: "2026-09-14T08:00:00-05:00", timeZone: "America/Chicago" }, end: { dateTime: "2026-09-14T08:15:00-05:00", timeZone: "America/Chicago" } },
          { id: "m", status: "confirmed", summary: "Brand session · Sarah", start: { dateTime: "2026-09-15T14:00:00Z" }, end: { dateTime: "2026-09-15T15:00:00Z" }, extendedProperties: { private: { daythreadBookingId: "bk_1" } } },
          { id: "free", status: "confirmed", summary: "Focus", transparency: "transparent", start: { dateTime: "2026-09-16T14:00:00Z" }, end: { dateTime: "2026-09-16T15:00:00Z" } },
        ], nextSyncToken: "tok-1" });
      },
    };
    const r = await syncCalendarIn(await row());
    expect(r.ok).toBe(true);
    const events = await prisma.externalEvent.findMany({ where: { integrationId }, orderBy: { startAt: "asc" } });
    expect(events.map((e) => e.externalId)).toEqual(["a", "b", "c_20260914T130000Z", "m", "free"]);
    const allDay = events.find((e) => e.externalId === "b")!;
    expect(allDay.allDay).toBe(true);
    // 2026-09-12 00:00 America/Chicago (CDT, UTC-5) = 05:00Z
    expect(allDay.startAt.toISOString()).toBe("2026-09-12T05:00:00.000Z");
    expect(events.find((e) => e.externalId === "c_20260914T130000Z")!.startAt.toISOString()).toBe("2026-09-14T13:00:00.000Z");
    expect(events.find((e) => e.externalId === "m")!.bookingId).toBe("bk_1"); // a mirror never blocks
    expect(events.find((e) => e.externalId === "free")!.transparent).toBe(true);
    const settings = (await row()).settings as { cursors: Record<string, string> };
    expect(settings.cursors.primary).toBe("tok-1");
    expect((await row()).lastSyncStatus).toBe("ok");
  });

  it("incremental sync sends the token and applies updates and cancellations", async () => {
    script = {
      "/calendars/primary/events": (url) => {
        expect(url.searchParams.get("syncToken")).toBe("tok-1");
        return json({ items: [{ id: "a", status: "cancelled" }, { id: "b", status: "confirmed", summary: "Offsite (moved)", start: { date: "2026-09-19" }, end: { date: "2026-09-20" } }], nextSyncToken: "tok-2" });
      },
    };
    const r = await syncCalendarIn(await row());
    expect(r).toMatchObject({ ok: true, removed: 1, upserted: 1 });
    expect(await prisma.externalEvent.findFirst({ where: { integrationId, externalId: "a" } })).toBeNull();
    expect((await prisma.externalEvent.findFirst({ where: { integrationId, externalId: "b" } }))?.title).toBe("Offsite (moved)");
  });

  it("a 410 from Google triggers a full resync of that calendar", async () => {
    let call = 0;
    script = {
      "/calendars/primary/events": (url) => {
        call++;
        if (url.searchParams.get("syncToken")) return json({ error: { code: 410, message: "Sync token is no longer valid" } }, 410);
        return json({ items: [{ id: "z", status: "confirmed", summary: "Fresh", start: { dateTime: "2026-09-20T14:00:00Z" }, end: { dateTime: "2026-09-20T15:00:00Z" } }], nextSyncToken: "tok-3" });
      },
    };
    const r = await syncCalendarIn(await row());
    expect(r.fullResync).toBe(true);
    expect(call).toBe(2);
    const ids = (await prisma.externalEvent.findMany({ where: { integrationId, bookingId: null } })).map((e) => e.externalId).sort();
    expect(ids).toEqual(["z"]);
  });

  it("selecting another calendar syncs it too and deselecting prunes its busy time; the booking calendar must be writable", async () => {
    script = {
      "/calendars/primary/events": () => json({ items: [], nextSyncToken: "tok-4" }),
      "/calendars/work/events": () => json({ items: [{ id: "w1", status: "confirmed", summary: "Client call", start: { dateTime: "2026-09-21T14:00:00Z" }, end: { dateTime: "2026-09-21T15:00:00Z" } }], nextSyncToken: "wtok-1" }),
    };
    const saved = await saveCalendarSelection({ provider: "GOOGLE_CALENDAR", selected: ["primary", "work", "not-a-real-calendar"], bookingCalendar: "work" }, ownerSession);
    expect(saved.error).toBeUndefined();
    let settings = (await row()).settings as { selected: string[]; bookingCalendar: string; cursors: Record<string, string> };
    expect(settings.selected).toEqual(["primary", "work"]);
    expect(settings.bookingCalendar).toBe("work");
    expect(settings.cursors.work).toBe("wtok-1");
    expect(await prisma.externalEvent.count({ where: { integrationId, calendarId: "work" } })).toBe(1);
    await saveCalendarSelection({ provider: "GOOGLE_CALENDAR", selected: ["primary"], bookingCalendar: "work" }, ownerSession);
    settings = (await row()).settings as { selected: string[]; bookingCalendar: string; cursors: Record<string, string> };
    expect(settings.bookingCalendar).toBe("primary"); // fell back to a selected, writable one
    expect(settings.cursors.work).toBeUndefined();
    expect(await prisma.externalEvent.count({ where: { integrationId, calendarId: "work" } })).toBe(0);
    expect((await saveCalendarSelection({ provider: "GOOGLE_CALENDAR", selected: [], bookingCalendar: null }, ownerSession)).error).toMatch(/at least one/);
  });

  it("a booking is mirrored to the booking calendar and a Google-side edit never changes the booking", async () => {
    const service = await prisma.service.create({ data: { businessId, name: "Brand session", priceCents: 35000, durationMins: 60 } });
    const client = await prisma.client.create({ data: { businessId, name: "Sarah Kim" } });
    const booking = await prisma.booking.create({ data: { businessId, clientId: client.id, serviceId: service.id, startAt: new Date("2026-10-01T15:00:00Z"), endAt: new Date("2026-10-01T16:00:00Z"), status: "BOOKED", totalCents: 35000, depositCents: 10500 } });
    let created: unknown = null;
    script = {
      "/calendars/primary/events": (url, init) => {
        if (init?.method === "POST") {
          created = JSON.parse(String(init.body));
          return json({ id: "mirror-1", status: "confirmed", etag: "e1" });
        }
        // Google later reports the mirror moved by a day (someone dragged it) — plus the stored token path.
        return json({ items: [{ id: "mirror-1", status: "confirmed", summary: "Brand session · Sarah Kim", start: { dateTime: "2026-10-02T15:00:00Z" }, end: { dateTime: "2026-10-02T16:00:00Z" }, extendedProperties: { private: { daythreadBookingId: booking.id } } }], nextSyncToken: "tok-5" });
      },
    };
    await pushBookingToCalendars(booking.id);
    expect((created as { extendedProperties: { private: { daythreadBookingId: string } } }).extendedProperties.private.daythreadBookingId).toBe(booking.id);
    const after = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(after?.externalEventId).toBe("mirror-1");
    await syncCalendarIn(await row());
    const unchanged = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(unchanged?.startAt.toISOString()).toBe("2026-10-01T15:00:00.000Z"); // Daythread stays the truth
    const mirror = await prisma.externalEvent.findFirst({ where: { integrationId, externalId: "mirror-1" } });
    expect(mirror?.bookingId).toBe(booking.id); // and it never counts as busy time
  });

  it("disconnect revokes at Google, erases credentials and busy time, and keeps the booking", async () => {
    const r = await disconnectIntegration("GOOGLE_CALENDAR", ownerSession);
    expect(r.error).toBeUndefined();
    const after = await row();
    expect(after.status).toBe("NOT_CONNECTED");
    expect(after.refreshToken).toBeNull();
    expect(after.accessToken).toBeNull();
    expect(await prisma.externalEvent.count({ where: { integrationId } })).toBe(0);
    expect(await prisma.booking.count({ where: { businessId } })).toBe(1);
    expect((await prisma.booking.findFirst({ where: { businessId } }))?.externalEventId).toBeNull();
  });
});
