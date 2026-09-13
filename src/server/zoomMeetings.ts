import { prisma } from "@/lib/db";
import { OAuthError } from "@/lib/integrations/oauth";
import { zoomToken, createZoomMeeting, updateZoomMeeting, deleteZoomMeeting, zoomStartUrl, userFacingZoomError, ZOOM_MEETING_ID } from "@/lib/zoom";
import { pushBookingToCalendars } from "@/server/calendarSync";
import { reportFailure } from "@/lib/observe";
import { recordAudit } from "@/server/audit";

/**
 * A Zoom meeting belonging to a Daythread booking. Every function here takes the
 * workspace id from the caller's authenticated context and the booking id from the
 * browser, and the booking is only ever found by both — so an id from another workspace
 * matches nothing, and the Zoom connection used is always this workspace's own.
 *
 * Meetings are created once per booking, however many times Create is pressed: the
 * booking row is claimed before Zoom is called, so a second click, a second tab or a
 * retried request finds the claim and is told about the meeting rather than making
 * another. The claim is released if Zoom refuses, and a claim abandoned by a crash is
 * reclaimed after two minutes.
 *
 * The join link is stored and put in the booking's location, so it reaches the client and
 * every connected calendar the existing way. The host's start link is never stored: it
 * works as a credential, so it is fetched from Zoom when the host presses Start.
 */
export type MeetingResult =
  | { ok: true; meetingId: string; joinUrl: string; created: boolean }
  | { ok: false; error: string };

const CLAIM_TTL_MS = 2 * 60_000;

async function connectionFor(businessId: string) {
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "ZOOM" } } });
  if (!row || row.status === "NOT_CONNECTED" || !row.refreshToken) return null;
  return row;
}

async function markNeedsAttention(integrationId: string, err: unknown) {
  if (!(err instanceof OAuthError) || !(err.revoked || err.code === "no_refresh_token")) return;
  await prisma.integration.update({ where: { id: integrationId }, data: { status: "NEEDS_ATTENTION", lastError: "Zoom needs reconnecting.", lastErrorAt: new Date() } }).catch(() => {});
}

export async function createMeetingForBooking(businessId: string, bookingId: string): Promise<MeetingResult> {
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, businessId }, include: { service: true, client: true, business: { select: { name: true, timezone: true } } } });
  if (!booking) return { ok: false, error: "That booking doesn't exist in this workspace." };
  if (booking.status === "CANCELED") return { ok: false, error: "This booking is canceled." };
  if (booking.endAt < new Date()) return { ok: false, error: "This booking is already over." };
  if (booking.meetingProvider === "ZOOM" && booking.meetingExternalId && booking.meetingJoinUrl) {
    return { ok: true, meetingId: booking.meetingExternalId, joinUrl: booking.meetingJoinUrl, created: false };
  }
  if (booking.meetingProvider && booking.meetingProvider !== "ZOOM") return { ok: false, error: "This booking already has a meeting from another provider." };

  const connection = await connectionFor(businessId);
  if (!connection) return { ok: false, error: "Connect Zoom under Settings → Integrations first." };

  // Claim the booking. Only one caller wins; everyone else is told what exists.
  const staleBefore = new Date(Date.now() - CLAIM_TTL_MS);
  const claim = await prisma.booking.updateMany({
    where: { id: booking.id, businessId, OR: [{ meetingProvider: null }, { meetingProvider: "ZOOM", meetingExternalId: null, updatedAt: { lt: staleBefore } }] },
    data: { meetingProvider: "ZOOM", meetingExternalId: null, meetingJoinUrl: null },
  });
  if (claim.count === 0) {
    const now = await prisma.booking.findFirst({ where: { id: booking.id, businessId }, select: { meetingExternalId: true, meetingJoinUrl: true } });
    if (now?.meetingExternalId && now.meetingJoinUrl) return { ok: true, meetingId: now.meetingExternalId, joinUrl: now.meetingJoinUrl, created: false };
    return { ok: false, error: "A meeting is already being created for this booking. Refresh in a moment." };
  }

  try {
    const token = await zoomToken(connection);
    const meeting = await createZoomMeeting(token, {
      topic: `${booking.service.name} · ${booking.client.name}`,
      startTime: booking.startAt,
      durationMins: Math.round((booking.endAt.getTime() - booking.startAt.getTime()) / 60_000),
      timezone: booking.business.timezone,
      agenda: `${booking.business.name}`,
    });
    await prisma.booking.updateMany({
      where: { id: booking.id, businessId },
      // The join link becomes the location only when there was none, so an address the
      // business typed is never overwritten.
      data: { meetingExternalId: meeting.id, meetingJoinUrl: meeting.joinUrl, ...(booking.location ? {} : { location: meeting.joinUrl }) },
    });
    await recordAudit({ businessId, action: "booking.meeting_created", targetType: "booking", targetId: booking.id, metadata: { provider: "ZOOM" } });
    await pushBookingToCalendars(booking.id).catch(() => {});
    return { ok: true, meetingId: meeting.id, joinUrl: meeting.joinUrl, created: true };
  } catch (err) {
    await prisma.booking.updateMany({ where: { id: booking.id, businessId, meetingProvider: "ZOOM", meetingExternalId: null }, data: { meetingProvider: null } });
    await markNeedsAttention(connection.id, err);
    await reportFailure("sync", "Zoom meeting create failed", { businessId, provider: "ZOOM", error: err, level: "warn" });
    return { ok: false, error: userFacingZoomError(err) };
  }
}

/** The host's start link, fresh from Zoom. Never stored and never logged. */
export async function startLinkForBooking(businessId: string, bookingId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, businessId }, select: { meetingProvider: true, meetingExternalId: true } });
  if (!booking?.meetingExternalId || booking.meetingProvider !== "ZOOM" || !ZOOM_MEETING_ID.test(booking.meetingExternalId)) return { ok: false, error: "This booking has no Zoom meeting." };
  const connection = await connectionFor(businessId);
  if (!connection) return { ok: false, error: "Zoom isn't connected any more. Reconnect it to start this meeting." };
  try {
    return { ok: true, url: await zoomStartUrl(await zoomToken(connection), booking.meetingExternalId) };
  } catch (err) {
    await markNeedsAttention(connection.id, err);
    return { ok: false, error: userFacingZoomError(err) };
  }
}

/** Cancel the meeting at Zoom and forget it here. A meeting Zoom already lost counts as gone. */
export async function removeMeetingForBooking(businessId: string, bookingId: string, opts: { reason?: "canceled" | "removed" } = {}): Promise<{ ok: true } | { ok: false; error: string }> {
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, businessId }, select: { id: true, meetingProvider: true, meetingExternalId: true, meetingJoinUrl: true, location: true } });
  if (!booking) return { ok: false, error: "That booking doesn't exist in this workspace." };
  if (booking.meetingProvider !== "ZOOM" || !booking.meetingExternalId) return { ok: true };
  const connection = await connectionFor(businessId);
  if (connection) {
    try {
      await deleteZoomMeeting(await zoomToken(connection), booking.meetingExternalId);
    } catch (err) {
      await markNeedsAttention(connection.id, err);
      // A booking that is being canceled is canceled regardless; say so only when the
      // owner asked to remove the meeting and Zoom refused.
      if (opts.reason !== "canceled") return { ok: false, error: userFacingZoomError(err) };
      await reportFailure("sync", "Zoom meeting delete failed on cancel", { businessId, provider: "ZOOM", error: err, level: "warn" });
    }
  }
  await prisma.booking.updateMany({
    where: { id: booking.id, businessId },
    data: { meetingProvider: null, meetingExternalId: null, meetingJoinUrl: null, ...(booking.location && booking.location === booking.meetingJoinUrl ? { location: null } : {}) },
  });
  await recordAudit({ businessId, action: "booking.meeting_removed", targetType: "booking", targetId: booking.id, metadata: { provider: "ZOOM", reason: opts.reason ?? "removed" } });
  return { ok: true };
}

/** A booking moved: the meeting moves with it. A failure is recorded, never fatal to the move. */
export async function moveMeetingForBooking(businessId: string, bookingId: string): Promise<void> {
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, businessId }, select: { startAt: true, endAt: true, meetingProvider: true, meetingExternalId: true, business: { select: { timezone: true } } } });
  if (!booking || booking.meetingProvider !== "ZOOM" || !booking.meetingExternalId) return;
  const connection = await connectionFor(businessId);
  if (!connection) return;
  try {
    await updateZoomMeeting(await zoomToken(connection), booking.meetingExternalId, { startTime: booking.startAt, durationMins: Math.round((booking.endAt.getTime() - booking.startAt.getTime()) / 60_000), timezone: booking.business.timezone });
  } catch (err) {
    await markNeedsAttention(connection.id, err);
    await reportFailure("sync", "Zoom meeting move failed", { businessId, provider: "ZOOM", error: err, level: "warn" });
  }
}
