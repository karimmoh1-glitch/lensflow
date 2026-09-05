import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db";
import { parseMultistatus } from "./caldav";
import { connectAppleCalendar } from "@/app/actions/connect";
import { saveCalendarSelection, getCalendarState } from "@/app/actions/calendars";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/** iCloud replaced by a scripted CalDAV server: discovery, calendar listing, a
 * calendar-query with events, sync-collection. Credentials, encryption, settings,
 * selection and tenant scoping are the real code against the real database. */
const GOOD = "Basic " + Buffer.from("alex@icloud.com:abcd-efgh-ijkl-mnop").toString("base64");
const xml = (body: string, status = 207) => new Response(body, { status, headers: { "content-type": "application/xml" } });
vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
  if (auth !== GOOD) return new Response("", { status: 401 });
  const method = init?.method ?? "GET";
  if (method === "PROPFIND" && url.pathname === "/") return xml(`<d:multistatus xmlns:d="DAV:"><d:response><d:href>/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/123/principal/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`);
  if (method === "PROPFIND" && url.pathname === "/123/principal/") return xml(`<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/123/principal/</d:href><d:propstat><d:prop><c:calendar-home-set><d:href>/123/calendars/</d:href></c:calendar-home-set></d:prop></d:propstat></d:response></d:multistatus>`);
  if (method === "PROPFIND" && url.pathname === "/123/calendars/") return xml(`<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/123/calendars/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response><d:response><d:href>/123/calendars/home/</d:href><d:propstat><d:prop><d:displayname>Home</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set></d:prop></d:propstat></d:response><d:response><d:href>/123/calendars/work/</d:href><d:propstat><d:prop><d:displayname>Work</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set></d:prop></d:propstat></d:response></d:multistatus>`);
  if (method === "REPORT" && url.pathname === "/123/calendars/home/") {
    const body = String(init?.body ?? "");
    if (body.includes("sync-collection")) return xml(`<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/123/calendars/home/dentist.ics</d:href><d:propstat><d:prop><d:getetag>"e1"</d:getetag><c:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:dentist
SUMMARY:Dentist
DTSTART;TZID=America/Chicago:20260910T090000
DTEND;TZID=America/Chicago:20260910T100000
END:VEVENT
END:VCALENDAR</c:calendar-data></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response><d:sync-token>http://icloud/sync/1</d:sync-token></d:multistatus>`);
    return xml(`<d:multistatus xmlns:d="DAV:"></d:multistatus>`);
  }
  if (method === "REPORT" && url.pathname === "/123/calendars/work/") return xml(`<d:multistatus xmlns:d="DAV:"><d:sync-token>http://icloud/sync/w1</d:sync-token></d:multistatus>`);
  return new Response("", { status: 404 });
}));

describe("Apple Calendar (CalDAV)", () => {
  let businessId: string;
  let otherBusinessId: string;
  let owner: { userId: string; activeBusinessId: string };
  let stranger: { userId: string; activeBusinessId: string };
  beforeAll(async () => {
    const stamp = Date.now();
    businessId = (await prisma.business.create({ data: { name: "Apple", handle: `apple-${stamp}` } })).id;
    otherBusinessId = (await prisma.business.create({ data: { name: "Apple Other", handle: `apple-other-${stamp}` } })).id;
    const u1 = await prisma.user.create({ data: { name: "A", email: `apple-${stamp}@example.com`, passwordHash: "x" } });
    const u2 = await prisma.user.create({ data: { name: "B", email: `apple-b-${stamp}@example.com`, passwordHash: "x" } });
    await prisma.orgMembership.create({ data: { userId: u1.id, businessId, role: "OWNER" } });
    await prisma.orgMembership.create({ data: { userId: u2.id, businessId: otherBusinessId, role: "OWNER" } });
    owner = { userId: u1.id, activeBusinessId: businessId };
    stranger = { userId: u2.id, activeBusinessId: otherBusinessId };
  });
  afterAll(async () => {
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.business.delete({ where: { id: otherBusinessId } });
    vi.unstubAllGlobals();
  });

  it("parses a multistatus response", () => {
    const rows = parseMultistatus(`<d:multistatus xmlns:d="DAV:"><d:response><d:href>/a/</d:href><d:propstat><d:prop><d:displayname>A</d:displayname></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`);
    expect(rows).toHaveLength(1);
    expect(rows[0].href).toBe("/a/");
    expect(rows[0].props.displayname).toBe("A");
    expect(rows[0].status).toBe("HTTP/1.1 200 OK");
  });

  it("refuses a normal password without touching iCloud, and explains a wrong app-specific password", async () => {
    expect((await connectAppleCalendar("alex@icloud.com", "MyNormalPassword!", owner)).error).toMatch(/app-specific password/);
    expect((await connectAppleCalendar("alex@icloud.com", "zzzz-zzzz-zzzz-zzzz", owner)).error).toMatch(/authentication failed/i);
    expect(await prisma.integration.count({ where: { businessId } })).toBe(0);
  });

  it("connects: discovers the principal and calendars, stores the credential encrypted, pre-selects a calendar, syncs", async () => {
    const r = await connectAppleCalendar("Alex@iCloud.com", "abcd-efgh-ijkl-mnop", owner);
    expect(r.error).toBeUndefined();
    expect(r.calendars?.map((c) => c.name)).toEqual(["Home", "Work"]);
    const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "APPLE_CALENDAR" } } });
    expect(row?.status).toBe("CONNECTED");
    expect(row?.externalAccount).toBe("alex@icloud.com");
    const raw = await prisma.$queryRaw<Array<{ accessToken: string }>>`SELECT "accessToken" FROM "Integration" WHERE id = ${row!.id}`;
    expect(raw[0].accessToken).toMatch(/^v1:/);
    expect(raw[0].accessToken).not.toContain("abcd-efgh");
    const settings = row!.settings as { selected: string[]; bookingCalendar: string; calendarHome: string; cursors: Record<string, string> };
    expect(settings.selected).toEqual(["/123/calendars/home/"]);
    expect(settings.calendarHome).toBe("/123/calendars/");
    expect(settings.cursors["/123/calendars/home/"]).toBe("http://icloud/sync/1");
    const ev = await prisma.externalEvent.findFirst({ where: { integrationId: row!.id } });
    expect(ev?.title).toBe("Dentist");
    expect(ev?.startAt.toISOString()).toBe("2026-09-10T14:00:00.000Z"); // 09:00 Chicago (CDT)
  });

  it("selection works through the same action as Google, and state reads back", async () => {
    const saved = await saveCalendarSelection({ provider: "APPLE_CALENDAR", selected: ["/123/calendars/home/", "/123/calendars/work/"], bookingCalendar: "/123/calendars/work/" }, owner);
    expect(saved.error).toBeUndefined();
    const state = await getCalendarState("APPLE_CALENDAR", {}, owner);
    expect(state.connected).toBe(true);
    expect(state.selected).toHaveLength(2);
    expect(state.bookingCalendar).toBe("/123/calendars/work/");
    expect(state.busyBlocks).toBe(1);
  });

  it("another tenant sees nothing and can change nothing", async () => {
    const state = await getCalendarState("APPLE_CALENDAR", {}, stranger);
    expect(state.connected).toBe(false);
    const r = await saveCalendarSelection({ provider: "APPLE_CALENDAR", selected: ["/123/calendars/home/"], bookingCalendar: null }, stranger);
    expect(r.error).toBeTruthy();
    expect(await prisma.externalEvent.count({ where: { businessId: otherBusinessId } })).toBe(0);
  });
});
