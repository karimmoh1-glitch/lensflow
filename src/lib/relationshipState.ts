/**
 * Where we stand with a person — derived, never stored.
 *
 * The state is read off the actual record: leads, bookings, payments, who wrote last and
 * when. Nothing here is a pipeline stage someone drags a card into; it changes because the
 * relationship changed. Each state carries the sentence the profile shows and the next
 * action that follows from it.
 */
export type RelationshipState =
  | "NEW_INQUIRY"
  | "CONTACTED"
  | "QUALIFIED"
  | "PROPOSAL_SENT"
  | "WAITING_ON_THEM"
  | "WAITING_ON_YOU"
  | "BOOKED"
  | "CUSTOMER"
  | "COMPLETED"
  | "FOLLOW_UP"
  | "DORMANT"
  | "CONTACT";

export type RelationshipInput = {
  relationship: "LEAD" | "CUSTOMER" | "CONTACT";
  lead?: { status: string; respondedAt: Date | null; lastInboundAt: Date | null; createdAt: Date; hasService: boolean; hasDate: boolean } | null;
  lastInbound: Date | null;
  lastOutbound: Date | null;
  lastOutboundWasProposal?: boolean; // the last thing you sent quoted a price or a booking link
  upcomingBooking: { startAt: Date; label: string; status: string } | null;
  lastCompletedBooking: { startAt: Date; label: string } | null;
  outstandingCents: number;
  paidCents: number;
  now?: Date;
};

export type RelationshipRead = {
  state: RelationshipState;
  label: string; // "Waiting on you"
  standing: string; // "Sarah replied yesterday and is waiting on you."
  nextAction: { label: string; why: string } | null;
  tone: "signal" | "thinking" | "outcome" | "neutral" | "warning";
  /** What they're waiting for from you, if anything. */
  theyWaitFor: string | null;
  /** What you're waiting for from them, if anything. */
  youWaitFor: string | null;
};

const DAY = 86_400_000;

export function readRelationship(i: RelationshipInput): RelationshipRead {
  const base = readCore(i);
  return { ...base, ...waiting(base.state, i) };
}

function waiting(state: RelationshipState, i: RelationshipInput): { theyWaitFor: string | null; youWaitFor: string | null } {
  switch (state) {
    case "NEW_INQUIRY":
      return { theyWaitFor: "Your first reply", youWaitFor: null };
    case "WAITING_ON_YOU":
      return { theyWaitFor: "Your reply", youWaitFor: null };
    case "CONTACTED":
    case "QUALIFIED":
      return { theyWaitFor: null, youWaitFor: "Their answer" };
    case "PROPOSAL_SENT":
      return { theyWaitFor: null, youWaitFor: "A yes on your proposal" };
    case "FOLLOW_UP":
      return { theyWaitFor: null, youWaitFor: "Their answer — it's been a week" };
    case "BOOKED":
      return i.outstandingCents > 0
        ? { theyWaitFor: null, youWaitFor: `$${(i.outstandingCents / 100).toLocaleString()} still owed` }
        : i.upcomingBooking && (i.upcomingBooking.status === "BOOKED" || i.upcomingBooking.status === "INQUIRY")
          ? { theyWaitFor: "Your confirmation", youWaitFor: null }
          : { theyWaitFor: "The session details", youWaitFor: null };
    case "COMPLETED":
      return i.outstandingCents > 0 ? { theyWaitFor: null, youWaitFor: `$${(i.outstandingCents / 100).toLocaleString()} still owed` } : { theyWaitFor: "Their photos or deliverables", youWaitFor: null };
    default:
      return { theyWaitFor: null, youWaitFor: null };
  }
}

type CoreRead = Omit<RelationshipRead, "theyWaitFor" | "youWaitFor">;

function readCore(i: RelationshipInput): CoreRead {
  const now = i.now ?? new Date();
  const daysSince = (d: Date | null) => (d ? (now.getTime() - d.getTime()) / DAY : Infinity);
  const theyWroteLast = Boolean(i.lastInbound && (!i.lastOutbound || i.lastInbound > i.lastOutbound));
  const youWroteLast = Boolean(i.lastOutbound && (!i.lastInbound || i.lastOutbound > i.lastInbound));
  const quiet = Math.min(daysSince(i.lastInbound), daysSince(i.lastOutbound));

  if (i.relationship === "CONTACT") {
    return { state: "CONTACT", label: "Contact", standing: "Someone you know, not a customer.", nextAction: null, tone: "neutral" };
  }

  // Money outstanding beats everything else once there is a booking.
  if (i.outstandingCents > 0 && (i.upcomingBooking || i.lastCompletedBooking)) {
    return {
      state: i.upcomingBooking ? "BOOKED" : "COMPLETED",
      label: i.upcomingBooking ? "Booked" : "Completed",
      standing: i.upcomingBooking ? `${i.upcomingBooking.label} is on the calendar. A balance is still outstanding.` : "The session is done. A balance is still outstanding.",
      nextAction: { label: `Collect $${(i.outstandingCents / 100).toLocaleString()}`, why: i.upcomingBooking ? "Due before the session" : "Still owed after the session" },
      tone: "warning",
    };
  }

  if (i.upcomingBooking) {
    const days = Math.ceil((i.upcomingBooking.startAt.getTime() - now.getTime()) / DAY);
    const unconfirmed = i.upcomingBooking.status === "BOOKED" || i.upcomingBooking.status === "INQUIRY";
    return {
      state: "BOOKED",
      label: unconfirmed ? "Booked · unconfirmed" : "Booked",
      standing: `${i.upcomingBooking.label} ${days <= 0 ? "is today" : days === 1 ? "is tomorrow" : `is in ${days} days`}${unconfirmed ? " and isn't confirmed yet" : ""}.`,
      nextAction: theyWroteLast
        ? { label: "Reply — they wrote last", why: `Waiting ${humanAgo(i.lastInbound!, now)}` }
        : unconfirmed
          ? { label: "Confirm the booking", why: "A confirmed date is a kept date" }
          : days <= 2
            ? { label: "Send the details", why: "Where to meet, what to bring" }
            : null,
      tone: theyWroteLast ? "signal" : "outcome",
    };
  }

  if (i.relationship === "CUSTOMER") {
    if (theyWroteLast) {
      return { state: "WAITING_ON_YOU", label: "Waiting on you", standing: `They wrote ${humanAgo(i.lastInbound!, now)} and haven't heard back.`, nextAction: { label: "Reply", why: "A customer is waiting" }, tone: "signal" };
    }
    if (i.lastCompletedBooking && daysSince(i.lastCompletedBooking.startAt) <= 14) {
      return { state: "COMPLETED", label: "Just wrapped", standing: `${i.lastCompletedBooking.label} was ${humanAgo(i.lastCompletedBooking.startAt, now)}.`, nextAction: { label: "Follow up", why: "Deliver, thank, ask for a referral" }, tone: "outcome" };
    }
    if (quiet > 90) {
      return { state: "DORMANT", label: "Dormant", standing: `Nothing since ${humanAgo(i.lastInbound ?? i.lastOutbound ?? i.lastCompletedBooking?.startAt ?? now, now)}.`, nextAction: { label: "Reach out", why: "A past customer is the easiest booking" }, tone: "neutral" };
    }
    return { state: "CUSTOMER", label: "Customer", standing: `$${(i.paidCents / 100).toLocaleString()} paid to date. Nothing open.`, nextAction: null, tone: "outcome" };
  }

  // Leads.
  const lead = i.lead;
  if (lead?.status === "LOST") {
    return { state: "DORMANT", label: "Didn't book", standing: "Marked lost.", nextAction: null, tone: "neutral" };
  }
  if (theyWroteLast) {
    const first = !i.lastOutbound;
    return {
      state: first ? "NEW_INQUIRY" : "WAITING_ON_YOU",
      label: first ? "New inquiry" : "Waiting on you",
      standing: first ? `Wrote ${humanAgo(i.lastInbound!, now)}. No reply yet.` : `Replied ${humanAgo(i.lastInbound!, now)} and is waiting on you.`,
      nextAction: { label: "Reply", why: first ? "First replies win bookings" : "Keep the thread moving" },
      tone: "signal",
    };
  }
  if (youWroteLast) {
    const days = daysSince(i.lastOutbound);
    if (days > 7) {
      return { state: "FOLLOW_UP", label: "Follow-up needed", standing: `You wrote ${humanAgo(i.lastOutbound!, now)}. No answer.`, nextAction: { label: "Follow up", why: "One nudge recovers most quiet leads" }, tone: "warning" };
    }
    return {
      state: i.lastOutboundWasProposal ? "PROPOSAL_SENT" : lead?.hasService && lead?.hasDate ? "QUALIFIED" : "CONTACTED",
      label: i.lastOutboundWasProposal ? "Proposal sent" : lead?.hasService && lead?.hasDate ? "Qualified" : "Contacted",
      standing: `You replied ${humanAgo(i.lastOutbound!, now)}. Waiting on them.`,
      nextAction: days >= 3 ? { label: "Nudge", why: "Three days is long enough" } : null,
      tone: "thinking",
    };
  }
  return { state: "NEW_INQUIRY", label: "New", standing: "No messages yet.", nextAction: null, tone: "neutral" };
}

export function humanAgo(d: Date, now = new Date()): string {
  const ms = now.getTime() - d.getTime();
  if (ms < 0) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const days = Math.floor(h / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
