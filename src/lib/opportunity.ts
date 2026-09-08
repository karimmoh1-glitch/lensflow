import { differenceInCalendarDays } from "date-fns";
import type { MessageCategory } from "./classifyMessage";
import { leadAttention, type AttentionItem } from "./attention";

/**
 * What a conversation is worth to the business, and why — read off the record, never
 * scored by a model. The inbox sorts Priority by it, the row and the rail say the reason
 * in words, and People uses the same reading, so every surface agrees.
 *
 * Nothing here is a probability. `rank` orders; `reason` is the fact the rank rests on,
 * written so the owner can check it against the thread in a glance.
 */
export type SenderKind = "HUMAN" | "AUTOMATED" | "UNKNOWN";

/** Who is on the other end, from the classification the record already carries. */
export function senderKind(category: MessageCategory | string | null | undefined): SenderKind {
  switch (category) {
    case "PRIORITY":
      return "HUMAN";
    case "AUTOMATED":
    case "PROMOTIONAL":
    case "SPAM":
      return "AUTOMATED";
    case "VENDOR":
    case "INTERNAL":
      // People, but not customers: a platform, a supplier, a teammate.
      return "UNKNOWN";
    default:
      return "UNKNOWN";
  }
}

export type OpportunityKind = "client" | "potential_client" | "contact" | "automated" | "unknown";

export type OpportunityInput = {
  category: MessageCategory | string | null | undefined;
  relationship?: "LEAD" | "CUSTOMER" | "CONTACT" | null;
  lead?: {
    status: string;
    intent?: string | null;
    respondedAt: Date | null;
    lastInboundAt: Date | null;
    followUpAt: Date | null;
    createdAt: Date;
    serviceName?: string | null;
    requestedDateText?: string | null;
    requestedLocation?: string | null;
    budgetCents?: number | null;
    estimatedValueCents?: number | null;
  } | null;
  /** The last message in the thread is theirs. */
  lastWordIsTheirs: boolean;
  lastInboundAt?: Date | null;
  hasUpcomingBooking?: boolean;
  upcomingUnconfirmed?: boolean;
  archived?: boolean;
  now?: Date;
};

export type Opportunity = {
  kind: OpportunityKind;
  /** "Potential client", "Client", "Contact", "Automated" */
  label: string;
  /** Higher first. 0 means it does not belong in Priority at all. */
  rank: number;
  /** One sentence: why this is here. Empty for things that are not. */
  reason: string;
  /** The attention rule, when one applies. */
  attention: AttentionItem | null;
  /** Facts read from the lead, in display order. Never guessed. */
  facts: { label: string; value: string }[];
  nextAction: { kind: "reply" | "follow_up" | "book" | "confirm" | "view"; label: string } | null;
};

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/**
 * "in September", "at noon", "next weekend": the rule extractor's location pattern can
 * catch a time as a place. A fact that reads as a date or a time is never shown as one.
 */
export function looksLikeTime(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.trim().toLowerCase();
  return /^(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/.test(t)
    || /^(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?\b/.test(t)
    || /^(next|this|last|tomorrow|today|tonight|noon|midnight|morning|afternoon|evening|night|weekend|week|month|year|spring|summer|fall|autumn|winter)\b/.test(t)
    || /^\d{1,2}(:\d{2})?\s*(am|pm)?$/.test(t)
    || /^\d{1,2}\/\d{1,2}/.test(t);
}

export function readOpportunity(i: OpportunityInput): Opportunity {
  const now = i.now ?? new Date();
  const kindOfSender = senderKind(i.category);

  if (i.archived || kindOfSender === "AUTOMATED") {
    return { kind: "automated", label: "Automated", rank: 0, reason: "", attention: null, facts: [], nextAction: null };
  }
  if (kindOfSender === "UNKNOWN") {
    return { kind: "contact", label: i.category === "INTERNAL" ? "Your team" : "Contact", rank: 0, reason: "", attention: null, facts: [], nextAction: null };
  }

  const lead = i.lead ?? null;
  const facts: Opportunity["facts"] = [];
  if (lead?.serviceName) facts.push({ label: "Service", value: lead.serviceName });
  if (lead?.requestedDateText) facts.push({ label: "When", value: lead.requestedDateText });
  if (lead?.requestedLocation && !looksLikeTime(lead.requestedLocation)) facts.push({ label: "Where", value: lead.requestedLocation });
  if (lead?.budgetCents) facts.push({ label: "Budget", value: money(lead.budgetCents) });

  const attention = lead
    ? leadAttention(
        {
          status: lead.status,
          respondedAt: lead.respondedAt,
          lastInboundAt: lead.lastInboundAt,
          followUpAt: lead.followUpAt,
          createdAt: lead.createdAt,
          hasService: Boolean(lead.serviceName),
          hasDate: Boolean(lead.requestedDateText),
          hidden: false,
          hasUpcomingBooking: Boolean(i.hasUpcomingBooking),
        },
        now
      )
    : null;

  const isClient = i.relationship === "CUSTOMER" || Boolean(i.hasUpcomingBooking) || lead?.status === "BOOKED";
  const asked = facts.length > 0;
  const intentHigh = lead?.intent === "HIGH";
  const intentMedium = lead?.intent === "MEDIUM";
  const waiting = i.lastWordIsTheirs;
  const freshDays = lead ? differenceInCalendarDays(now, lead.createdAt) : null;

  // Rank: who is waiting on you and what they asked for decide the order; nothing else
  // moves it. Each term is one fact, so the reason below can name the ones that fired.
  let rank = 10; // a real person writing to the business
  if (isClient) rank += 15;
  if (attention?.kind === "waiting_reply") rank += 40;
  if (attention?.kind === "follow_up_due") rank += 30;
  if (attention?.kind === "follow_up_suggested") rank += 20;
  if (i.upcomingUnconfirmed) rank += 25;
  if (intentHigh) rank += 20;
  else if (intentMedium) rank += 12;
  if (asked) rank += 8;
  if (lead?.estimatedValueCents && lead.estimatedValueCents >= 50_000) rank += 6;
  if (freshDays !== null && freshDays <= 2) rank += 4;
  if (!waiting && !attention && !i.upcomingUnconfirmed && !asked && !intentHigh && !intentMedium) rank = isClient ? 12 : 8;

  // Reason: the strongest fact, in words the thread will bear out.
  const what =
    lead?.serviceName && lead?.requestedDateText ? `asked about ${lead.serviceName} for ${lead.requestedDateText}`
    : lead?.serviceName ? `asked about ${lead.serviceName}`
    : lead?.requestedDateText ? `asked about ${lead.requestedDateText}`
    : intentHigh ? "wants to book"
    : intentMedium ? "asked about pricing or availability"
    : null;
  let reason: string;
  if (i.upcomingUnconfirmed) reason = "Booking on the calendar that isn't confirmed yet.";
  else if (attention?.kind === "waiting_reply") reason = what ? `${cap(what)} and is waiting for your reply.` : "Waiting for your reply.";
  else if (attention?.kind === "follow_up_due") reason = "Follow-up due today.";
  else if (attention?.kind === "follow_up_suggested") reason = what ? `${cap(what)}; your reply went unanswered.` : "Your reply went unanswered.";
  else if (isClient && what) reason = `Client — ${what}.`;
  else if (isClient) reason = "A client writing to you.";
  else if (what) reason = `${cap(what)}.`;
  else reason = "A person writing to you.";

  const nextAction: Opportunity["nextAction"] =
    i.upcomingUnconfirmed ? { kind: "confirm", label: "Confirm booking" }
    : attention?.kind === "waiting_reply" ? { kind: "reply", label: "Reply" }
    : attention?.kind === "follow_up_due" || attention?.kind === "follow_up_suggested" ? { kind: "follow_up", label: "Follow up" }
    : intentHigh && !isClient ? { kind: "book", label: "Find a time" }
    : { kind: "view", label: "Open" };

  return {
    kind: isClient ? "client" : "potential_client",
    label: isClient ? "Client" : "Potential client",
    rank,
    reason,
    attention,
    facts,
    nextAction,
  };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * A summary of one message written from the rules alone: the first sentence or two, plus
 * whatever the deterministic extractor read. Honest, never a model's words, and always
 * available — the fallback when there is no model, when it is switched off, or when it
 * fails.
 */
export function summarizeMessageByRules(cleanText: string, extracted: { serviceHint: string | null; dateText: string | null; location: string | null; budgetCents: number | null; intent: string }): string {
  const oneLine = cleanText.replace(/\s+/g, " ").trim();
  if (!oneLine) return "Nothing important to act on.";
  const sentences = oneLine.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [oneLine];
  let lead = sentences.slice(0, 2).join(" ");
  if (lead.length > 220) lead = lead.slice(0, 217).trimEnd() + "…";
  const details: string[] = [];
  if (extracted.serviceHint) details.push(extracted.serviceHint);
  if (extracted.dateText) details.push(extracted.dateText);
  if (extracted.location && !looksLikeTime(extracted.location)) details.push(extracted.location);
  if (extracted.budgetCents) details.push(`budget ${money(extracted.budgetCents)}`);
  const ask = extracted.intent === "HIGH" ? " Wants to book." : extracted.intent === "MEDIUM" ? " Asking about pricing or availability." : "";
  return `${lead}${details.length ? ` Mentions: ${details.join(", ")}.` : ""}${ask}`.trim();
}
