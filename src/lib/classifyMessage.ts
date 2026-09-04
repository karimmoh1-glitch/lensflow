/**
 * Decides what an inbound message *is* before anything is created from it.
 *
 * The failure this exists to prevent: an email from no-reply@doordash.com becoming a
 * "client." So classification runs first, on the raw signals a message carries — who
 * sent it, from what kind of address, with what headers, saying what — and only a
 * message classified PRIORITY goes on to create a lead and a client record. Everything
 * else is still stored (All Inbox is the source of truth) but stays out of the CRM and
 * out of Priority.
 *
 * Deterministic and dependency-free so it can be unit-tested exhaustively and run on
 * every message at ingestion. Knowledge of the business (is this a known customer? have
 * they written before?) is passed in, not looked up here.
 */
export type MessageCategory = "PRIORITY" | "AUTOMATED" | "PROMOTIONAL" | "INTERNAL" | "SPAM";

export type ClassifyInput = {
  channel: "EMAIL" | "SMS" | "WHATSAPP" | "INSTAGRAM" | "WEBSITE" | "PHONE";
  senderEmail?: string | null;
  senderName?: string | null;
  subject?: string | null;
  body: string;
  headers?: { listUnsubscribe?: string | null; listId?: string | null; precedence?: string | null; autoSubmitted?: string | null; replyTo?: string | null } | null;
  /** The sender already has a customer relationship (a booking or payment) with this business. */
  knownCustomer?: boolean;
  /** The business has written to this sender before. */
  priorOutbound?: boolean;
};

export type Classification = { category: MessageCategory; reason: string };

// Local-parts that only machines use.
const AUTOMATED_LOCALPART = /^(no-?reply|do-?not-?reply|donotreply|notifications?|notify|alerts?|alert|mailer(-daemon)?|bounces?|receipts?|orders?|order-updates?|shipping|delivery|updates?|system|auto(mailer|mated)?|verification|verify|security|accounts?|billing|invoices?|statements?|newsletter|news|digest|marketing|promotions?|hello|hi|team|info|support|help|care|service|customerservice|feedback|survey)(\+.*)?$/i;

// Platforms whose mail to a small business is almost never a customer conversation.
const INTERNAL_DOMAINS = [
  "stripe.com", "google.com", "accounts.google.com", "meta.com", "facebook.com", "facebookmail.com", "instagram.com", "mail.instagram.com",
  "vercel.com", "github.com", "notion.so", "slack.com", "zoom.us", "calendly.com", "acuityscheduling.com", "squarespace.com", "wix.com",
  "godaddy.com", "namecheap.com", "cloudflare.com", "apple.com", "microsoft.com", "intuit.com", "quickbooks.com", "xero.com", "gusto.com",
  "adobe.com", "canva.com", "dropbox.com", "resend.com", "twilio.com", "sendgrid.net", "mailchimp.com", "hubspot.com", "linkedin.com",
];

// Consumer platforms whose mail is transactional noise for a business inbox.
const AUTOMATED_DOMAINS = [
  "doordash.com", "ubereats.com", "uber.com", "lyft.com", "amazon.com", "amazon.co.uk", "shopify.com", "etsy.com", "ebay.com", "paypal.com",
  "venmo.com", "cash.app", "instacart.com", "grubhub.com", "postmates.com", "airbnb.com", "booking.com", "expedia.com", "delta.com", "united.com",
  "usps.com", "ups.com", "fedex.com", "dhl.com", "netflix.com", "spotify.com", "chase.com", "bankofamerica.com", "wellsfargo.com", "capitalone.com",
];

const AUTOMATED_SUBJECT = /\b(your (order|delivery|package|receipt|invoice|payment|subscription|account|ride|trip|reservation)|order (confirmed|confirmation|#|number|update)|receipt|invoice #|has shipped|shipped|out for delivery|delivered|tracking (number|update)|confirmation code|verify (your|this)|verification code|one-time (code|passcode)|security alert|sign-?in (alert|attempt)|new (login|sign-?in)|password (reset|changed)|reset your password|statement is (ready|available)|payment (received|confirmation|successful|failed)|auto-?renew|renewal notice|appointment reminder|reminder:)\b/i;

const PROMO_SUBJECT = /(\d{1,3}% off|% off|sale ends|flash sale|black friday|cyber monday|last chance|limited time|exclusive offer|special offer|new arrivals|don'?t miss|weekly (digest|roundup)|newsletter|webinar|join us|introducing|now available|free shipping|deal of the|coupon|promo code)/i;

const SPAM_HINTS = /\b(congratulations you('ve| have) won|lottery|prize claim|wire transfer|western union|nigerian|crypto (giveaway|investment)|guaranteed (returns|income)|work from home and earn|act now!!+|100% free!!+|viagra|casino bonus)\b/i;

// Things people say to a business when they actually want something from it.
const HUMAN_INTENT = /\b(book|booking|appointment|available|availability|schedule|reschedule|quote|estimate|price|pricing|how much|cost|rate|do you (do|offer|have|take)|can (i|we|you)|could (i|we|you)|would (you|it)|interested in|looking for|i'?d like|we'?d like|are you|is there|when (can|could|are)|what time|next week|this week|tomorrow|saturday|sunday|monday|tuesday|wednesday|thursday|friday|deposit|invoice for|running late|on my way|thank you so much|thanks so much)\b/i;

function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase().trim() : "";
}
function localPartOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(0, at).toLowerCase().trim() : email.toLowerCase().trim();
}
function endsWithDomain(domain: string, list: string[]): string | undefined {
  return list.find((d) => domain === d || domain.endsWith("." + d));
}

export function classifyMessage(input: ClassifyInput): Classification {
  const body = (input.body ?? "").trim();
  const subject = (input.subject ?? "").trim();
  const text = `${subject}\n${body}`;
  const email = (input.senderEmail ?? "").toLowerCase().trim();
  const domain = email ? domainOf(email) : "";
  const local = email ? localPartOf(email) : "";
  const h = input.headers ?? {};
  const hasListHeaders = Boolean(h.listUnsubscribe || h.listId) || /\bbulk\b|\blist\b/i.test(h.precedence ?? "");
  const autoSubmitted = /^(auto-generated|auto-replied|auto-notified)/i.test(h.autoSubmitted ?? "");

  // Obvious junk first — even from a known address, this isn't a conversation.
  if (SPAM_HINTS.test(text)) return { category: "SPAM", reason: "Reads like junk mail." };

  // People we already do business with, or have already written to, are conversations —
  // unless the mail is plainly a bulk send from their side.
  if ((input.knownCustomer || input.priorOutbound) && !hasListHeaders && !autoSubmitted) {
    return { category: "PRIORITY", reason: input.knownCustomer ? "Existing customer." : "You've written to them before." };
  }

  // Non-email channels are person-to-person by nature.
  if (input.channel !== "EMAIL") {
    return { category: "PRIORITY", reason: `A message on ${input.channel.toLowerCase()}.` };
  }

  if (autoSubmitted) return { category: "AUTOMATED", reason: "Marked auto-generated by the sender." };

  const internalDomain = domain && endsWithDomain(domain, INTERNAL_DOMAINS);
  if (internalDomain) return { category: "INTERNAL", reason: `From ${internalDomain}, a platform you use.` };

  const automatedDomain = domain && endsWithDomain(domain, AUTOMATED_DOMAINS);
  if (automatedDomain) return { category: "AUTOMATED", reason: `A notification from ${automatedDomain}.` };

  if (hasListHeaders) {
    return AUTOMATED_SUBJECT.test(subject)
      ? { category: "AUTOMATED", reason: "A bulk transactional notification." }
      : { category: "PROMOTIONAL", reason: "A mailing list or newsletter." };
  }

  if (local && AUTOMATED_LOCALPART.test(local)) {
    // hello@/info@/team@ can be a real person at a small vendor — treat those as internal
    // contacts, and only the machine-only local-parts as automated.
    if (/^(hello|hi|team|info|support|help|care|service|customerservice|feedback|survey)(\+.*)?$/i.test(local)) {
      return HUMAN_INTENT.test(body) && /\?/.test(body)
        ? { category: "PRIORITY", reason: "A shared mailbox asking you something." }
        : { category: "INTERNAL", reason: "A business mailbox, not a customer." };
    }
    return { category: "AUTOMATED", reason: `Sent from ${local}@ — an address nobody reads.` };
  }

  if (AUTOMATED_SUBJECT.test(subject)) return { category: "AUTOMATED", reason: "Subject reads like a receipt or notification." };
  if (PROMO_SUBJECT.test(subject) || (/unsubscribe/i.test(body) && !/\?/.test(body))) {
    return { category: "PROMOTIONAL", reason: "Reads like marketing." };
  }

  // A person, writing to the business. Questions and intent words make it a clear priority;
  // a short human note with neither still defaults to priority — better to show a real
  // person than to hide one.
  if (HUMAN_INTENT.test(text) || /\?/.test(body)) return { category: "PRIORITY", reason: "Someone asking you something." };
  return { category: "PRIORITY", reason: "A person writing to you." };
}
