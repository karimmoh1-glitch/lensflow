import { addDays, setHours, setMinutes, startOfDay } from "date-fns";

/**
 * A reply that quotes a price is a quote. When one goes out to an open lead who has no
 * follow-up planned, a follow-up is set for three days later at nine in the morning — the
 * one thing a business most often forgets, done for them. Deterministic, and only ever
 * a reminder; nothing is sent by it.
 */
const PRICE = /(\$\s?\d[\d,]*(\.\d{2})?|\b\d[\d,]*\s?(usd|dollars)\b|\b(rate|price|pricing|quote|package)s?\b[^.\n]{0,60}\$\s?\d)/i;

export const QUOTE_FOLLOW_UP_DAYS = 3;

export function looksLikeQuote(body: string): boolean {
  return PRICE.test(body);
}

export function quoteFollowUpAt(now = new Date()): Date {
  return setMinutes(setHours(startOfDay(addDays(now, QUOTE_FOLLOW_UP_DAYS)), 9), 0);
}

export function shouldScheduleQuoteFollowUp(input: { body: string; lead: { status: string; followUpAt: Date | null } | null; now?: Date }): boolean {
  if (!input.lead) return false;
  if (input.lead.status === "BOOKED" || input.lead.status === "LOST") return false;
  const now = input.now ?? new Date();
  if (input.lead.followUpAt && input.lead.followUpAt > now) return false;
  return looksLikeQuote(input.body);
}
