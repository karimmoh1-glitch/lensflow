import type { Integration } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getValidAccessToken } from "@/lib/google";

/**
 * Google Calendar API v3, the parts Daythread uses. Every call carries the connected
 * account's own token. Incremental sync follows Google's guidance: a first full list
 * yields a nextSyncToken; later runs pass syncToken and receive only changes (including
 * cancellations); a 410 means the token is stale and a full resync is required.
 */
const API = "https://www.googleapis.com/calendar/v3";

export class GoogleApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!res.ok) throw new GoogleApiError(res.status, `Google Calendar ${res.status}: ${text.slice(0, 200)}`);
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export type GCalendar = { id: string; summary: string; primary?: boolean; accessRole: string; timeZone?: string };
export type GEvent = {
  id: string;
  status: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  transparency?: "opaque" | "transparent";
  etag?: string;
  recurringEventId?: string;
  extendedProperties?: { private?: Record<string, string> };
};

export async function listCalendars(token: string): Promise<GCalendar[]> {
  const data = await call<{ items?: GCalendar[] }>(token, "/users/me/calendarList?minAccessRole=writer");
  return data.items ?? [];
}

export type ListResult = { events: GEvent[]; nextSyncToken: string | null };

/** One page-walking list. With a syncToken: only changes since. Without: the next 90 days,
 * recurring events expanded to instances (singleEvents), which is what availability needs. */
export async function listEvents(token: string, calendarId: string, opts: { syncToken?: string | null; timeMin?: Date; timeMax?: Date }): Promise<ListResult> {
  const events: GEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;
  do {
    const params = new URLSearchParams({ maxResults: "250", singleEvents: "true" });
    if (opts.syncToken) params.set("syncToken", opts.syncToken);
    else {
      params.set("timeMin", (opts.timeMin ?? new Date()).toISOString());
      params.set("timeMax", (opts.timeMax ?? new Date(Date.now() + 90 * 86400000)).toISOString());
    }
    if (pageToken) params.set("pageToken", pageToken);
    const page = await call<{ items?: GEvent[]; nextPageToken?: string; nextSyncToken?: string }>(token, `/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
    events.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
    if (page.nextSyncToken) nextSyncToken = page.nextSyncToken;
  } while (pageToken);
  return { events, nextSyncToken };
}

export type EventInput = { summary: string; description?: string; location?: string | null; start: Date; end: Date; timeZone: string; bookingId: string };

function body(e: EventInput) {
  return {
    summary: e.summary,
    description: e.description,
    location: e.location ?? undefined,
    start: { dateTime: e.start.toISOString(), timeZone: e.timeZone },
    end: { dateTime: e.end.toISOString(), timeZone: e.timeZone },
    extendedProperties: { private: { daythreadBookingId: e.bookingId } },
    reminders: { useDefault: true },
  };
}

export async function createEvent(token: string, calendarId: string, e: EventInput): Promise<GEvent> {
  return call<GEvent>(token, `/calendars/${encodeURIComponent(calendarId)}/events`, { method: "POST", body: JSON.stringify(body(e)) });
}
export async function updateEvent(token: string, calendarId: string, eventId: string, e: EventInput): Promise<GEvent> {
  return call<GEvent>(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "PUT", body: JSON.stringify(body(e)) });
}
export async function deleteEvent(token: string, calendarId: string, eventId: string): Promise<void> {
  try {
    await call<void>(token, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
  } catch (err) {
    if (err instanceof GoogleApiError && (err.status === 404 || err.status === 410)) return; // already gone
    throw err;
  }
}

/** Convenience: a valid token for a calendar integration row (refreshes; marks the row
 * NEEDS_ATTENTION when Google says the grant is gone). */
export async function calendarToken(integration: Integration): Promise<string> {
  try {
    return await getValidAccessToken(integration);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/invalid_grant|No refresh token/i.test(msg)) {
      await prisma.integration.update({ where: { id: integration.id }, data: { status: "NEEDS_ATTENTION", lastError: "Google revoked access — reconnect", lastErrorAt: new Date() } });
    }
    throw err;
  }
}

/** Google's instant → Date, for both timed and all-day events. All-day `date` values are
 * calendar days in the calendar's zone; we place them at local midnight in that zone. */
export function eventInstant(part: GEvent["start"], zone: string | undefined, endOfDay = false): Date | null {
  if (!part) return null;
  if (part.dateTime) return new Date(part.dateTime);
  if (part.date) {
    const [y, m, d] = part.date.split("-").map(Number);
    return zonedMidnight(y, m - 1, d, zone ?? "UTC", endOfDay ? 24 * 60 : 0);
  }
  return null;
}

/** Wall-clock minutes on a calendar day in an IANA zone → UTC instant (DST-correct). */
export function zonedMidnight(year: number, month: number, day: number, timeZone: string, minutes = 0): Date {
  const guess = new Date(Date.UTC(year, month, day, Math.floor(minutes / 60), minutes % 60));
  const asUtc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  const asZoned = new Date(guess.toLocaleString("en-US", { timeZone }));
  return new Date(guess.getTime() + (asUtc.getTime() - asZoned.getTime()));
}
