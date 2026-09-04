/**
 * Message → context → action.
 *
 * Given the latest inbound message and what the business already knows about the
 * sender, produce the small structured reading the product shows beside a conversation:
 * intent, the date/time mentioned, and the one action that follows. Deterministic —
 * every field is traceable to text in the message or a record in the database, so the
 * UI can say "Thursday · 3:00 PM" because the customer wrote "Thursday works! Can we do
 * 3pm?", not because a model guessed.
 */
export type Intent =
  | "CONFIRM" // "Thursday works! Can we do 3pm?"
  | "RESCHEDULE" // "can we move Thursday to 4?"
  | "CANCEL" // "I need to cancel"
  | "PRICING" // "how much for a half day?"
  | "AVAILABILITY" // "are you free next Saturday?"
  | "BOOK" // "I'd like to book the family session"
  | "PAYMENT" // "just sent the deposit", "invoice?"
  | "LOGISTICS" // "where do we meet?", "running late"
  | "THANKS" // "got the photos, love them!"
  | "QUESTION" // any other question
  | "UPDATE"; // a statement with no ask

export type Understanding = {
  intent: Intent;
  intentLabel: string;
  day: string | null; // "Thursday", "Sep 12", "tomorrow"
  time: string | null; // "3:00 PM"
  amountCents: number | null;
  context: string | null; // "Existing booking · Brand session · Fri 2:30 PM"
  nextAction: { label: string; kind: "confirm" | "reply" | "book" | "reschedule" | "send_link" | "collect" | "none" };
  /** What happens if you don't act — the cost of leaving it. */
  ifNot: string | null;
  confidence: "high" | "medium" | "low";
};

export type UnderstandInput = {
  body: string;
  relationship: "LEAD" | "CUSTOMER" | "CONTACT" | null;
  hasUpcomingBooking: boolean;
  upcomingBookingLabel?: string | null;
  hasOutstandingPayment: boolean;
  leadStatus?: string | null;
};

const DAY = /\b(today|tomorrow|tonight|this (?:weekend|week|month)|next (?:week|month|weekend|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i;
const TIME = /\b(\d{1,2})(?::(\d{2}))?\s?(am|pm|a\.m\.|p\.m\.)\b|\b(noon|midday|midnight)\b|\b(\d{1,2}):(\d{2})\b/i;
const MONEY = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?/;

const RULES: Array<{ intent: Intent; re: RegExp; label: string }> = [
  { intent: "CANCEL", re: /\b(cancel|call it off|no longer need|won'?t be able to make|have to pull out)\b/i, label: "Wants to cancel" },
  { intent: "RESCHEDULE", re: /\b(reschedule|move (it|this|our|the|thursday|friday|monday|tuesday|wednesday|saturday|sunday)|push (it|this|back)|different (day|time|date)|switch (to|it)|change (the|our) (time|date|day)|instead of)\b/i, label: "Wants to reschedule" },
  { intent: "CONFIRM", re: /\b(works( for me)?!?|sounds (good|great|perfect)|perfect|let'?s do (it|that)|confirmed?|see you (then|there)|that'?s fine|yes please|we'?re in|book it|lock it in|count me in|i'?m in)\b/i, label: "Confirming" },
  { intent: "PAYMENT", re: /\b(deposit|invoice|paid|payment|pay(ing)? (you|the|now)|venmo|zelle|receipt|balance)\b/i, label: "About payment" },
  { intent: "PRICING", re: /\b(how much|price|pricing|cost|rate|rates|quote|estimate|charge|budget|package|packages)\b/i, label: "Asking about pricing" },
  { intent: "AVAILABILITY", re: /\b(available|availability|free (on|this|next|tomorrow|saturday|sunday|monday|tuesday|wednesday|thursday|friday)|any (openings?|slots?|dates?)|open (on|this|next)|do you have (anything|any|an opening)|when (are|could|can) you)\b/i, label: "Asking about availability" },
  { intent: "BOOK", re: /\b(book|booking|reserve|schedule|sign (me|us) up|i'?d like to (do|get|set up)|we'?d like to (do|get|set up)|interested in)\b/i, label: "Wants to book" },
  { intent: "LOGISTICS", re: /\b(running late|on (my|our) way|where (do|should) (we|i) (meet|park|go)|address|parking|what should (i|we) (wear|bring)|directions|how long)\b/i, label: "Logistics" },
  { intent: "THANKS", re: /\b(thank you|thanks|love them|loved (it|them|the)|amazing|beautiful|so happy|appreciate)\b/i, label: "Saying thanks" },
];

export function understand(input: UnderstandInput): Understanding {
  const body = input.body.replace(/\s+/g, " ").trim();
  const dayM = DAY.exec(body);
  const timeM = TIME.exec(body);
  const moneyM = MONEY.exec(body);
  const day = dayM ? capitalize(dayM[0]) : null;
  const time = timeM ? formatTime(timeM) : null;
  const amountCents = moneyM ? Math.round(parseFloat(moneyM[1].replace(/,/g, "")) * 100) : null;
  const isQuestion = /\?/.test(body);

  let intent: Intent = isQuestion ? "QUESTION" : "UPDATE";
  let intentLabel = isQuestion ? "Asking a question" : "An update";
  // Cancel and reschedule always win; otherwise the intent mentioned first is the one
  // the message is about ("Are you free Saturday? Budget is $500" is about availability).
  let best: { rule: (typeof RULES)[number]; at: number } | null = null;
  for (const rule of RULES) {
    const m = rule.re.exec(body);
    if (!m) continue;
    if (rule.intent === "CANCEL" || rule.intent === "RESCHEDULE") { best = { rule, at: -1 }; break; }
    if (!best || m.index < best.at) best = { rule, at: m.index };
  }
  if (best) {
    intent = best.rule.intent;
    intentLabel = best.rule.label;
  }
  // "Thursday works! Can we do 3pm?" — a confirmation that names a time is a confirmation,
  // even though it ends in a question mark.
  if (intent === "QUESTION" && (day || time) && /\b(works|good|ok|okay|fine)\b/i.test(body)) {
    intent = "CONFIRM";
    intentLabel = "Confirming";
  }

  const context = input.hasUpcomingBooking && input.upcomingBookingLabel
    ? `Existing booking · ${input.upcomingBookingLabel}`
    : input.relationship === "CUSTOMER"
      ? "Returning customer"
      : input.leadStatus === "CONTACTED"
        ? "You replied before"
        : input.relationship === "LEAD"
          ? "New inquiry"
          : null;

  let nextAction: Understanding["nextAction"];
  switch (intent) {
    case "CONFIRM":
      nextAction = input.hasUpcomingBooking
        ? { label: time ? `Confirm ${day ?? "the booking"} at ${time}` : "Confirm the booking", kind: "confirm" }
        : { label: day ? `Book them for ${day}${time ? ` at ${time}` : ""}` : "Book them", kind: "book" };
      break;
    case "RESCHEDULE":
      nextAction = { label: day || time ? `Move it to ${[day, time].filter(Boolean).join(" at ")}` : "Offer a new time", kind: "reschedule" };
      break;
    case "CANCEL":
      nextAction = { label: "Acknowledge and release the date", kind: "reply" };
      break;
    case "PRICING":
      nextAction = { label: "Send pricing and propose a date", kind: "reply" };
      break;
    case "AVAILABILITY":
      nextAction = { label: day ? `Answer for ${day} and send the booking link` : "Send your availability", kind: "send_link" };
      break;
    case "BOOK":
      nextAction = { label: day ? `Book ${day}${time ? ` at ${time}` : ""}` : "Send the booking link", kind: day ? "book" : "send_link" };
      break;
    case "PAYMENT":
      nextAction = input.hasOutstandingPayment ? { label: "Confirm the payment", kind: "collect" } : { label: "Reply about payment", kind: "reply" };
      break;
    case "LOGISTICS":
      nextAction = { label: "Send the details", kind: "reply" };
      break;
    case "THANKS":
      nextAction = { label: "Say thanks — or ask for a referral", kind: "reply" };
      break;
    case "QUESTION":
      nextAction = { label: "Answer them", kind: "reply" };
      break;
    default:
      nextAction = { label: "Nothing needed right now", kind: "none" };
  }

  const ifNot: string | null = (() => {
    switch (intent) {
      case "CONFIRM":
        return input.hasUpcomingBooking ? "The booking stays unconfirmed and they may keep looking." : "They're ready — a slow reply is how ready people book someone else.";
      case "RESCHEDULE":
        return "The booking stays at the old time; a no-show is likely.";
      case "CANCEL":
        return "The slot stays blocked and any deposit stays unresolved.";
      case "PRICING":
      case "AVAILABILITY":
      case "BOOK":
        return "Inquiries go cold fast — most bookings go to whoever answers first.";
      case "PAYMENT":
        return input.hasOutstandingPayment ? "The balance stays open and the booking isn't secured." : null;
      case "LOGISTICS":
        return "They show up unsure of the plan.";
      case "THANKS":
        return "A referral moment passes.";
      case "QUESTION":
        return "Unanswered questions turn into silence.";
      default:
        return null;
    }
  })();
  const confidence: Understanding["confidence"] = intent === "UPDATE" || intent === "QUESTION" ? "low" : day || time || amountCents ? "high" : "medium";
  return { intent, intentLabel, day, time, amountCents, context, nextAction, ifNot, confidence };
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function formatTime(m: RegExpExecArray): string {
  if (m[4]) return m[4].toLowerCase() === "noon" || m[4].toLowerCase() === "midday" ? "12:00 PM" : "12:00 AM";
  if (m[1]) {
    const h = parseInt(m[1], 10);
    const min = m[2] ?? "00";
    const ap = m[3].replace(/\./g, "").toUpperCase();
    return `${h}:${min} ${ap}`;
  }
  const h = parseInt(m[5], 10);
  const min = m[6];
  if (h >= 0 && h <= 23) return `${h % 12 === 0 ? 12 : h % 12}:${min} ${h >= 12 ? "PM" : "AM"}`;
  return `${m[5]}:${m[6]}`;
}
