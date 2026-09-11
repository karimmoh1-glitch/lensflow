import { prisma } from "@/lib/db";

/**
 * Whether a person still wants texts from this business.
 *
 * Someone who replies STOP has withdrawn consent, and continuing to text them is both
 * rude and, in most places Daythread's customers operate, unlawful. Nothing in the product
 * read that before: a STOP landed in the inbox like any other message, automations carried
 * on, and the carrier quietly rejected every send afterwards — a silent failure with a
 * legal edge on it.
 *
 * The answer is derived from the transcript rather than a flag, because the transcript is
 * already there and already durable. The most recent of the person's own messages that
 * matches one of these words is the current answer, so STOP stops and a later START starts
 * again, which is exactly the behaviour the carriers implement.
 */

/** The words carriers treat as withdrawing consent. Matched on the whole message. */
const STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "stop all", "optout", "opt out"]);

/** And the words that ask for messages again. */
const START_WORDS = new Set(["start", "unstop", "yes", "optin", "opt in", "resume"]);

/** How many recent inbound messages to look through. A STOP is always near the end. */
const LOOKBACK = 40;

export type SmsConsent = "ok" | "opted_out";

/** Classifies one message body. Returns null when it is an ordinary message. */
export function consentKeyword(body: string): "stop" | "start" | null {
  // Carriers match the whole message, not a mention: "please don't cancel my booking" is
  // not an opt-out, and treating it as one would silence a real customer.
  const normalized = body.trim().toLowerCase().replace(/[.!?,]+$/g, "").replace(/\s+/g, " ");
  if (STOP_WORDS.has(normalized)) return "stop";
  if (START_WORDS.has(normalized)) return "start";
  return null;
}

/**
 * Has this person asked to stop receiving texts from this business? Scoped to the
 * workspace, so one business's opt-out never silences another's messages.
 */
export async function smsConsent(businessId: string, phone: string): Promise<SmsConsent> {
  if (!phone) return "ok";
  const recent = await prisma.message.findMany({
    where: {
      direction: "INBOUND",
      conversation: { businessId, channel: "SMS", externalHandle: phone },
    },
    orderBy: { createdAt: "desc" },
    take: LOOKBACK,
    select: { body: true },
  });
  for (const message of recent) {
    const keyword = consentKeyword(message.body);
    if (keyword) return keyword === "stop" ? "opted_out" : "ok";
  }
  return "ok";
}

/** What the person who pressed send is told when the recipient has opted out. */
export const OPTED_OUT_MESSAGE = "This person replied STOP to your texts, so Daythread will not send them another one. Reach them another way, or ask them to text START.";
