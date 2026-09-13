"use server";

import { revalidatePath } from "next/cache";
import { requireRole, type SessionPayload } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { createMeetingForBooking, startLinkForBooking, removeMeetingForBooking } from "@/server/zoomMeetings";

/**
 * Video meetings on bookings. Staff only: a client portal login or a partner cannot make,
 * start or remove a meeting on the business's Zoom account. The workspace comes from the
 * session; the only thing taken from the browser is a booking id, validated for shape and
 * then looked up inside that workspace.
 */
const STAFF = ["OWNER", "ADMIN", "PHOTOGRAPHER"] as const;
const BOOKING_ID = /^[a-z0-9]{20,40}$/i;

export async function createZoomMeeting(bookingId: unknown, session?: SessionPayload | null): Promise<{ ok: true; joinUrl: string; created: boolean } | { ok: false; error: string }> {
  const ctx = await requireRole([...STAFF], session);
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (typeof bookingId !== "string" || !BOOKING_ID.test(bookingId)) return { ok: false, error: "That booking doesn't exist in this workspace." };
  try {
    // Each creation is a call on the business's own Zoom account. Bounded per workspace so a
    // script with a valid session cannot turn it into a meeting factory.
    await enforceRateLimit(`zoom-create:${ctx.business.id}`, { limit: 60, windowMs: 60 * 60 * 1000 });
  } catch {
    return { ok: false, error: "That's a lot of meetings in an hour. Try again later." };
  }
  const r = await createMeetingForBooking(ctx.business.id, bookingId);
  revalidatePath(`/dashboard/bookings/${bookingId}`);
  return r.ok ? { ok: true, joinUrl: r.joinUrl, created: r.created } : r;
}

export async function startZoomMeeting(bookingId: unknown, session?: SessionPayload | null): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const ctx = await requireRole([...STAFF], session);
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (typeof bookingId !== "string" || !BOOKING_ID.test(bookingId)) return { ok: false, error: "This booking has no Zoom meeting." };
  try {
    await enforceRateLimit(`zoom-start:${ctx.business.id}`, { limit: 120, windowMs: 60 * 60 * 1000 });
  } catch {
    return { ok: false, error: "Too many requests. Try again in a minute." };
  }
  return startLinkForBooking(ctx.business.id, bookingId);
}

export async function removeZoomMeeting(bookingId: unknown, session?: SessionPayload | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireRole([...STAFF], session);
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (typeof bookingId !== "string" || !BOOKING_ID.test(bookingId)) return { ok: false, error: "That booking doesn't exist in this workspace." };
  const r = await removeMeetingForBooking(ctx.business.id, bookingId, { reason: "removed" });
  revalidatePath(`/dashboard/bookings/${bookingId}`);
  return r;
}
