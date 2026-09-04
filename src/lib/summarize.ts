import { splitMessage } from "./cleanMessage";
import { understand, type Understanding } from "./understand";

/**
 * A conversation summary that is true whether or not an AI key is configured.
 *
 * The deterministic path reads the cleaned messages and the lead's extracted fields and
 * writes the same shape a model would: one sentence, the key details, the status, and the
 * next step. When OpenAI is configured the caller may replace `summary` with a model's
 * sentence — but the details and next step always come from records, so the card never
 * claims something the data doesn't hold.
 */
export type ConversationSummary = {
  summary: string;
  details: Array<{ label: string; value: string }>;
  status: string;
  nextStep: string;
  understanding: Pick<Understanding, "intent" | "intentLabel" | "day" | "time" | "amountCents" | "context" | "nextAction" | "confidence">;
  generatedAt: string;
  source: "ai" | "rules";
};

export type SummaryInput = {
  personName: string;
  relationship: "LEAD" | "CUSTOMER" | "CONTACT" | null;
  channel: string;
  messages: Array<{ direction: "INBOUND" | "OUTBOUND"; body: string; createdAt: Date }>;
  lead?: { serviceName?: string | null; requestedDateText?: string | null; requestedLocation?: string | null; budgetCents?: number | null; status?: string | null; respondedAt?: Date | null } | null;
  upcomingBookingLabel?: string | null;
  hasOutstandingPayment?: boolean;
};

export function summarizeDeterministically(input: SummaryInput): ConversationSummary {
  const inbound = input.messages.filter((m) => m.direction === "INBOUND");
  const latestInbound = inbound[inbound.length - 1];
  const latestText = latestInbound ? splitMessage(latestInbound.body).text : "";
  const first = input.personName.split(" ")[0] || "They";
  const u = understand({
    body: latestText,
    relationship: input.relationship,
    hasUpcomingBooking: Boolean(input.upcomingBookingLabel),
    upcomingBookingLabel: input.upcomingBookingLabel,
    hasOutstandingPayment: Boolean(input.hasOutstandingPayment),
    leadStatus: input.lead?.status ?? null,
  });

  const details: ConversationSummary["details"] = [];
  if (input.lead?.serviceName) details.push({ label: "Service", value: input.lead.serviceName });
  if (input.lead?.requestedDateText) details.push({ label: "Date", value: input.lead.requestedDateText });
  else if (u.day) details.push({ label: "Date", value: [u.day, u.time].filter(Boolean).join(" · ") });
  if (input.lead?.requestedLocation) details.push({ label: "Location", value: input.lead.requestedLocation });
  const budget = input.lead?.budgetCents ?? u.amountCents;
  if (budget) details.push({ label: "Budget", value: `$${(budget / 100).toLocaleString()}` });
  if (input.upcomingBookingLabel) details.push({ label: "Booked", value: input.upcomingBookingLabel });

  const status = input.upcomingBookingLabel
    ? "Booked"
    : input.lead?.status === "LOST"
      ? "Didn't book"
      : input.relationship === "CUSTOMER"
        ? "Customer"
        : !input.lead?.respondedAt && inbound.length > 0
          ? "New inquiry · waiting on you"
          : input.messages[input.messages.length - 1]?.direction === "OUTBOUND"
            ? "Waiting on them"
            : "In conversation";

  // One sentence: who wants what.
  const want =
    u.intent === "CONFIRM"
      ? `${first} is confirming${u.day ? ` ${u.day}` : ""}${u.time ? ` at ${u.time}` : ""}.`
      : u.intent === "RESCHEDULE"
        ? `${first} wants to reschedule${u.day ? ` to ${u.day}` : ""}${u.time ? ` at ${u.time}` : ""}.`
        : u.intent === "CANCEL"
          ? `${first} wants to cancel.`
          : u.intent === "PRICING"
            ? `${first} is asking about pricing${input.lead?.serviceName ? ` for a ${input.lead.serviceName.toLowerCase()}` : ""}.`
            : u.intent === "AVAILABILITY"
              ? `${first} is asking about availability${u.day ? ` for ${u.day}` : ""}.`
              : u.intent === "BOOK"
                ? `${first} wants to book${input.lead?.serviceName ? ` a ${input.lead.serviceName.toLowerCase()}` : ""}${input.lead?.requestedDateText ? ` on ${input.lead.requestedDateText}` : u.day ? ` on ${u.day}` : ""}${input.lead?.requestedLocation ? ` at ${input.lead.requestedLocation}` : ""}${budget ? ` with a $${(budget / 100).toLocaleString()} budget` : ""}.`
                : u.intent === "PAYMENT"
                  ? `${first} wrote about payment.`
                  : u.intent === "THANKS"
                    ? `${first} is happy — a good moment to ask for a referral.`
                    : latestText
                      ? `${first} wrote: “${trimQuote(latestText)}”`
                      : `No messages from ${first} yet.`;

  const nextStep = u.nextAction.kind === "none" ? "Nothing needed right now." : u.nextAction.label + ".";

  return {
    summary: want,
    details,
    status,
    nextStep,
    understanding: { intent: u.intent, intentLabel: u.intentLabel, day: u.day, time: u.time, amountCents: u.amountCents, context: u.context, nextAction: u.nextAction, confidence: u.confidence },
    generatedAt: new Date().toISOString(),
    source: "rules",
  };
}

function trimQuote(s: string, max = 140): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? one.slice(0, max - 1).trimEnd() + "…" : one;
}
