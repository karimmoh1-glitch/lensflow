import { differenceInCalendarDays } from "date-fns";
import type { AttentionKind } from "./attention";

/**
 * The next best action: one vocabulary for "what should I do", shared by Today, the
 * assistant's answers and the agent's proposals, so they never disagree about who is
 * waiting or what a person is worth.
 *
 * Every row rests on an attention rule (src/lib/attention.ts) — a fact a person can check
 * against the thread — plus the money that is actually on the record. Nothing is a score.
 */
export type ValueBasis = "quoted" | "budget" | "service";

export type Value = {
  cents: number;
  basis: ValueBasis;
  /** Known money is what went out or what they said; a service price is an estimate. */
  known: boolean;
  /** "Quoted $500" · "Their budget: $500" · "About $350, the service's price" */
  label: string;
};

export const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/** The most honest number available, and what it rests on. A quote that went out beats a budget they named beats a list price. */
export function readValue(i: { quotedCents?: number | null; budgetCents?: number | null; servicePriceCents?: number | null; estimatedValueCents?: number | null }): Value | null {
  if (i.quotedCents && i.quotedCents > 0) return { cents: i.quotedCents, basis: "quoted", known: true, label: `Quoted ${money(i.quotedCents)}` };
  if (i.budgetCents && i.budgetCents > 0) return { cents: i.budgetCents, basis: "budget", known: true, label: `Their budget: ${money(i.budgetCents)}` };
  const service = i.servicePriceCents && i.servicePriceCents > 0 ? i.servicePriceCents : i.estimatedValueCents && i.estimatedValueCents > 0 ? i.estimatedValueCents : null;
  if (service) return { cents: service, basis: "service", known: false, label: `About ${money(service)}, the service's price` };
  return null;
}

export type NextActionKind = "reply" | "follow_up" | "confirm_booking";

export type NextAction = {
  /** `lead:<id>` or `booking:<id>` — stable across reads. */
  id: string;
  kind: NextActionKind;
  rule: AttentionKind;
  person: { name: string; clientId: string | null; conversationId: string | null; leadId: string | null; bookingId: string | null };
  /** "Sarah needs your reply" */
  headline: string;
  /** The fact it rests on, in words. */
  why: string;
  /** Where things stand with this person: "New inquiry", "Quote sent", "Booked, not confirmed". */
  stage: string;
  /** What they asked about, when known. */
  detail: string | null;
  value: Value | null;
  /** The opportunity may be lost: silence after a reply, or an inquiry left for days. */
  atRisk: boolean;
  since: Date;
  href: string;
  /** The composer opens already drafting in this mode. */
  draftMode: "reply" | "follow_up" | null;
  channel: string | null;
  serviceName: string | null;
  requestedDateText: string | null;
  booking: { startAt: Date; location: string | null; totalCents: number | null; serviceName: string } | null;
};

/** An inquiry left this long without a first reply counts as at risk, not just waiting. */
export const UNANSWERED_RISK_DAYS = 2;

export function headlineFor(kind: NextActionKind, first: string): string {
  switch (kind) {
    case "reply":
      return `${first} needs your reply`;
    case "follow_up":
      return `${first} may be going cold`;
    case "confirm_booking":
      return `Confirm ${first}'s booking`;
  }
}

export function stageFor(input: { rule: AttentionKind; leadStatus: string | null; quoted: boolean }): string {
  if (input.rule === "confirm_booking") return "Booked, not confirmed";
  if (input.rule === "waiting_reply") return input.leadStatus === "NEW" ? "New inquiry" : "Waiting on you";
  return input.quoted ? "Quote sent, no answer" : "Waiting on them";
}

export function isAtRisk(input: { rule: AttentionKind; since: Date; now: Date }): boolean {
  if (input.rule === "follow_up_suggested" || input.rule === "follow_up_due") return true;
  if (input.rule === "waiting_reply") return differenceInCalendarDays(input.now, input.since) >= UNANSWERED_RISK_DAYS;
  return false;
}

const RULE_ORDER: Record<AttentionKind, number> = { waiting_reply: 0, confirm_booking: 1, follow_up_due: 2, follow_up_suggested: 3 };

/** Replies first (longest wait first), then bookings to confirm (soonest first), then follow-ups (most money first, then longest quiet). */
export function rankNextActions<T extends NextAction>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const o = RULE_ORDER[a.rule] - RULE_ORDER[b.rule];
    if (o !== 0) return o;
    if (a.rule === "confirm_booking") return a.since.getTime() - b.since.getTime();
    if (a.rule === "waiting_reply") return a.since.getTime() - b.since.getTime();
    const v = (b.value?.cents ?? 0) - (a.value?.cents ?? 0);
    if (v !== 0) return v;
    return a.since.getTime() - b.since.getTime();
  });
}

export type MoneyAtRisk = { knownCents: number; estimatedCents: number; people: number };

/** Adds up the value of the at-risk rows, known money and estimates kept apart. */
export function moneyAtRisk(rows: NextAction[]): MoneyAtRisk {
  const out: MoneyAtRisk = { knownCents: 0, estimatedCents: 0, people: 0 };
  for (const r of rows) {
    if (!r.atRisk) continue;
    out.people += 1;
    if (!r.value) continue;
    if (r.value.known) out.knownCents += r.value.cents;
    else out.estimatedCents += r.value.cents;
  }
  return out;
}

/** "$500 quoted and about $350 more may be going cold across 3 people." Nothing when there is no money to speak of. */
export function moneyAtRiskSentence(m: MoneyAtRisk): string | null {
  if (m.people === 0 || (m.knownCents === 0 && m.estimatedCents === 0)) return null;
  const parts: string[] = [];
  if (m.knownCents > 0) parts.push(`${money(m.knownCents)} quoted or budgeted`);
  if (m.estimatedCents > 0) parts.push(`about ${money(m.estimatedCents)} in service prices`);
  return `${parts.join(" and ")} may be going cold across ${m.people === 1 ? "1 person" : `${m.people} people`}.`;
}
