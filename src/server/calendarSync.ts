import { prisma } from "@/lib/db";
import { reportFailure } from "@/lib/observe";
import { listCalendars, listEvents, createEvent, updateEvent, deleteEvent, calendarToken, eventInstant, GoogleApiError } from "@/lib/googleCalendar";
import { caldavClientFor, listCalendarEvents as caldavList, putEvent as caldavPut, deleteEvent as caldavDelete, syncCollection } from "@/lib/caldav";
import { buildVEvent } from "@/lib/ics";
import type { Integration, Booking } from "@prisma/client";
import { addDays } from "date-fns";

/**
 * Source-of-truth rules
 *   - A Daythread booking is the truth for bookings. It is pushed OUT to the connected
 *     calendar as a mirror event (id stored on the booking). Editing the mirror on the
 *     calendar never changes the booking; the next push restores it.
 *   - The external calendar is the truth for the owner's other commitments. Those come IN
 *     as ExternalEvents and only affect availability (no booking is ever created from
 *     them). Mirror events are recognised by their marker and skipped, so a booking never
 *     blocks itself.
 *   - A failed sync leaves the last good state in place and is reported; the UI says
 *     "Sync issue", never "Synced".
 */
export type SyncSummary = { ok: boolean; upserted: number; removed: number; error?: string; fullResync?: boolean };

export async function syncCalendarIn(integration: Integration): Promise<SyncSummary> {
  const businessId = integration.businessId;
  const settings = (integration.settings as { calendarId?: string; calendarHref?: string; timeZone?: string } | null) ?? {};
  try {
    let summary: SyncSummary;
    if (integration.provider === "GOOGLE_CALENDAR") summary = await syncGoogleIn(integration, settings.calendarId ?? "primary");
    else if (integration.provider === "APPLE_CALENDAR") summary = await syncAppleIn(integration, settings.calendarHref ?? null);
    else return { ok: false, upserted: 0, removed: 0, error: "Not a calendar integration" };
    await prisma.integration.update({ where: { id: integration.id }, data: { lastSyncedAt: new Date(), lastSyncStatus: "ok", lastError: null, lastErrorAt: null, status: integration.status === "SYNC_ERROR" ? "CONNECTED" : integration.status } });
    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Calendar sync failed";
    const revoked = /invalid_grant|401|No refresh token|Unauthorized/i.test(message);
    await prisma.integration.update({ where: { id: integration.id }, data: { lastSyncStatus: "failed", lastError: revoked ? "Access was revoked — reconnect" : message.slice(0, 200), lastErrorAt: new Date(), status: revoked ? "NEEDS_ATTENTION" : "SYNC_ERROR" } });
    await reportFailure("sync", `${integration.provider} sync failed`, { businessId, provider: integration.provider, error: err });
    return { ok: false, upserted: 0, removed: 0, error: message };
  }
}

async function syncGoogleIn(integration: Integration, calendarId: string): Promise<SyncSummary> {
  const token = await calendarToken(integration);
  let result;
  let fullResync = false;
  try {
    result = await listEvents(token, calendarId, { syncToken: integration.syncCursor });
  } catch (err) {
    if (err instanceof GoogleApiError && err.status === 410) {
      // Sync token expired: Google asks for a full resync. Drop what we had for this calendar.
      fullResync = true;
      await prisma.externalEvent.deleteMany({ where: { integrationId: integration.id, calendarId, bookingId: null } });
      result = await listEvents(token, calendarId, {});
    } else throw err;
  }
  const calendars = integration.syncCursor && !fullResync ? null : await listCalendars(token).catch(() => null);
  const zone = calendars?.find((c) => c.id === calendarId || (calendarId === "primary" && c.primary))?.timeZone;
  let upserted = 0;
  let removed = 0;
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
      update: { title: e.summary ?? null, startAt: start, endAt: end, allDay: Boolean(e.start?.date), status: e.status, transparent: e.transparency === "transparent", etag: e.etag ?? null, bookingId: isMirror ? e.extendedProperties!.private!.daythreadBookingId : null },
    });
    upserted++;
  }
  if (result.nextSyncToken) await prisma.integration.update({ where: { id: integration.id }, data: { syncCursor: result.nextSyncToken } });
  return { ok: true, upserted, removed, fullResync };
}

async function syncAppleIn(integration: Integration, calendarHref: string | null): Promise<SyncSummary> {
  const client = await caldavClientFor(integration);
  if (!calendarHref) throw new Error("No calendar selected");
  let upserted = 0;
  let removed = 0;
  // sync-collection when we have a token; otherwise a 90-day window.
  const delta = await syncCollection(client, calendarHref, integration.syncCursor).catch(() => null);
  const items = delta ? delta.changed : await caldavList(client, calendarHref, new Date(), addDays(new Date(), 90));
  for (const href of delta?.removed ?? []) {
    const r = await prisma.externalEvent.deleteMany({ where: { integrationId: integration.id, externalId: href } });
    removed += r.count;
  }
  for (const item of items) {
    for (const occ of item.occurrences) {
      const externalId = item.occurrences.length > 1 ? `${item.href}#${occ.start.toISOString()}` : item.href;
      await prisma.externalEvent.upsert({
        where: { integrationId_externalId: { integrationId: integration.id, externalId } },
        create: { businessId: integration.businessId, integrationId: integration.id, externalId, calendarId: calendarHref, title: item.summary, startAt: occ.start, endAt: occ.end, allDay: item.allDay, status: item.status, transparent: item.transparent, etag: item.etag, bookingId: item.bookingId },
        update: { title: item.summary, startAt: occ.start, endAt: occ.end, allDay: item.allDay, status: item.status, transparent: item.transparent, etag: item.etag, bookingId: item.bookingId },
      });
      upserted++;
    }
  }
  if (delta?.syncToken) await prisma.integration.update({ where: { id: integration.id }, data: { syncCursor: delta.syncToken } });
  return { ok: true, upserted, removed };
}

/** Push one booking OUT to every connected calendar (create or update the mirror). */
export async function pushBookingToCalendars(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { client: true, service: true, business: true } });
  if (!booking) return;
  const integrations = await prisma.integration.findMany({ where: { businessId: booking.businessId, provider: { in: ["GOOGLE_CALENDAR", "APPLE_CALENDAR"] }, status: { in: ["CONNECTED", "SYNC_ERROR"] } } });
  for (const integration of integrations) {
    try {
      if (booking.status === "CANCELED") {
        await removeMirror(integration, booking);
        continue;
      }
      await upsertMirror(integration, booking);
    } catch (err) {
      await reportFailure("sync", `Calendar push failed for booking`, { businessId: booking.businessId, provider: integration.provider, error: err, meta: { bookingId } });
      await prisma.integration.update({ where: { id: integration.id }, data: { lastSyncStatus: "failed", lastError: "Couldn't update the calendar — retry sync", lastErrorAt: new Date(), status: "SYNC_ERROR" } });
    }
  }
}

type FullBooking = Booking & { client: { name: string }; service: { name: string }; business: { name: string; timezone: string } };

async function upsertMirror(integration: Integration, booking: FullBooking) {
  const settings = (integration.settings as { calendarId?: string; calendarHref?: string } | null) ?? {};
  const summary = `${booking.service.name} · ${booking.client.name}`;
  const description = `Booked through Daythread. Status: ${booking.status.toLowerCase().replaceAll("_", " ")}.`;
  if (integration.provider === "GOOGLE_CALENDAR") {
    const token = await calendarToken(integration);
    const calendarId = settings.calendarId ?? "primary";
    const input = { summary, description, location: booking.location, start: booking.startAt, end: booking.endAt, timeZone: booking.business.timezone, bookingId: booking.id };
    const existingId = booking.externalCalendarProvider === "GOOGLE_CALENDAR" ? booking.externalEventId : null;
    let event;
    if (existingId) {
      try {
        event = await updateEvent(token, calendarId, existingId, input);
      } catch (err) {
        if (err instanceof GoogleApiError && (err.status === 404 || err.status === 410)) event = await createEvent(token, calendarId, input);
        else throw err;
      }
    } else event = await createEvent(token, calendarId, input);
    await prisma.booking.update({ where: { id: booking.id }, data: { externalEventId: event.id, externalCalendarProvider: "GOOGLE_CALENDAR" } });
    await prisma.externalEvent.upsert({
      where: { integrationId_externalId: { integrationId: integration.id, externalId: event.id } },
      create: { businessId: booking.businessId, integrationId: integration.id, externalId: event.id, calendarId, title: summary, startAt: booking.startAt, endAt: booking.endAt, status: "confirmed", bookingId: booking.id, etag: event.etag ?? null },
      update: { title: summary, startAt: booking.startAt, endAt: booking.endAt, status: "confirmed", bookingId: booking.id, etag: event.etag ?? null },
    });
  } else if (integration.provider === "APPLE_CALENDAR") {
    const client = await caldavClientFor(integration);
    if (!settings.calendarHref) throw new Error("No Apple calendar selected");
    const uid = `daythread-${booking.id}@daythread.org`;
    const href = booking.externalCalendarProvider === "APPLE_CALENDAR" && booking.externalEventId ? booking.externalEventId : `${settings.calendarHref}${uid}.ics`;
    const ics = buildVEvent({ uid, summary, description, location: booking.location, start: booking.startAt, end: booking.endAt, bookingId: booking.id });
    await caldavPut(client, href, ics);
    await prisma.booking.update({ where: { id: booking.id }, data: { externalEventId: href, externalCalendarProvider: "APPLE_CALENDAR" } });
    await prisma.externalEvent.upsert({
      where: { integrationId_externalId: { integrationId: integration.id, externalId: href } },
      create: { businessId: booking.businessId, integrationId: integration.id, externalId: href, calendarId: settings.calendarHref, title: summary, startAt: booking.startAt, endAt: booking.endAt, status: "confirmed", bookingId: booking.id },
      update: { title: summary, startAt: booking.startAt, endAt: booking.endAt, status: "confirmed", bookingId: booking.id },
    });
  }
}

async function removeMirror(integration: Integration, booking: FullBooking) {
  if (!booking.externalEventId || booking.externalCalendarProvider !== integration.provider) return;
  const settings = (integration.settings as { calendarId?: string } | null) ?? {};
  if (integration.provider === "GOOGLE_CALENDAR") await deleteEvent(await calendarToken(integration), settings.calendarId ?? "primary", booking.externalEventId);
  else if (integration.provider === "APPLE_CALENDAR") await caldavDelete(await caldavClientFor(integration), booking.externalEventId);
  await prisma.externalEvent.deleteMany({ where: { integrationId: integration.id, externalId: booking.externalEventId } });
  await prisma.booking.update({ where: { id: booking.id }, data: { externalEventId: null, externalCalendarProvider: null } });
}

/** Busy blocks from connected calendars that overlap a window — used by availability. */
export async function externalBusyBlocks(businessId: string, from: Date, to: Date): Promise<Array<{ startAt: Date; endAt: Date }>> {
  return prisma.externalEvent.findMany({
    where: { businessId, bookingId: null, transparent: false, status: { not: "cancelled" }, startAt: { lt: to }, endAt: { gt: from }, integration: { status: { in: ["CONNECTED", "SYNC_ERROR"] } } },
    select: { startAt: true, endAt: true },
  });
}
