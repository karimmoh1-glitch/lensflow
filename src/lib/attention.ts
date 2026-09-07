import { differenceInCalendarDays } from "date-fns";

/**
 * What needs the owner's attention, and why — in plain rules a person can check against
 * the thread. Nothing here is a score or a guess: every item names the fact it rests on
 * (who wrote last and when, a reminder they set, a booking that isn't confirmed).
 *
 * False positives cost trust; false negatives cost customers. So: a person is "waiting"
 * only when their message is the last word; a follow-up is suggested only after the
 * business's own reply has gone unanswered for FOLLOW_UP_AFTER_DAYS, and never when the
 * owner has already planned one or the person has a booking coming up.
 */
export const FOLLOW_UP_AFTER_DAYS = 3;
export const CONFIRM_WITHIN_DAYS = 3;

export type AttentionKind = "waiting_reply" | "follow_up_due" | "follow_up_suggested" | "confirm_booking";
export type AttentionItem = { kind: AttentionKind; label: string; why: string; /** lower first */ rank: number; since: Date };

export type LeadFacts = {
  status: string; // LeadStatus
  respondedAt: Date | null;
  lastInboundAt: Date | null;
  followUpAt: Date | null;
  createdAt: Date;
  hasService: boolean;
  hasDate: boolean;
  /** The conversation is archived, or classified as something other than a person. */
  hidden: boolean;
  hasUpcomingBooking: boolean;
};

const agoFrom = (d: Date, now: Date) => {
  const days = differenceInCalendarDays(now, d);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
};

export function leadAttention(f: LeadFacts, now = new Date()): AttentionItem | null {
  if (f.hidden) return null;
  if (f.status === "BOOKED" || f.status === "LOST" || f.status === "COLD") return null;
  const asked = f.hasService || f.hasDate ? " They asked about a booking." : "";

  // Their message is the last word.
  if (f.lastInboundAt && (!f.respondedAt || f.respondedAt < f.lastInboundAt)) {
    return { kind: "waiting_reply", label: "Waiting for your reply", why: `They wrote ${agoFrom(f.lastInboundAt, now)}; nothing has gone back yet.${asked}`, rank: 1, since: f.lastInboundAt };
  }
  // A reminder the owner set has come due.
  if (f.followUpAt && f.followUpAt <= now) {
    return { kind: "follow_up_due", label: "Follow-up due", why: `You asked to be reminded ${agoFrom(f.followUpAt, now)}.${asked}`, rank: 2, since: f.followUpAt };
  }
  // The owner planned a follow-up for later: nothing to do yet.
  if (f.followUpAt && f.followUpAt > now) return null;
  // The business replied, and silence followed for long enough to be worth a nudge.
  if (f.respondedAt && !f.hasUpcomingBooking) {
    const days = differenceInCalendarDays(now, f.respondedAt);
    if (days >= FOLLOW_UP_AFTER_DAYS) {
      return { kind: "follow_up_suggested", label: "Follow up", why: `You replied ${days} days ago; they haven't answered.${asked}`, rank: 3, since: f.respondedAt };
    }
  }
  return null;
}

export type BookingFacts = { status: string; startAt: Date; label: string };

/** A booking within CONFIRM_WITHIN_DAYS that the customer hasn't confirmed. */
export function bookingAttention(b: BookingFacts, now = new Date()): AttentionItem | null {
  if (b.status !== "BOOKED" && b.status !== "INQUIRY") return null;
  if (b.startAt < now) return null;
  const days = differenceInCalendarDays(b.startAt, now);
  if (days > CONFIRM_WITHIN_DAYS) return null;
  return { kind: "confirm_booking", label: "Confirm booking", why: `${b.label} is ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`} and isn't confirmed yet.`, rank: 2, since: b.startAt };
}

/** Oldest wait first within a rank; replies before reminders before nudges. */
export function sortAttention<T extends { item: AttentionItem }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.item.rank - b.item.rank || a.item.since.getTime() - b.item.since.getTime());
}

