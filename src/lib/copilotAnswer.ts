/**
 * Rules-based answers for the assistant's "Ask" box.
 *
 * Every answer is built from the workspace's own records (gathered in
 * server/copilotFacts.ts). This path runs when no model is configured or the model fails,
 * so the owner still gets a direct answer to the common questions — who is waiting, what
 * is on the calendar, what is going cold, what is not confirmed — instead of a raw fact
 * sheet. It never claims an action was taken.
 */

export type BusinessFacts = {
  businessName: string;
  timezone: string;
  customers: number;
  openInquiries: Array<{ name: string; service: string | null; wants: string | null }>;
  waiting: Array<{ name: string; ago: string }>;
  cold: string[];
  upcoming: Array<{ name: string; service: string; when: string; dayKey: string; location: string | null; confirmed: boolean }>;
  calendars: Array<{ provider: "Google" | "Apple"; status: string; synced: string | null }>;
  todayKey: string;
  weekKeys: string[];
  /** The next-action engine's list, in order. */
  next: Array<{ headline: string; why: string; value: { label: string; known: boolean } | null }>;
  atRisk: { knownCents: number; estimatedCents: number; people: number };
  quotes: Array<{ name: string; cents: number; when: string; answered: boolean; booked: boolean }>;
  biggest: { name: string; label: string; known: boolean } | null;
  /** null = fewer than 5 conversations in 30 days: not enough to say. */
  channels: Array<{ channel: string; count: number }> | null;
  /** null = fewer than 5 replies this week. */
  medianReplyHours: number | null;
  sinceYesterday: { people: number; bookings: number };
};

const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
export const NOT_ENOUGH = "I don't have enough information to determine that from your records.";

const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function answerFromRecords(question: string, f: BusinessFacts): string {
  const q = question.toLowerCase();
  const has = (re: RegExp) => re.test(q);

  if (has(/\b(away|while i was (gone|out|away)|since yesterday|what happened|what did i miss|missed)\b/)) {
    const { people, bookings } = f.sinceYesterday;
    const head = `Since yesterday: ${plural(people, "new person", "new people")} wrote in and ${plural(bookings, "booking was", "bookings were")} made.`;
    return f.next.length > 0 ? `${head} Next up: ${f.next.slice(0, 3).map((n) => n.headline).join("; ")}.` : `${head} Nothing is waiting on you.`;
  }

  if (has(/\bquot(e|ed|es|ing)\b/)) {
    if (f.quotes.length === 0) return "No quotes went out in the last 7 days. A reply that names a price counts as a quote.";
    return `${plural(f.quotes.length, "quote")} in the last 7 days:\n${f.quotes.map((x) => `• ${x.name} — ${dollars(x.cents)}, ${x.when} ago · ${x.booked ? "booked" : x.answered ? "they replied" : "no reply yet"}`).join("\n")}`;
  }

  if (has(/\b(biggest|largest|most valuable|highest value|best opportunity|worth the most|at risk|money|revenue|losing)\b/)) {
    const risk = f.atRisk.people > 0 && (f.atRisk.knownCents > 0 || f.atRisk.estimatedCents > 0)
      ? ` May be going cold: ${f.atRisk.knownCents > 0 ? `${dollars(f.atRisk.knownCents)} quoted or budgeted` : ""}${f.atRisk.knownCents > 0 && f.atRisk.estimatedCents > 0 ? " and " : ""}${f.atRisk.estimatedCents > 0 ? `about ${dollars(f.atRisk.estimatedCents)} in service prices (an estimate)` : ""} across ${plural(f.atRisk.people, "person", "people")}.`
      : "";
    if (!f.biggest) return `No open inquiry has a value on record — nothing was quoted, no budget was named, and no service was matched.${risk}`;
    return `Biggest open opportunity: ${f.biggest.name} — ${f.biggest.label}${f.biggest.known ? "" : " (an estimate, not a quote)"}.${risk}`;
  }

  if (has(/\b(where|which channel|source|come from|coming from|instagram|gmail|email|sms|whatsapp)\b/) && has(/\b(lead|inquir|people|customer|message|come|coming|from|channel|most)/)) {
    if (!f.channels) return `${NOT_ENOUGH} Fewer than 5 conversations came in over the last 30 days, which is too few to say where people come from.`;
    return `Last 30 days, by channel: ${f.channels.map((c) => `${c.channel} ${c.count}`).join(", ")}. Most came from ${f.channels[0].channel}.`;
  }

  if (has(/\b(response time|reply time|how fast|how quickly|slow|speed)\b/)) {
    if (f.medianReplyHours === null) return `${NOT_ENOUGH} Fewer than 5 first replies this week, which is too few to measure.`;
    return `Your typical first reply this week took ${f.medianReplyHours < 1 ? "under an hour" : `about ${Math.round(f.medianReplyHours)} hours`} (the median).`;
  }

  if (has(/\b(work on|do first|do next|do today|start with|priorit|focus|should i|to[- ]?do|next best)\b/)) {
    if (f.next.length === 0) return "Nothing needs you right now: nobody is waiting, nothing is going cold, and every upcoming booking is confirmed.";
    return `In order:\n${f.next.slice(0, 6).map((n, i) => `${i + 1}. ${n.headline} — ${n.why}${n.value ? ` (${n.value.label}${n.value.known ? "" : ", estimate"})` : ""}`).join("\n")}`;
  }

  if (has(/\b(how many|number of|count)\b/) && has(/\b(opportunit|open|active|inquir|lead)/)) {
    return `${plural(f.openInquiries.length, "open inquiry", "open inquiries")}${f.next.length > 0 ? `, ${f.next.length} of which need something from you` : ""}.`;
  }

  if (has(/\b(waiting|wait|reply|replies|respon(d|se)|answer|unanswered|owe|ignored|needs? me|haven't (replied|answered))\b/)) {
    if (f.waiting.length === 0) return "Nobody is waiting on you — everyone who wrote in has a reply.";
    const lines = f.waiting.slice(0, 8).map((w) => `• ${w.name} — wrote ${w.ago} ago`);
    return `${plural(f.waiting.length, "person is", "people are")} waiting on a reply:\n${lines.join("\n")}${f.waiting.length > 8 ? `\n…and ${f.waiting.length - 8} more in the inbox.` : ""}`;
  }

  if (has(/\b(cold|quiet|stale|going quiet|follow[- ]?up|slipping|forgot|haven't booked|didn't book|not booked)\b/)) {
    if (f.cold.length === 0) return "No inquiries are going cold — nothing has sat unbooked for more than 3 days.";
    return `${plural(f.cold.length, "inquiry is", "inquiries are")} going cold (3+ days old and not booked): ${list(f.cold)}. A short follow-up usually brings these back.`;
  }

  if (has(/\b(unconfirmed|not confirmed|confirm|pending|tentative)\b/)) {
    const open = f.upcoming.filter((b) => !b.confirmed);
    if (open.length === 0) return f.upcoming.length === 0 ? "There are no upcoming bookings, so nothing is waiting to be confirmed." : "Every upcoming booking is confirmed.";
    return `${plural(open.length, "booking is", "bookings are")} not confirmed yet:\n${open.map((b) => `• ${b.name} — ${b.service}, ${b.when}`).join("\n")}\nOpen a booking to confirm it.`;
  }

  if (has(/\b(today|tonight)\b/)) {
    const today = f.upcoming.filter((b) => b.dayKey === f.todayKey);
    if (today.length === 0) return "Nothing is on the calendar today.";
    return `Today:\n${today.map((b) => `• ${b.when} — ${b.name}, ${b.service}${b.location ? ` at ${b.location}` : ""}${b.confirmed ? "" : " (not confirmed)"}`).join("\n")}`;
  }

  if (has(/\b(tomorrow)\b/)) {
    const idx = f.weekKeys.indexOf(f.todayKey);
    const key = idx >= 0 ? f.weekKeys[idx + 1] : undefined;
    const rows = f.upcoming.filter((b) => key && b.dayKey === key);
    if (rows.length === 0) return "Nothing is on the calendar tomorrow.";
    return `Tomorrow:\n${rows.map((b) => `• ${b.when} — ${b.name}, ${b.service}${b.confirmed ? "" : " (not confirmed)"}`).join("\n")}`;
  }

  if (has(/\b(calendar|schedule|week|upcoming|booked|bookings?|appointments?|sessions?|next)\b/)) {
    if (has(/\b(google|apple|sync|connected|connect)\b/)) return calendarsAnswer(f);
    const week = f.upcoming.filter((b) => f.weekKeys.includes(b.dayKey));
    const rows = has(/\bweek\b/) ? week : f.upcoming;
    if (rows.length === 0) return has(/\bweek\b/) ? "Nothing is booked for the next 7 days." : "There are no upcoming bookings on the calendar.";
    const unconfirmed = rows.filter((b) => !b.confirmed).length;
    return `${has(/\bweek\b/) ? "This week" : "Coming up"}:\n${rows.map((b) => `• ${b.when} — ${b.name}, ${b.service}${b.location ? ` at ${b.location}` : ""}${b.confirmed ? "" : " (not confirmed)"}`).join("\n")}${unconfirmed > 0 ? `\n${plural(unconfirmed, "booking", "bookings")} still need${unconfirmed === 1 ? "s" : ""} confirming.` : ""}`;
  }

  if (has(/\b(google|apple|sync|synced|connected|connection)\b/)) return calendarsAnswer(f);

  if (has(/\b(customers?|clients?|people|contacts?|how many)\b/)) {
    return `${plural(f.customers, "customer")} on record${f.openInquiries.length > 0 ? `, and ${plural(f.openInquiries.length, "open inquiry", "open inquiries")}: ${list(f.openInquiries.slice(0, 6).map((i) => i.name))}${f.openInquiries.length > 6 ? "…" : ""}` : ""}.`;
  }

  if (has(/\b(inquir|lead|new|asking|interested)/)) {
    if (f.openInquiries.length === 0) return "There are no open inquiries right now.";
    return `${plural(f.openInquiries.length, "open inquiry", "open inquiries")}:\n${f.openInquiries.slice(0, 8).map((i) => `• ${i.name}${i.service ? ` — ${i.service}` : ""}${i.wants ? `, wants ${i.wants}` : ""}`).join("\n")}`;
  }

  // A question the records can't answer says so, instead of a status summary dressed up as an answer.
  if (has(/\b(why|how much|what is|what's|when did|did i|do i|can you|could you|policy|price|cost|rate|charge|refund|cancel|address|hours|deposit)\b/)) {
    return `${NOT_ENOUGH} I can tell you who is waiting on you, what to do next, what's going cold, what was quoted, what's on the calendar, and where people wrote from.`;
  }

  // Anything else: where things stand, in one breath, plus what can be asked.
  const parts = [
    f.waiting.length > 0 ? `${plural(f.waiting.length, "person is", "people are")} waiting on a reply` : "nobody is waiting on a reply",
    f.upcoming.length > 0 ? `${plural(f.upcoming.length, "booking is", "bookings are")} coming up${f.upcoming.some((b) => !b.confirmed) ? ` (${f.upcoming.filter((b) => !b.confirmed).length} not confirmed)` : ""}` : "nothing is booked ahead",
    f.cold.length > 0 ? `${plural(f.cold.length, "inquiry is", "inquiries are")} going cold` : "no inquiries are going cold",
  ];
  return `Here's where ${f.businessName} stands: ${parts.join("; ")}. Ask about who is waiting, what's on the calendar, what's going cold, or what isn't confirmed.`;
}

function calendarsAnswer(f: BusinessFacts): string {
  if (f.calendars.length === 0) return "No external calendar is connected. Connect Google or Apple Calendar under Settings → Channels so busy time counts against your availability.";
  return `Connected calendars: ${f.calendars.map((c) => `${c.provider} (${c.status}${c.synced ? `, synced ${c.synced} ago` : ", not synced yet"})`).join("; ")}.`;
}
