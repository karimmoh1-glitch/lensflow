import * as React from "react";
import { prisma } from "@/lib/db";

// React's per-request cache exists in the server runtime; outside it (tests, scripts) the
// function simply runs each time.
const perRequest: <T extends (...a: never[]) => unknown>(fn: T) => T = typeof (React as { cache?: unknown }).cache === "function" ? (React as unknown as { cache: <T>(fn: T) => T }).cache : (fn) => fn;
import { subHours } from "date-fns";

export type DigestItem = { key: string; count: number; label: string; href: string; tone: "accent" | "signal" | "success" | "neutral" };
export type AwayDigest = { since: Date; hoursAway: number; items: DigestItem[]; quotedCents: number; quotedCount: number };

/**
 * "While you were away": only what changed since this person last opened the app, and
 * only the changes that mean something — new people, people now waiting, follow-ups that
 * came due, bookings that landed or were confirmed, and the value of open opportunities.
 * Every line is a count from the record with a link to the exact list; nothing is a
 * projection. Skipped entirely for an absence under two hours.
 */
export async function getAwayDigest(businessId: string, since: Date | null, now = new Date()): Promise<AwayDigest | null> {
  if (!since) return null;
  const hoursAway = (now.getTime() - since.getTime()) / 3_600_000;
  if (hoursAway < 2) return null;
  const cap = subHours(now, 24 * 14);
  const from = since < cap ? cap : since;

  const [newPeople, waiting, followUpsDue, bookingsMade, bookingsConfirmed, openQuoted] = await Promise.all([
    prisma.conversation.count({ where: { businessId, category: "PRIORITY", archived: false, createdAt: { gte: from } } }),
    prisma.lead.count({ where: { businessId, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] }, respondedAt: null, lastInboundAt: { gte: from }, conversation: { archived: false, category: "PRIORITY" } } }),
    prisma.lead.count({ where: { businessId, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] }, followUpAt: { gte: from, lte: now }, conversation: { archived: false, category: "PRIORITY" } } }),
    prisma.booking.count({ where: { businessId, createdAt: { gte: from }, status: { not: "CANCELED" } } }),
    prisma.booking.count({ where: { businessId, updatedAt: { gte: from }, createdAt: { lt: from }, status: "CONFIRMED" } }),
    prisma.lead.aggregate({ where: { businessId, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] }, estimatedValueCents: { gt: 0 }, conversation: { archived: false, category: "PRIORITY" } }, _sum: { estimatedValueCents: true }, _count: { _all: true } }),
  ]);

  const items: DigestItem[] = [];
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  if (newPeople) items.push({ key: "new_people", count: newPeople, label: `${newPeople} new ${plural(newPeople, "person", "people")} wrote to you`, href: "/dashboard/inbox", tone: "accent" });
  if (waiting) items.push({ key: "waiting", count: waiting, label: `${waiting} ${plural(waiting, "lead is", "leads are")} waiting for a reply`, href: "/dashboard/inbox?filter=unanswered", tone: "accent" });
  if (followUpsDue) items.push({ key: "follow_ups", count: followUpsDue, label: `${followUpsDue} follow-${plural(followUpsDue, "up", "ups")} became due`, href: "/dashboard", tone: "signal" });
  if (bookingsMade) items.push({ key: "bookings", count: bookingsMade, label: `${bookingsMade} new ${plural(bookingsMade, "booking", "bookings")}`, href: "/dashboard/bookings", tone: "success" });
  if (bookingsConfirmed) items.push({ key: "confirmed", count: bookingsConfirmed, label: `${bookingsConfirmed} ${plural(bookingsConfirmed, "booking", "bookings")} confirmed`, href: "/dashboard/bookings", tone: "success" });
  if (items.length === 0) return null;
  return { since: from, hoursAway, items, quotedCents: openQuoted._sum.estimatedValueCents ?? 0, quotedCount: openQuoted._count._all };
}

/**
 * Records the visit, at most once every ten minutes, and returns the previous visit for the
 * digest. Wrapped in React's per-request cache so the layout (which records) and the Today
 * page (which reads) see the same "previous" value within one render — otherwise the page
 * would read the timestamp the layout had just written and never show a digest.
 */
export const touchLastActive = perRequest(async (membershipId: string): Promise<Date | null> => {
  const now = new Date();
  const row = await prisma.orgMembership.findUnique({ where: { id: membershipId }, select: { lastActiveAt: true } });
  const prev = row?.lastActiveAt ?? null;
  if (!prev || now.getTime() - prev.getTime() > 10 * 60_000) {
    await prisma.orgMembership.update({ where: { id: membershipId }, data: { lastActiveAt: now } }).catch(() => {});
  }
  return prev;
});
