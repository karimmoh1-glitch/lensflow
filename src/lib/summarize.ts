import { splitMessage } from "./cleanMessage";

/**
 * A conversation summary that is true whether or not an AI key is configured.
 *
 * The deterministic path reads the cleaned messages and what the person mentioned and
 * writes the same shape a model would: one sentence, the key details, where it stands,
 * and the next step. When OpenAI is configured the caller may replace `summary` with a
 * model's sentence — the details always come from the messages themselves, so the card
 * never claims something the thread doesn't hold.
 */
export type Intent = "CONFIRM" | "RESCHEDULE" | "CANCEL" | "PRICING" | "AVAILABILITY" | "REQUEST" | "LOGISTICS" | "THANKS" | "QUESTION" | "UPDATE";

export type Mentioned = {
  intent: Intent;
  intentLabel: string;
  day: string | null; // "Thursday", "Sep 12", "tomorrow"
  time: string | null; // "3:00 PM"
  amountCents: number | null;
  confidence: "high" | "medium" | "low";
};

export type ConversationSummary = {
  summary: string;
  details: Array<{ label: string; value: string }>;
  status: string;
  nextStep: string;
  mentioned: Mentioned;
  generatedAt: string;
  source: "ai" | "rules";
};

export type SummaryInput = {
  personName: string;
  channel: string;
  messages: Array<{ direction: "INBOUND" | "OUTBOUND"; body: string; createdAt: Date }>;
  /** Facts extracted earlier from the person's own words (service, date, location, budget). */
  mentioned?: { serviceName?: string | null; requestedDateText?: string | null; requestedLocation?: string | null; budgetCents?: number | null } | null;
};

const DAY = /\b(today|tomorrow|tonight|this (?:weekend|week|month)|next (?:week|month|weekend|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i;
const TIME = /\b(\d{1,2})(?::(\d{2}))?\s?(am|pm|a\.m\.|p\.m\.)\b|\b(noon|midday|midnight)\b|\b(\d{1,2}):(\d{2})\b/i;
const MONEY = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?/;

const RULES: Array<{ intent: Intent; re: RegExp; label: string }> = [
  { intent: "CANCEL", re: /\b(cancel|call it off|no longer need|won'?t be able to make|have to pull out)\b/i, label: "Wants to cancel" },
  { intent: "RESCHEDULE", re: /\b(reschedule|move (it|this|our|the|thursday|friday|monday|tuesday|wednesday|saturday|sunday)|push (it|this|back)|different (day|time|date)|switch (to|it)|change (the|our) (time|date|day)|instead of)\b/i, label: "Wants a different time" },
  { intent: "CONFIRM", re: /\b(works( for me)?!?|sounds (good|great|perfect)|perfect|let'?s do (it|that)|confirmed?|see you (then|there)|that'?s fine|yes please|we'?re in|count me in|i'?m in)\b/i, label: "Confirming" },
  { intent: "REQUEST", re: /\b(i'?d like to (book|do|get|set up)|we'?d like to (book|do|get|set up)|sign (me|us) up|reserve|interested in)\b/i, label: "Asking for something" },
  { intent: "PRICING", re: /\b(how much|price|pricing|cost|rate|rates|quote|estimate|charge|budget|package|packages)\b/i, label: "Asking about pricing" },
  { intent: "AVAILABILITY", re: /\b(available|availability|free (on|this|next|tomorrow|saturday|sunday|monday|tuesday|wednesday|thursday|friday)|any (openings?|slots?|dates?)|open (on|this|next)|do you have (anything|any|an opening)|when (are|could|can) you)\b/i, label: "Asking about availability" },
  { intent: "REQUEST", re: /\b(book|booking|schedule|can you|could you)\b/i, label: "Asking for something" },
  { intent: "LOGISTICS", re: /\b(running late|on (my|our) way|where (do|should) (we|i) (meet|park|go)|address|parking|what should (i|we) (wear|bring)|directions|how long)\b/i, label: "Logistics" },
  { intent: "THANKS", re: /\b(thank you|thanks|love them|loved (it|them|the)|amazing|beautiful|so happy|appreciate)\b/i, label: "Saying thanks" },
];

function normaliseTime(m: RegExpMatchArray): string | null {
  if (m[4]) return m[4] === "noon" || m[4] === "midday" ? "12:00 PM" : "12:00 AM";
  if (m[1] && m[3]) {
    const h = parseInt(m[1], 10);
    if (h < 1 || h > 12) return null;
    return `${h}:${m[2] ?? "00"} ${m[3].replace(/\./g, "").toUpperCase()}`;
  }
  if (m[5] && m[6]) {
    const h = parseInt(m[5], 10);
    if (h > 23) return null;
    return `${h % 12 === 0 ? 12 : h % 12}:${m[6]} ${h >= 12 ? "PM" : "AM"}`;
  }
  return null;
}

function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** What the latest message says, read from its words alone. Every field traces to text. */
export function readMessage(body: string): Mentioned {
  const text = body.replace(/\s+/g, " ").trim();
  const rule = RULES.find((r) => r.re.test(text));
  const dayMatch = text.match(DAY);
  const timeMatch = text.match(TIME);
  const moneyMatch = text.match(MONEY);
  const day = dayMatch ? titleCase(dayMatch[1].toLowerCase()) : null;
  const time = timeMatch ? normaliseTime(timeMatch) : null;
  const amountCents = moneyMatch ? Math.round(parseFloat(moneyMatch[1].replace(/,/g, "")) * 100) : null;
  const intent: Intent = rule ? rule.intent : /\?/.test(text) ? "QUESTION" : "UPDATE";
  const intentLabel = rule ? rule.label : intent === "QUESTION" ? "Has a question" : "Sent an update";
  const confidence: Mentioned["confidence"] = rule && (day || time || amountCents) ? "high" : rule ? "medium" : "low";
  return { intent, intentLabel, day, time, amountCents, confidence };
}

export function summarizeDeterministically(input: SummaryInput): ConversationSummary {
  const inbound = input.messages.filter((m) => m.direction === "INBOUND");
  const latestInbound = inbound[inbound.length - 1];
  const latestText = latestInbound ? splitMessage(latestInbound.body).text : "";
  const first = input.personName.split(" ")[0] || "They";
  const u = readMessage(latestText);
  const m = input.mentioned;

  const details: ConversationSummary["details"] = [];
  if (m?.serviceName) details.push({ label: "About", value: m.serviceName });
  if (m?.requestedDateText) details.push({ label: "Date", value: m.requestedDateText });
  else if (u.day || u.time) details.push({ label: "Date", value: [u.day, u.time].filter(Boolean).join(" · ") });
  if (m?.requestedLocation) details.push({ label: "Location", value: m.requestedLocation });
  const budget = m?.budgetCents ?? u.amountCents;
  if (budget) details.push({ label: "Amount", value: `$${(budget / 100).toLocaleString()}` });

  const last = input.messages[input.messages.length - 1];
  const status = inbound.length === 0 ? "No reply from them yet" : last?.direction === "OUTBOUND" ? "Waiting on them" : "Waiting on you";

  const when = [u.day ? ` ${u.day}` : "", u.time ? ` at ${u.time}` : ""].join("");
  const want =
    u.intent === "CONFIRM" ? `${first} is confirming${when}.`
    : u.intent === "RESCHEDULE" ? `${first} wants a different time${u.day ? ` — ${u.day}` : ""}${u.time ? ` at ${u.time}` : ""}.`
    : u.intent === "CANCEL" ? `${first} wants to cancel.`
    : u.intent === "PRICING" ? `${first} is asking about pricing${m?.serviceName ? ` for ${m.serviceName.toLowerCase()}` : ""}.`
    : u.intent === "AVAILABILITY" ? `${first} is asking about availability${u.day ? ` for ${u.day}` : ""}.`
    : u.intent === "REQUEST" ? `${first} is asking for ${m?.serviceName ? m.serviceName.toLowerCase() : "something"}${m?.requestedDateText ? ` on ${m.requestedDateText}` : u.day ? ` on ${u.day}` : ""}${m?.requestedLocation ? ` at ${m.requestedLocation}` : ""}.`
    : u.intent === "THANKS" ? `${first} is happy — a good moment to say thanks back.`
    : latestText ? `${first} wrote: “${trimQuote(latestText)}”`
    : `No messages from ${first} yet.`;

  const nextStep =
    status === "Waiting on them" ? "Nothing needed right now — they have your last message."
    : u.intent === "CONFIRM" ? "Reply to confirm."
    : u.intent === "CANCEL" ? "Reply and acknowledge the cancellation."
    : u.intent === "THANKS" ? "A short thank-you closes it."
    : u.intent === "UPDATE" ? "Read it; reply if something needs an answer."
    : "Reply to their question.";

  return { summary: want, details, status, nextStep, mentioned: u, generatedAt: new Date().toISOString(), source: "rules" };
}

function trimQuote(s: string, max = 140): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? one.slice(0, max - 1).trimEnd() + "…" : one;
}
