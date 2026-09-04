/**
 * Decides what an inbound message *is* before anything is created from it.
 *
 * The failure this exists to prevent: an email from no-reply@doordash.com becoming a
 * "client." Classification runs first, on every signal a message carries, and only a
 * message that reads as a person writing to this business (PRIORITY) goes on to create a
 * lead and a client record. Everything else is still stored — All Inbox is the source of
 * truth — but stays out of the CRM and out of Priority.
 *
 * Layered, not a single regex:
 *
 *   0. What this business has said.  Tenant corrections ("not priority", "this is a
 *      customer") are stored as sender rules and win outright. They never cross tenants:
 *      the caller passes only this business's rules.
 *   1. What this business already knows.  A customer, someone you've written to, someone
 *      who has written repeatedly — relationship history beats sender heuristics.
 *   2. Junk.
 *   3. Channel.  Instagram, SMS, WhatsApp and the booking page are person-to-person.
 *   4. Evidence.  Headers, sender address, domain semantics, subject, body — each adds
 *      weighted signals for AUTOMATED / PROMOTIONAL / VENDOR / INTERNAL / SPAM / PRIORITY,
 *      and the strongest reading wins. Every signal that fired comes back in `signals`, and
 *      `reason` is the one-line sentence the inbox shows.
 *
 * Deterministic and dependency-free so it runs on every message and can be tested
 * exhaustively against realistic fixtures.
 */
export type MessageCategory = "PRIORITY" | "AUTOMATED" | "PROMOTIONAL" | "VENDOR" | "INTERNAL" | "SPAM";

export type SenderRule = { kind: "email" | "domain"; value: string; category: MessageCategory };

export type ClassifyInput = {
  channel: "EMAIL" | "SMS" | "WHATSAPP" | "INSTAGRAM" | "WEBSITE" | "PHONE";
  senderEmail?: string | null;
  senderName?: string | null;
  subject?: string | null;
  body: string;
  headers?: {
    listUnsubscribe?: string | null;
    listId?: string | null;
    precedence?: string | null;
    autoSubmitted?: string | null;
    replyTo?: string | null;
    messageId?: string | null;
    xMailer?: string | null;
  } | null;
  /** The sender already has a customer relationship (a booking or payment) with this business. */
  knownCustomer?: boolean;
  /** The business has written to this sender before. */
  priorOutbound?: boolean;
  /** How many messages this sender has sent before. */
  priorInboundCount?: number;
  /** The business's own email domain(s), for spotting teammates. */
  businessDomains?: string[];
  /** This business's stored corrections. Never another tenant's. */
  rules?: SenderRule[];
};

export type Classification = {
  category: MessageCategory;
  /** One sentence for the inbox row. */
  reason: string;
  /** Every signal that fired, for the "why" disclosure and for tests. */
  signals: string[];
  /** Which layer decided. */
  decidedBy: "rule" | "relationship" | "junk" | "channel" | "evidence";
};

// ── Vocabulary ──────────────────────────────────────────────────────────────

// Local-parts only machines use.
const MACHINE_LOCAL = /^(no-?reply|do-?not-?reply|donotreply|noreply|notifications?|notify|alerts?|mailer(-daemon)?|bounces?|receipts?|orders?|order-?(updates?|status)|shipping|shipment(-tracking)?|delivery|tracking|updates?|system|auto(mailer|mated|reply)?|verification|verify|security|confirm(ation)?s?|reminders?|calendar-notification|invitations?|digest|no_reply|reply)(\+.*)?$/i;
// Marketing local-parts.
const MARKETING_LOCAL = /^(newsletter|news|marketing|promotions?|promo|offers?|deals|campaigns?|email|emails|hello@?|community|events?|team-updates)(\+.*)?$/i;
// Shared business mailboxes — a person may read these.
const SHARED_LOCAL = /^(hello|hi|team|info|contact|support|help|care|service|customerservice|feedback|survey|billing|accounts?|accounting|invoices?|invoicing|ar|payables|sales|office|admin|studio|bookings?|reservations?)(\+.*)?$/i;

// Platforms a small business runs on. Mail from them is about your account, not a customer.
const PLATFORM_DOMAINS = [
  "stripe.com", "google.com", "accounts.google.com", "calendar-notification.google.com", "meta.com", "facebook.com", "facebookmail.com", "instagram.com", "mail.instagram.com",
  "vercel.com", "github.com", "notion.so", "slack.com", "zoom.us", "calendly.com", "acuityscheduling.com", "squarespace.com", "wix.com", "godaddy.com", "namecheap.com",
  "cloudflare.com", "apple.com", "microsoft.com", "microsoftonline.com", "intuit.com", "quickbooks.com", "xero.com", "gusto.com", "adobe.com", "canva.com", "dropbox.com",
  "resend.com", "twilio.com", "sendgrid.net", "hubspot.com", "linkedin.com", "honeybook.com", "dubsado.com", "pixieset.com", "shootproof.com", "squareup.com", "square.com",
  "paypal.com", "venmo.com", "wise.com", "mercury.com", "brex.com", "ramp.com", "docusign.net", "docusign.com", "typeform.com", "zapier.com", "openai.com", "anthropic.com",
];
// Consumer services whose mail is transactional noise in a business inbox.
const CONSUMER_DOMAINS = [
  "doordash.com", "ubereats.com", "uber.com", "lyft.com", "amazon.com", "amazon.co.uk", "amazon.ca", "shopify.com", "etsy.com", "ebay.com", "target.com", "walmart.com",
  "bestbuy.com", "costco.com", "instacart.com", "grubhub.com", "postmates.com", "airbnb.com", "booking.com", "expedia.com", "hotels.com", "delta.com", "united.com",
  "aa.com", "southwest.com", "jetblue.com", "usps.com", "ups.com", "fedex.com", "dhl.com", "netflix.com", "spotify.com", "hulu.com", "disneyplus.com", "chase.com",
  "bankofamerica.com", "wellsfargo.com", "capitalone.com", "amex.com", "americanexpress.com", "discover.com", "citi.com", "robinhood.com", "coinbase.com", "ticketmaster.com",
  "eventbrite.com", "opentable.com", "resy.com", "starbucks.com", "cash.app", "att.com", "verizon.com", "t-mobile.com", "xfinity.com", "comcast.com",
];
// Email-sending infrastructure that shows up in Message-ID / Reply-To / X-Mailer.
const BULK_INFRA = /(amazonses|sendgrid|mailgun|mailchimp|mcsv\.net|mandrill|constantcontact|klaviyo|hubspot|marketo|salesforce|exacttarget|sparkpost|postmark|braze|iterable|customer\.io|sailthru|campaign-archive|list-manage|substack|beehiiv|convertkit)/i;
const FREEMAIL = /^(gmail|googlemail|yahoo|outlook|hotmail|live|icloud|me|aol|proton|protonmail|pm|msn|comcast|att|verizon|sbcglobal|ymail)\.(com|net|me|ch)$/i;

const TRANSACTIONAL_SUBJECT = /\b(your (order|delivery|package|receipt|invoice|payment|subscription|account|ride|trip|reservation|booking|appointment|ticket|refund|return|statement|bill|plan|membership|payout|deposit|transfer)|order (confirmed|confirmation|#|number|update|shipped|received|placed)|receipt|invoice (#|no|number|for)|has (shipped|been (shipped|delivered|received|processed|updated|cancel+ed|renewed|charged))|shipped|out for delivery|delivered|arriving|tracking (number|update|info)|confirmation (code|number|#)|confirm (your|this)|verify (your|this)|verification code|one-time (code|passcode)|security (alert|code|notice)|sign-?in (alert|attempt|from)|new (login|sign-?in|device)|password (reset|changed|updated)|reset your password|statement (is|for)|payment (received|confirmation|successful|failed|declined|reminder|due|processed)|payout|auto-?renew|renewal|reminder:|cancel+ation|cancel+ed|refund|your (weekly|monthly|daily) (summary|report|update)|account (update|notice|activity)|action required|two-factor|2fa|is now (available|live)|scheduled maintenance|calendar invitation|invitation:|accepted:|declined:|updated invitation)\b/i;
const PROMO_SUBJECT = /(\d{1,3}\s?% off|% off|\$\d+ off|sale (ends|starts)|flash sale|black friday|cyber monday|last chance|limited time|exclusive (offer|access|deal)|special offer|new (arrivals|collection|drop)|don'?t miss|weekly (digest|roundup|newsletter)|monthly (digest|roundup|newsletter)|newsletter|webinar|join us|introducing|now available|free (shipping|trial|gift)|deal of the|coupon|promo code|early access|save (up to|\d+)|ends (tonight|soon|today)|you'?re invited|top picks|trending|inside:|issue #\d+|edition)/i;
const VENDOR_SUBJECT = /\b(invoice|quote|estimate|proposal|statement|purchase order|po #|w-?9|contract|agreement|renewal (quote|proposal)|price list|rate card|partnership|collaboration|sponsorship|wholesale|order for|your order with us)\b/i;
const SPAM_HINTS = /\b(congratulations you('ve| have) won|lottery|prize claim|wire transfer|western union|nigerian|crypto (giveaway|investment)|guaranteed (returns|income)|work from home and earn|act now!!+|100% free!!+|viagra|casino bonus|claim your (reward|prize)|you have been selected|unclaimed (funds|money)|dear (beneficiary|winner)|urgent (business )?proposal|million (dollars|usd))\b/i;
const TRANSACTIONAL_BODY = /\b(do not reply to this (e-?mail|message)|this is an automated (message|email|notification)|this (e-?mail|message) was sent automatically|automatically generated|order (number|#)\s?:?\s?[a-z0-9-]{5,}|tracking (number|#)|estimated (arrival|delivery)|your (one-time|verification) code is|if you did not (make|request|initiate) this|manage (your )?(notification|email) (preferences|settings)|view (this )?(email )?in (your )?browser|to stop receiving)\b/i;
const PROMO_BODY = /\b(unsubscribe|manage preferences|email preferences|update your preferences|view in browser|you (are|'re) receiving this (email )?because|sent to .+ because you|no longer wish to receive|opt out)\b/i;
const HUMAN_INTENT = /\b(book|booking|appointment|available|availability|schedule|reschedule|quote|estimate|price|pricing|how much|cost|rates?|do you (do|offer|have|take|shoot)|can (i|we|you)|could (i|we|you)|would (you|it)|interested in|looking for|i'?d like|we'?d like|are you|is there|when (can|could|are)|what time|next week|this week|tomorrow|saturday|sunday|monday|tuesday|wednesday|thursday|friday|deposit|invoice for|running late|on my way|thank you so much|thanks so much|works for (me|us)|sounds (good|great)|my (wedding|daughter|son|family|partner|company|team)|we'?re (getting married|expecting|planning))\b/i;
const HUMAN_OPENING = /^(hi|hello|hey|good (morning|afternoon|evening)|dear)\b/i;

// ── Helpers ─────────────────────────────────────────────────────────────────

function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase().trim() : "";
}
function localPartOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(0, at).toLowerCase().trim() : email.toLowerCase().trim();
}
function matchDomain(domain: string, list: string[]): string | undefined {
  return list.find((d) => domain === d || domain.endsWith("." + d));
}
function prettyDomain(domain: string): string {
  const parts = domain.split(".");
  const core = parts.length >= 2 ? parts[parts.length - 2] : domain;
  return core.charAt(0).toUpperCase() + core.slice(1);
}

type Scores = Record<Exclude<MessageCategory, "PRIORITY">, number> & { PRIORITY: number };

// ── The classifier ──────────────────────────────────────────────────────────

export function classifyMessage(input: ClassifyInput): Classification {
  const body = (input.body ?? "").trim();
  const subject = (input.subject ?? "").trim();
  const text = `${subject}\n${body}`;
  const email = (input.senderEmail ?? "").toLowerCase().trim();
  const domain = email ? domainOf(email) : "";
  const local = email ? localPartOf(email) : "";
  const h = input.headers ?? {};
  const signals: string[] = [];
  const hasListHeaders = Boolean(h.listUnsubscribe || h.listId) || /\b(bulk|list|junk)\b/i.test(h.precedence ?? "");
  const autoSubmitted = /^(auto-generated|auto-replied|auto-notified)/i.test(h.autoSubmitted ?? "");
  const pretty = domain ? prettyDomain(domain) : "them";

  // 0. What this business has said.
  if (input.rules?.length && email) {
    const exact = input.rules.find((r) => r.kind === "email" && r.value.toLowerCase() === email);
    const byDomain = input.rules.find((r) => r.kind === "domain" && (domain === r.value.toLowerCase() || domain.endsWith("." + r.value.toLowerCase())));
    const rule = exact ?? byDomain;
    if (rule) {
      signals.push(`rule:${rule.kind}:${rule.value}`);
      return { category: rule.category, reason: `You marked ${rule.kind === "email" ? "this sender" : `mail from ${rule.value}`} as ${labelFor(rule.category).toLowerCase()}.`, signals, decidedBy: "rule" };
    }
  }

  // 1. What this business already knows. A bulk send from a customer's address is still
  //    bulk — but the relationship itself is untouched (that lives on the client record).
  if (input.knownCustomer && !hasListHeaders && !autoSubmitted) {
    signals.push("relationship:customer");
    return { category: "PRIORITY", reason: "Existing customer.", signals, decidedBy: "relationship" };
  }
  if (input.priorOutbound && !hasListHeaders && !autoSubmitted) {
    signals.push("relationship:you-replied");
    return { category: "PRIORITY", reason: "You've written to them before.", signals, decidedBy: "relationship" };
  }

  // 2. Junk.
  if (SPAM_HINTS.test(text)) {
    signals.push("body:spam");
    return { category: "SPAM", reason: "Reads like junk mail.", signals, decidedBy: "junk" };
  }

  // 3. Channel.
  if (input.channel !== "EMAIL") {
    signals.push(`channel:${input.channel.toLowerCase()}`);
    return { category: "PRIORITY", reason: `A message on ${input.channel === "SMS" ? "SMS" : input.channel === "WEBSITE" ? "your booking page" : input.channel.charAt(0) + input.channel.slice(1).toLowerCase()}.`, signals, decidedBy: "channel" };
  }

  // 4. Evidence.
  const s: Scores = { PRIORITY: 0, AUTOMATED: 0, PROMOTIONAL: 0, VENDOR: 0, INTERNAL: 0, SPAM: 0 };
  const add = (cat: keyof Scores, n: number, signal: string) => {
    s[cat] += n;
    signals.push(signal);
  };

  // Headers
  if (autoSubmitted) add("AUTOMATED", 6, "header:auto-submitted");
  if (h.listUnsubscribe) add("PROMOTIONAL", 3, "header:list-unsubscribe");
  if (h.listId) add("PROMOTIONAL", 3, "header:list-id");
  if (/\b(bulk|list)\b/i.test(h.precedence ?? "")) add("PROMOTIONAL", 2, "header:precedence-bulk");
  if (/\bjunk\b/i.test(h.precedence ?? "")) add("SPAM", 3, "header:precedence-junk");
  if (h.replyTo && MACHINE_LOCAL.test(localPartOf(h.replyTo))) add("AUTOMATED", 2, "header:reply-to-noreply");
  if (BULK_INFRA.test(`${h.messageId ?? ""} ${h.replyTo ?? ""} ${h.xMailer ?? ""}`)) add("PROMOTIONAL", 2, "header:bulk-infrastructure");

  // Sender address
  const machine = Boolean(local && MACHINE_LOCAL.test(local));
  const marketing = Boolean(local && MARKETING_LOCAL.test(local));
  const shared = Boolean(local && SHARED_LOCAL.test(local));
  if (machine) add("AUTOMATED", 4, `sender:${local}@`);
  if (marketing) add("PROMOTIONAL", 3, `sender:${local}@`);
  if (shared) add("VENDOR", 2, `sender:shared-mailbox:${local}@`);
  const personal = Boolean(local && !machine && !marketing && !shared && /^[a-z]+([._-][a-z]+)?\d{0,4}$/i.test(local));
  if (personal) add("PRIORITY", 1, "sender:personal-address");

  // Domain semantics
  const platform = domain && matchDomain(domain, PLATFORM_DOMAINS);
  const consumer = domain && matchDomain(domain, CONSUMER_DOMAINS);
  const freemail = Boolean(domain && FREEMAIL.test(domain));
  const teammate = Boolean(domain && input.businessDomains?.some((d) => d && (domain === d.toLowerCase() || domain.endsWith("." + d.toLowerCase()))));
  if (teammate) add("INTERNAL", 9, `domain:yours:${domain}`);
  if (platform) {
    // A platform you run the business on is a vendor whatever its mail looks like —
    // a Stripe payout and a Stripe marketing email both belong under "Vendors".
    signals.push(`domain:platform:${platform}`);
    return { category: "VENDOR", reason: `From ${prettyDomain(platform)}, a platform you use.`, signals, decidedBy: "evidence" };
  }
  if (consumer) add("AUTOMATED", 4, `domain:consumer:${consumer}`);
  if (freemail) add("PRIORITY", 2, "domain:personal-mail");
  if (domain && !platform && !consumer && !freemail && !teammate && (shared || VENDOR_SUBJECT.test(subject))) add("VENDOR", 2, `domain:business:${domain}`);

  // Subject
  if (TRANSACTIONAL_SUBJECT.test(subject)) add("AUTOMATED", 3, "subject:transactional");
  if (PROMO_SUBJECT.test(subject)) add("PROMOTIONAL", 3, "subject:promotional");
  if (VENDOR_SUBJECT.test(subject)) add("VENDOR", 2, "subject:vendor");
  if (/^(re|fwd?|aw|wg):/i.test(subject)) add("PRIORITY", 2, "subject:reply-thread");

  // Body
  if (TRANSACTIONAL_BODY.test(body)) add("AUTOMATED", 3, "body:transactional");
  if (PROMO_BODY.test(body)) add("PROMOTIONAL", 2, "body:unsubscribe");
  const asks = /\?/.test(body);
  const intent = HUMAN_INTENT.test(text);
  if (intent) add("PRIORITY", 3, "body:human-intent");
  if (asks) add("PRIORITY", 2, "body:question");
  if (HUMAN_OPENING.test(body)) add("PRIORITY", 1, "body:greeting");
  if (body.length > 0 && body.length < 600 && !/https?:\/\//.test(body)) add("PRIORITY", 1, "body:short-and-plain");
  if ((input.priorInboundCount ?? 0) >= 2) add("PRIORITY", 2, "relationship:repeat-sender");

  // A shared mailbox at a real business that asks you something is a person.
  if (shared && !platform && !consumer && intent && asks) add("PRIORITY", 3, "body:shared-mailbox-asking");

  // Decide. Priority needs to beat the strongest other reading; machines beat people
  // only when the evidence for a machine is real.
  // Tie-break order: who the sender is (your team, a platform) beats what the mail looks like.
  const others: (keyof Scores)[] = ["INTERNAL", "VENDOR", "AUTOMATED", "PROMOTIONAL", "SPAM"];
  const top = others.reduce((a, b) => (s[b] > s[a] ? b : a), others[0]);
  const topScore = s[top];
  let category: MessageCategory;
  if (topScore >= 4 && topScore > s.PRIORITY) category = top;
  else if (topScore >= 4 && topScore === s.PRIORITY) category = machine || autoSubmitted ? top : "PRIORITY";
  else category = "PRIORITY";

  return { category, reason: reasonFor(category, { machine, local, platform: platform || undefined, consumer: consumer || undefined, hasListHeaders, autoSubmitted, teammate, pretty, subjectTransactional: TRANSACTIONAL_SUBJECT.test(subject), intent, asks }), signals, decidedBy: "evidence" };
}

function reasonFor(
  category: MessageCategory,
  f: { machine: boolean; local: string; platform?: string; consumer?: string; hasListHeaders: boolean; autoSubmitted: boolean; teammate: boolean; pretty: string; subjectTransactional: boolean; intent: boolean; asks: boolean }
): string {
  switch (category) {
    case "AUTOMATED":
      if (f.autoSubmitted) return "Marked auto-generated by the sender.";
      if (f.consumer) return `Transactional notification from ${prettyDomain(f.consumer)}.`;
      if (f.machine) return `Sent from ${f.local}@ — an address nobody reads.`;
      if (f.subjectTransactional) return "Subject reads like a receipt or notification.";
      return "A machine-generated notification.";
    case "PROMOTIONAL":
      if (f.hasListHeaders) return "Mailing list or newsletter.";
      return "Reads like marketing.";
    case "VENDOR":
      if (f.platform) return `From ${prettyDomain(f.platform)}, a platform you use.`;
      return `A business you deal with, not a customer.`;
    case "INTERNAL":
      return "Someone on your team.";
    case "SPAM":
      return "Reads like junk mail.";
    default:
      if (f.intent && f.asks) return "Someone asking you something.";
      if (f.asks) return "A question for you.";
      return "A person writing to you.";
  }
}

export function labelFor(category: MessageCategory): string {
  return { PRIORITY: "Priority", AUTOMATED: "Automated", PROMOTIONAL: "Promotion", VENDOR: "Vendor", INTERNAL: "Internal", SPAM: "Spam" }[category];
}
