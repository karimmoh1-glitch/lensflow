import type { Integration } from "@prisma/client";
import { parseICS, expandOccurrences, type ParsedEvent } from "@/lib/ics";

/**
 * iCloud Calendar over CalDAV — Apple's supported way for third-party software to read and
 * write a user's calendars. Authentication is an app-specific password the user generates
 * at appleid.apple.com (Sign-In & Security → App-Specific Passwords), scoped to this app,
 * revocable at any time, and never their Apple ID password. Stored encrypted; decrypted only
 * on the server for the request that needs it.
 *
 * Discovery follows RFC 6764 / 4791: current-user-principal → calendar-home-set →
 * calendars (PROPFIND), events by calendar-query REPORT, incremental changes by
 * sync-collection REPORT (RFC 6578), writes by PUT with an If-None-Match / If-Match etag.
 */
export type CalDavClient = { baseUrl: string; auth: string; principal?: string };
export type CalDavCalendar = { href: string; name: string; color?: string | null; readOnly: boolean };
export type CalDavItem = { href: string; etag: string | null; summary: string | null; allDay: boolean; status: "confirmed" | "tentative" | "cancelled"; transparent: boolean; bookingId: string | null; occurrences: { start: Date; end: Date }[] };

const ICLOUD = "https://caldav.icloud.com";

export class CalDavError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function makeClient(appleId: string, appPassword: string, baseUrl = ICLOUD): CalDavClient {
  return { baseUrl, auth: "Basic " + Buffer.from(`${appleId}:${appPassword}`).toString("base64") };
}

export async function caldavClientFor(integration: Integration): Promise<CalDavClient> {
  if (!integration.externalAccount || !integration.accessToken) throw new Error("Apple Calendar isn't connected — reconnect from Settings.");
  const settings = (integration.settings as { baseUrl?: string; principal?: string } | null) ?? {};
  return { baseUrl: settings.baseUrl ?? ICLOUD, auth: "Basic " + Buffer.from(`${integration.externalAccount}:${integration.accessToken}`).toString("base64"), principal: settings.principal };
}

async function dav(client: CalDavClient, method: string, path: string, body?: string, headers: Record<string, string> = {}): Promise<{ status: number; text: string; headers: Headers }> {
  const url = path.startsWith("http") ? path : `${client.baseUrl}${path}`;
  const res = await fetch(url, { method, headers: { Authorization: client.auth, "Content-Type": "application/xml; charset=utf-8", ...headers }, body, redirect: "manual" });
  const text = await res.text();
  if (res.status === 401 || res.status === 403) throw new CalDavError(res.status, "Apple rejected the sign-in. Check the Apple ID and generate a fresh app-specific password.");
  if (res.status >= 400 && res.status !== 404 && res.status !== 412) throw new CalDavError(res.status, `CalDAV ${method} ${res.status}`);
  return { status: res.status, text, headers: res.headers };
}

/** Pulls every <D:href> + matching propstat block out of a multistatus response. */
export function parseMultistatus(xml: string): Array<{ href: string; props: Record<string, string>; status: string | null }> {
  const out: Array<{ href: string; props: Record<string, string>; status: string | null }> = [];
  const responses = xml.split(/<(?:[A-Za-z0-9]+:)?response\b[^>]*>/i).slice(1);
  for (const rawChunk of responses) {
    const href = /<(?:[A-Za-z0-9]+:)?href>([^<]+)<\/(?:[A-Za-z0-9]+:)?href>/i.exec(rawChunk)?.[1];
    if (!href) continue;
    // Containers (propstat / prop / response) are removed so their children are seen as
    // properties instead of being swallowed as one block.
    const chunk = rawChunk.replace(/<\/?(?:[A-Za-z0-9]+:)?(?:propstat|prop|response)\b[^>]*>/gi, "");
    const props: Record<string, string> = {};
    const propRe = /<(?:[A-Za-z0-9]+:)?([A-Za-z-]+)(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z0-9]+:)?\1>/g;
    let m: RegExpExecArray | null;
    while ((m = propRe.exec(chunk))) {
      const name = m[1].toLowerCase();
      if (name === "href" && props.href) continue;
      props[name] = m[2].trim();
    }
    const status = /<(?:[A-Za-z0-9]+:)?status>([^<]+)<\/(?:[A-Za-z0-9]+:)?status>/i.exec(chunk)?.[1] ?? null;
    out.push({ href: decodeURIComponent(href), props, status });
  }
  return out;
}

function innerHref(v: string | undefined): string | null {
  if (!v) return null;
  const m = /<(?:[A-Za-z0-9]+:)?href>([^<]+)<\/(?:[A-Za-z0-9]+:)?href>/i.exec(v);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Discovers the user's principal and calendar home, proving the credentials work. */
export async function discover(client: CalDavClient): Promise<{ principal: string; calendarHome: string; baseUrl: string }> {
  const propfind = `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`;
  let res = await dav(client, "PROPFIND", "/", propfind, { Depth: "0" });
  let baseUrl = client.baseUrl;
  // iCloud answers with the shard to use (p12-caldav.icloud.com…) via a redirect on some paths.
  const location = res.headers.get("location");
  if ((res.status === 301 || res.status === 302 || res.status === 307) && location) {
    baseUrl = new URL(location).origin;
    res = await dav({ ...client, baseUrl }, "PROPFIND", "/", propfind, { Depth: "0" });
  }
  const principal = innerHref(parseMultistatus(res.text)[0]?.props["current-user-principal"]);
  if (!principal) throw new CalDavError(res.status, "Apple didn't return a principal for this account.");
  const homeXml = `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`;
  const homeRes = await dav({ ...client, baseUrl }, "PROPFIND", principal, homeXml, { Depth: "0" });
  const home = innerHref(parseMultistatus(homeRes.text)[0]?.props["calendar-home-set"]);
  if (!home) throw new CalDavError(homeRes.status, "Apple didn't return a calendar home.");
  return { principal, calendarHome: home.startsWith("http") ? new URL(home).pathname : home, baseUrl: home.startsWith("http") ? new URL(home).origin : baseUrl };
}

export async function listCalendars(client: CalDavClient, calendarHome: string): Promise<CalDavCalendar[]> {
  const xml = `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:a="http://apple.com/ns/ical/"><d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/><a:calendar-color/><d:current-user-privilege-set/></d:prop></d:propfind>`;
  const res = await dav(client, "PROPFIND", calendarHome, xml, { Depth: "1" });
  return parseMultistatus(res.text)
    .filter((r) => /<(?:[A-Za-z0-9]+:)?calendar\s*\/?>/i.test(r.props.resourcetype ?? "") && /VEVENT/i.test(r.props["supported-calendar-component-set"] ?? "VEVENT"))
    .map((r) => ({ href: r.href, name: r.props.displayname?.replace(/<[^>]+>/g, "") || "Calendar", color: r.props["calendar-color"]?.replace(/<[^>]+>/g, "") ?? null, readOnly: /current-user-privilege-set/.test(r.props["current-user-privilege-set"] ?? "") ? !/<(?:[A-Za-z0-9]+:)?write(?:-content)?\s*\/?>/i.test(r.props["current-user-privilege-set"] ?? "") : false }));
}

function fmt(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function toItems(rows: Array<{ href: string; props: Record<string, string> }>, from: Date, to: Date): CalDavItem[] {
  const items: CalDavItem[] = [];
  for (const r of rows) {
    const data = r.props["calendar-data"];
    if (!data) continue;
    const decoded = data.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    let events: ParsedEvent[];
    try {
      events = parseICS(decoded);
    } catch {
      continue;
    }
    const master = events.find((e) => e.rrule) ?? events[0];
    if (!master) continue;
    const occurrences = events.length > 1 && !master.rrule ? events.flatMap((e) => expandOccurrences(e, from, to)) : expandOccurrences(master, from, to);
    items.push({ href: r.href, etag: r.props.getetag?.replace(/&quot;|"/g, "") ?? null, summary: master.summary, allDay: master.allDay, status: master.status, transparent: master.transparent, bookingId: master.bookingId, occurrences });
  }
  return items;
}

export async function listCalendarEvents(client: CalDavClient, calendarHref: string, from: Date, to: Date): Promise<CalDavItem[]> {
  const xml = `<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${fmt(from)}" end="${fmt(to)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
  const res = await dav(client, "REPORT", calendarHref, xml, { Depth: "1" });
  return toItems(parseMultistatus(res.text), from, to);
}

/** RFC 6578 incremental sync. Returns null for a server that doesn't support it. */
export async function syncCollection(client: CalDavClient, calendarHref: string, syncToken: string | null): Promise<{ changed: CalDavItem[]; removed: string[]; syncToken: string | null } | null> {
  const xml = `<?xml version="1.0" encoding="utf-8"?><d:sync-collection xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:sync-token>${syncToken ? escapeXml(syncToken) : ""}</d:sync-token><d:sync-level>1</d:sync-level><d:prop><d:getetag/><c:calendar-data/></d:prop></d:sync-collection>`;
  const res = await dav(client, "REPORT", calendarHref, xml, { Depth: "1" });
  if (res.status === 404 || res.status === 403) return null;
  const token = /<(?:[A-Za-z0-9]+:)?sync-token>([^<]+)<\/(?:[A-Za-z0-9]+:)?sync-token>/i.exec(res.text)?.[1] ?? null;
  const rows = parseMultistatus(res.text);
  const removed = rows.filter((r) => /404/.test(r.status ?? "")).map((r) => r.href);
  const from = new Date(Date.now() - 30 * 86400000);
  const to = new Date(Date.now() + 365 * 86400000);
  return { changed: toItems(rows.filter((r) => !/404/.test(r.status ?? "")), from, to), removed, syncToken: token };
}

export async function putEvent(client: CalDavClient, href: string, ics: string, etag?: string | null): Promise<{ etag: string | null }> {
  const res = await fetch(href.startsWith("http") ? href : `${client.baseUrl}${href}`, { method: "PUT", headers: { Authorization: client.auth, "Content-Type": "text/calendar; charset=utf-8", ...(etag ? { "If-Match": `"${etag}"` } : {}) }, body: ics });
  if (res.status === 412) throw new CalDavError(412, "The event changed on the calendar since we last saw it.");
  if (res.status === 401 || res.status === 403) throw new CalDavError(res.status, "Apple rejected the sign-in. Reconnect Apple Calendar.");
  if (!res.ok) throw new CalDavError(res.status, `CalDAV PUT ${res.status}`);
  return { etag: res.headers.get("etag")?.replace(/"/g, "") ?? null };
}

export async function deleteEvent(client: CalDavClient, href: string): Promise<void> {
  const res = await fetch(href.startsWith("http") ? href : `${client.baseUrl}${href}`, { method: "DELETE", headers: { Authorization: client.auth } });
  if (res.status === 404) return;
  if (res.status === 401 || res.status === 403) throw new CalDavError(res.status, "Apple rejected the sign-in. Reconnect Apple Calendar.");
  if (!res.ok) throw new CalDavError(res.status, `CalDAV DELETE ${res.status}`);
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
