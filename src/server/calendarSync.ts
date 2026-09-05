import { prisma } from "@/lib/db";
import { reportFailure } from "@/lib/observe";
import { listCalendars, listEvents, createEvent, updateEvent, deleteEvent, calendarToken, eventInstant, GoogleApiError } from "@/lib/googleCalendar";
import { caldavClientFor, listCalendarEvents as caldavList, putEvent as caldavPut, deleteEvent as caldavDelete, syncCollection } from "@/lib/caldav";
import { buildVEvent } from "@/lib/ics";
import type { Integration, Booking } from "@prisma/client";
import { addDays } from "date-fns";

/**
 * Calendar settings stored on the Integration row (non-secret):
 *   available        every calendar the account exposes, as discovered at connect time
 *   selected         the ones whose busy time blocks availability
 *   bookingCalendar  the one Daythread writes bookings to (always one of `selected`)
 *   cursors          incremental sync position per calendar (Google syncToken / CalDAV sync-token)
 *
 * Source-of-truth rules
 *   - A Daythread booking is the truth for bookings. It is pushed OUT to the booking
 *     calendar as a mirror event (id stored on the booking). Editing the mirror on the
 *     calendar never changes the booking; the next push restores it.
 *   - The external calendars are the truth for the owner's other commitments. Those come
 *     IN as ExternalEvents and only affect availability. Mirrors are recognised by their
 *     marker and skipped, so a booking never blocks itself.
 *   - A failed sync leaves the last good state in place and is reported; the UI says
 *     "Sync issue", never "Synced".
 */
export type CalendarChoice = { id: string; name: string; primary?: boolean; timeZone?: string | null; readOnly?: boolean };
export type CalendarSettings = {
  available: CalendarChoice[];
  selected: string[];
  bookingCalendar: string | null;
  cursors: Record<string, string>;
  // Apple only
  baseUrl?: string;
  principal?: string;
  calendarHome?: string;
};

export function readCalendarSettings(row: Pick<Integration, "settings">): CalendarSettings {
  const s = (row.settings as Partial<CalendarSettings> | null) ?? {};
  return { available: s.available ?? [], selected: s.selected ?? [], bookingCalendar: s.bookingCalendar ?? null, cursors: s.cursors ?? {}, baseUrl: s.baseUrl, principal: s.principal, calendarHome: s.calendarHome };
}

export type SyncSummary = { ok: boolean; upserted: number; removed: number; error?: string; fullResync?: boolean };

export async function syncCalendarIn(integration: Integration): Promise<SyncSummary> {
  const businessId = integration.businessId;
  const settings = readCalendarSettings(integration);
  try {
    if (settings.selected.length === 0) {
      await prisma.integration.update({ where: { id: integration.id }, data: { lastSyncedAt: new Date(), lastSyncStatus: "ok", lastError: null, lastErrorAt: null } });
      return { ok: true, upserted: 0, removed: 0 };
    }
    let summary: SyncSummary;
    if (integration.provider === "GOOGLE_CALENDAR") summary = await syncGoogleIn(integration, settings);
    else if (integration.provider === "APPLE_CALENDAR") summary = await syncAppleIn(integration, settings);
    else return { ok: false, upserted: 0, removed: 0, error: "Not a calendar integration" };
    await prisma.integration.update({ where: { id: integration.id }, data: { lastSyncedAt: new Date(), lastSyncStatus: "ok", lastError: null, lastErrorAt: null, status: integration.status === "SYNC_ERROR" ? "CONNECTED" : integration.status } });
    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Calendar sync failed";
    const revoked = /invalid_grant|401|403|No refresh token|Unauthorized|rejected the sign-in/i.test(message);
    await prisma.integration.update({ where: { id: integration.id }, data: { lastSyncStatus: "failed", lastError: revoked ? "Access was revoked — reconnect" : "Calendar sync temporarily failed. Daythread will retry automatically.", lastErrorAt: new Date(), status: revoked ? "NEEDS_ATTENTION" : "SYNC_ERROR" } });
    await reportFailure("sync", `${integration.provider} sync failed`, { businessId, provider: integration.provider, error: err });
    return { ok: false, upserted: 0, removed: 0, error: revoked ? "Access was revoked — reconnect" : "Calendar sync temporarily failed." };
  }
}

async function saveCursor(integrationId: string, calendarId: string, token: string | null) {
  if (!token) return;
  const row = await prisma.integration.findUnique({ where: { id: integrationId }, select: { settings: true } });
  const s = readCalendarSettings({ settings: row?.settings ?? null });
  await prisma.integration.update({ where: { id: integrationId }, data: { settings: { ...s, cursors: { ...s.cursors, [calendarId]: token } } } });
}

async function syncGoogleIn(integration: Integration, settings: CalendarSettings): Promise<SyncSummary> {
  const token = await calendarToken(integration);
  let upserted = 0;
  let removed = 0;
  let fullResync = false;
  for (const calendarId of settings.selected) {
    const cursor = settings.cursors[calendarId] ?? null;
    let result;
    try {
      result = await listEvents(token, calendarId, { syncToken: cursor });
    } catch (err) {
      if (err instanceof GoogleApiError && err.status === 410) {
        // Google: the sync token is stale → full resync of this calendar.
        fullResync = true;
        await prisma.externalEvent.deleteMany({ where: { integrationId: integration.id, calendarId, bookingId: null } });
        result = await listEvents(token, calendarId, {});
      } else throw err;
    }
    const zone = settings.available.find((c) => c.id === calendarId)?.timeZone ?? undefined;
    for (const e of result.events) {
      const isMirror = Boolean(e.extendedProperties?.private?.daythreadBookingId);
      if (e.status === "cancelled") {
        const r = await prisma.externalEvent.deleteMany({ where: { integrationId: integration.id, externalId: e.id } });
        removed += r.count;
        continue;
      }
      const start = eventInstant(e.start, e.start?.timeZone ?? zone);
      const end = eventInstant(e.end, e.end?.timeZone ?? zone, true);
      if (!start || !end) continue;
      await prisma.externalEvent.upsert({
        where: { integrationId_externalId: { integrationId: integration.id, externalId: e.id } },
        create: { businessId: integration.businessId, integrationId: integration.id, externalId: e.id, calendarId, title: e.summary ?? null, startAt: start, endAt: end, allDay: Boolean(e.start?.date), status: e.status, transparent: e.transparency === "transparent", etag: e.etag ?? null, bookingId: isMirror ? e.extendedProperties!.private!.daythreadBookingId : null },
        update: { calendarId, title: e.summary ?? null, startAt: start, endAt: end, allDay: Boolean(e.start?.date), status: e.status, transparent: e.transparency === "transparent", etag: e.etag ?? null, bookingId: isMirror ? e.extendedProperties!.private!.daythreadBookingId : null },
      });
      upserted++;
    }
    await saveCursor(integration.id, calendarId, result.nextSyncToken);
  }
  // Calendars that were deselected no longer block anything.
  await prisma.externalEvent.deleteMany({ where: { integrationId: integration.id, bookingId: null, calendarId: { notIn: settings.selected } } });
  return { ok: true, upserted, removed, fullResync };
}

async function syncAppleIn(integration: Integration, settings: CalendarSettings): Promise<SyncSummary> {
  const client = await caldavClientFor(integration);
  let upserted = 0;
  let removed = 0;
  for (const href of settings.selected) {
    const delta = await syncCollection(client, href, settings.cursors[href] ?? null).catch(() => null);
    const items = delta ? delta.changed : await caldavList(client, href, new Date(), addDays(new Date(), 90));
    for (const gone of delta?.removed ?? []) {
      const r = await prisma.externalEvent.deleteMany({ where: { integrationId: integration.id, externalId: { startsWith: gone } } });
      removed += r.count;
    }
    for (const item of items) {
      // A changed recurring event: replace its expanded occurrences.
      if (item.occurrences.length !== 1) await prisma.externalEvent.deleteMany({ where: { integrationId: integration.id, externalId: { startsWith: `${item.href}#` } } });
      for (const occ of item.occurrences) {
        const externalId = item.occurrences.length > 1 ? `${item.href}#${occ.start.toISOString()}` : item.href;
        await prisma.externalEvent.upsert({
          where: { integrationId_externalId: { integrationId: integration.id, externalId } },
          create: { businessId: integration.businessId, integrationId: integration.id, externalId, calendarId: href, title: item.summary, startAt: occ.start, endAt: occ.end, allDay: item.allDay, status: item.status, transparent: item.transparent, etag: item.etag, bookingId: item.bookingId },
          update: { title: item.summary, startAt: occ.start, endAt: occ.end, allDay: item.allDay, status: item.status, transparent: item.transparent, etag: item.etag, bookingId: item.bookingId },
        });
        upserted++;
      }
    }
    await saveCursor(integration.id, href, delta?.syncToken ?? null);
  }
  await prisma.externalEvent.deleteMany({ where: { integrationId: integration.id, bookingId: null, calendarId: { notIn: settings.selected } } });
  return { ok: true, upserted, removed };
}

/** Push one booking OUT to every connected calendar's booking calendar (create or update the mirror). */
export async function pushBookingToCalendars(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { client: true, service: true, business: true } });
  if (!booking) return;
  const integrations = await prisma.integration.findMany({ where: { businessId: booking.businessId, provider: { in: ["GOOGLE_CALENDAR", "APPLE_CALENDAR"] }, status: { in: ["CONNECTED", "SYNC_ERROR"] } } });
  for (const integration of integrations) {
    try {
      if (booking.status === "CANCELED") await removeMirror(integration, booking);
      else await upsertMirror(integration, booking);
    } catch (err) {
      await reportFailure("sync", "Calendar push failed for booking", { businessId: booking.businessId, provider: integration.provider, error: err, meta: { bookingId } });
      await prisma.integration.update({ where: { id: integration.id }, data: { lastSyncStatus: "failed", lastError: "Couldn't update the calendar — retry sync", lastErrorAt: new Date(), status: "SYNC_ERROR" } });
    }
  }
}

type FullBooking = Booking & { client: { name: string }; service: { name: string }; business: { name: string; timezone: string } };

async function upsertMirror(integration: Integration, booking: FullBooking) {
  const settings = readCalendarSettings(integration);
  const target = settings.bookingCalendar ?? settings.selected[0];
  if (!target) return; // nothing selected yet: nothing to mirror to
  const summary = `${booking.service.name} · ${booking.client.name}`;
  const description = `Booked through Daythread. Status: ${booking.status.toLowerCase().replaceAll("_", " ")}.`;
  if (integration.provider === "GOOGLE_CALENDAR") {
    const token = await calendarToken(integration);
    const input = { summary, description, location: booking.location, start: booking.startAt, end: booking.endAt, timeZone: booking.business.timezone, bookingId: booking.id };
    const existingId = booking.externalCalendarProvider === "GOOGLE_CALENDAR" ? booking.externalEventId : null;
    let event;
    if (existingId) {
      try {
        event = await updateEvent(token, target, existingId, input);
      } catch (err) {
        if (err instanceof GoogleApiError && (err.status === 404 || err.status === 410)) event = await createEvent(token, target, input);
        else throw err;
      }
    } else event = await createEvent(token, target, input);
    await prisma.booking.update({ where: { id: booking.id }, data: { externalEventId: event.id, externalCalendarProvider: "GOOGLE_CALENDAR" } });
    await prisma.externalEvent.upsert({
      where: { integrationId_externalId: { integrationId: integration.id, externalId: event.id } },
      create: { businessId: booking.businessId, integrationId: integration.id, externalId: event.id, calendarId: target, title: summary, startAt: booking.startAt, endAt: booking.endAt, status: "confirmed", bookingId: booking.id, etag: event.etag ?? null },
      update: { title: summary, startAt: booking.startAt, endAt: booking.endAt, status: "confirmed", bookingId: booking.id, etag: event.etag ?? null },
    });
  } else if (integration.provider === "APPLE_CALENDAR") {
    const client = await caldavClientFor(integration);
    const uid = `daythread-${booking.id}@daythread.org`;
    const href = booking.externalCalendarProvider === "APPLE_CALENDAR" && booking.externalEventId ? booking.externalEventId : `${target}${uid}.ics`;
    await caldavPut(client, href, buildVEvent({ uid, summary, description, location: booking.location, start: booking.startAt, end: booking.endAt, bookingId: booking.id }));
    await prisma.booking.update({ where: { id: booking.id }, data: { externalEventId: href, externalCalendarProvider: "APPLE_CALENDAR" } });
    await prisma.externalEvent.upsert({
      where: { integrationId_externalId: { integrationId: integration.id, externalId: href } },
      create: { businessId: booking.businessId, integrationId: integration.id, externalId: href, calendarId: target, title: summary, startAt: booking.startAt, endAt: booking.endAt, status: "confirmed", bookingId: booking.id },
      update: { title: summary, startAt: booking.startAt, endAt: booking.endAt, status: "confirmed", bookingId: booking.id },
    });
  }
}

async function removeMirror(integration: Integration, booking: FullBooking) {
  if (!booking.externalEventId || booking.externalCalendarProvider !== integration.provider) return;
  const settings = readCalendarSettings(integration);
  const target = settings.bookingCalendar ?? settings.selected[0] ?? "primary";
  if (integration.provider === "GOOGLE_CALENDAR") await deleteEvent(await calendarToken(integration), target, booking.externalEventId);
  else if (integration.provider === "APPLE_CALENDAR") await caldavDelete(await caldavClientFor(integration), booking.externalEventId);
  await prisma.externalEvent.deleteMany({ where: { integrationId: integration.id, externalId: booking.externalEventId } });
  await prisma.booking.update({ where: { id: booking.id }, data: { externalEventId: null, externalCalendarProvider: null } });
}

/** Discover calendars for a connected row (Google or Apple) and refresh `available`. */
export async function discoverCalendars(integration: Integration): Promise<CalendarChoice[]> {
  if (integration.provider === "GOOGLE_CALENDAR") {
    const token = await calendarToken(integration);
    const cals = await listCalendars(token);
    return cals.map((c) => ({ id: c.id, name: c.summary, primary: Boolean(c.primary), timeZone: c.timeZone ?? null, readOnly: !/owner|writer/.test(c.accessRole) }));
  }
  if (integration.provider === "APPLE_CALENDAR") {
    const { listCalendars: caldavCalendars } = await import("@/lib/caldav");
    const s = readCalendarSettings(integration);
    const client = await caldavClientFor(integration);
    const cals = await caldavCalendars(client, s.calendarHome ?? "/");
    return cals.map((c) => ({ id: c.href, name: c.name, readOnly: c.readOnly }));
  }
  return [];
}

/** Busy blocks from connected calendars that overlap a window — used by availability. */
export async function externalBusyBlocks(businessId: string, from: Date, to: Date): Promise<Array<{ startAt: Date; endAt: Date }>> {
  return prisma.externalEvent.findMany({
    where: { businessId, bookingId: null, transparent: false, status: { not: "cancelled" }, startAt: { lt: to }, endAt: { gt: from }, integration: { status: { in: ["CONNECTED", "SYNC_ERROR"] } } },
    select: { startAt: true, endAt: true },
  });
}
