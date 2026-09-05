import { prisma } from "@/lib/db";
import { track } from "@/lib/analytics";
import { extractLeadInfo } from "@/lib/ai";
import { scoreLead } from "@/lib/leadScoring";
import { cleanEmailBody } from "@/lib/emailText";
import { classifyMessage } from "@/lib/classifyMessage";
import { findKnownClient } from "@/server/identity";
import type { ChannelType } from "@prisma/client";

/**
 * The single ingestion path every inbound channel funnels through — website form,
 * SMS webhook, email webhook, or the settings-page demo simulator. Whatever the
 * source, the result is the same: a normalized Conversation + Message + Lead, with
 * AI extraction (or its rule-based fallback) run once, in one place. Never invents a
 * field that wasn't actually present in the message.
 *
 * Continuation-aware: a second message from the same client on the same channel
 * appends to their existing open conversation instead of forking a new one — real
 * email threads (and real customers texting twice) would otherwise fracture into
 * duplicate conversations with duplicate leads, which is exactly the failure mode
 * this function exists to prevent. Every new message also re-runs extraction and
 * merges any newly-revealed fields into the lead (a first message with no date
 * followed by "Saturday works" should update the lead, not leave it stale) — a field
 * already known is never overwritten back to unknown just because a later message
 * didn't repeat it.
 */
export async function ingestInboundMessage(params: {
  businessId: string;
  channel: ChannelType;
  senderName: string;
  senderHandle: string;
  body: string;
  subject?: string;
  clientEmail?: string;
  clientPhone?: string;
  /** The provider's own id for this specific message (Resend's `message_id`, etc.) —
   * used to skip re-ingesting a webhook delivery Resend retries after a timeout. */
  providerMessageId?: string;
  /** Original pre-normalization content, kept only for internal debugging — never
   * rendered anywhere in the conversation UI. */
  rawBody?: string;
  /** Transport headers that reveal bulk or automated mail — passed through, never used to
   * drop anything. */
  headers?: { listUnsubscribe?: string | null; listId?: string | null; precedence?: string | null; autoSubmitted?: string | null; replyTo?: string | null; messageId?: string | null } | null;
}) {
  const { businessId, channel, senderName, senderHandle, subject, clientEmail, clientPhone, providerMessageId, rawBody, headers } = params;
  const body = channel === "EMAIL" ? cleanEmailBody(params.body) : params.body;

  // Idempotency: a webhook can legitimately be redelivered (provider retry after a slow
  // response, a duplicate event). If we've already stored this exact provider message,
  // return the conversation it landed in instead of creating a second copy.
  if (providerMessageId) {
    const existing = await prisma.message.findFirst({
      where: { providerMessageId, conversation: { businessId } },
      include: { conversation: true },
    });
    if (existing) return { client: null, conversation: existing.conversation, lead: null, duplicate: true as const, category: existing.conversation.category };
  }

  // Classify before creating anything. Receiving an email from someone does not make them
  // a client: only a message that reads as a person writing to this business (PRIORITY)
  // creates a client record and a lead. Everything else is stored as a conversation with
  // its category — visible in All Inbox, absent from Priority and from the CRM.
  // Who is this? Strong identifiers only (email, E.164 phone, Instagram id), tenant-scoped.
  const identity = await findKnownClient({ businessId, channel, senderHandle, senderName, email: clientEmail, phone: clientPhone });
  const senderEmail = identity.email ?? (channel === "EMAIL" ? senderHandle : null);
  const [rules, owners, priorInboundCount] = await Promise.all([
    // Only this business's corrections — never another tenant's.
    prisma.senderRule.findMany({ where: { businessId }, select: { kind: true, value: true, category: true } }),
    prisma.orgMembership.findMany({ where: { businessId, role: { in: ["OWNER", "ADMIN"] } }, select: { user: { select: { email: true } } } }),
    senderHandle ? prisma.message.count({ where: { direction: "INBOUND", conversation: { businessId, externalHandle: senderHandle } } }) : Promise.resolve(0),
  ]);
  const knownClient = identity.client;
  const priorOutbound = knownClient
    ? (await prisma.message.count({ where: { direction: "OUTBOUND", conversation: { businessId, clientId: knownClient.id } } })) > 0
    : false;
  // Teammates write from the business's own domain — but a gmail.com owner doesn't make
  // every gmail.com sender a teammate.
  const businessDomains = owners
    .map((o) => o.user.email.split("@")[1]?.toLowerCase())
    .filter((d): d is string => Boolean(d) && !/^(gmail|googlemail|yahoo|outlook|hotmail|live|icloud|me|aol|proton|protonmail|msn)\.(com|net|me)$/i.test(d));
  const classification = classifyMessage({
    channel,
    senderEmail,
    senderName,
    subject,
    body,
    headers,
    knownCustomer: Boolean(knownClient && (knownClient._count.bookings > 0 || knownClient._count.payments > 0 || knownClient.relationship === "CUSTOMER")),
    priorOutbound,
    priorInboundCount,
    businessDomains,
    rules: rules.map((r) => ({ kind: r.kind as "email" | "domain", value: r.value, category: r.category })),
  });

  if (classification.category !== "PRIORITY") {
    // Same-sender continuation for non-priority mail keys on the handle, since there is
    // no client record to key on.
    const existingQuiet = await prisma.conversation.findFirst({
      where: { businessId, clientId: null, channel, externalHandle: senderHandle, archived: false },
      orderBy: { lastMessageAt: "desc" },
    });
    const conversation =
      existingQuiet ??
      (await prisma.conversation.create({
        data: {
          businessId,
          channel,
          externalHandle: senderHandle,
          subject,
          lastMessageAt: new Date(),
          category: classification.category,
          categoryReason: classification.reason,
          categorySource: "rules",
        },
      }));
    await prisma.message.create({ data: { conversationId: conversation.id, direction: "INBOUND", body, providerMessageId, rawBody } });
    if (existingQuiet) await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date(), subject: existingQuiet.subject ?? subject } });
    else if ((await prisma.conversation.count({ where: { businessId, category: { not: "PRIORITY" } } })) === 1) await track("first_classified_conversation", { businessId, properties: { category: classification.category } });
    return { client: null, conversation, lead: null, duplicate: false as const, category: classification.category };
  }

  // A verified email address is a strong identity — matching on it alone avoids merging
  // two different people who happen to share a display name, and reliably finds the
  // same person across messages even if a sender's display name changes. Other channels
  // don't have as strong a signal, so they fall back to matching by name.
  const client =
    knownClient ??
    (await prisma.client.create({
      data: { businessId, name: senderName, email: clientEmail, phone: clientPhone, instagram: channel === "INSTAGRAM" ? senderHandle : undefined },
    }));

  const existingConversation = await prisma.conversation.findFirst({
    where: { businessId, clientId: client.id, channel, archived: false },
    include: { lead: true },
    orderBy: { lastMessageAt: "desc" },
  });

  const services = await prisma.service.findMany({ where: { businessId, active: true } });
  const extracted = await extractLeadInfo(body);
  const matchedService = extracted.serviceHint
    ? services.find((s) => s.name.toLowerCase().includes(extracted.serviceHint!.toLowerCase()))
    : null;

  if (existingConversation) {
    await prisma.message.create({
      data: { conversationId: existingConversation.id, direction: "INBOUND", body, providerMessageId, rawBody },
    });
    await prisma.conversation.update({
      where: { id: existingConversation.id },
      data: { lastMessageAt: new Date(), subject: existingConversation.subject ?? subject },
    });

    if (existingConversation.lead) {
      const lead = existingConversation.lead;
      // Merge: a newly-extracted field wins; otherwise keep whatever was already known.
      const mergedName = extracted.name ?? lead.extractedName;
      const mergedServiceId = matchedService?.id ?? lead.serviceId;
      const mergedDateText = extracted.dateText ?? lead.requestedDateText;
      const mergedLocation = extracted.location ?? lead.requestedLocation;
      const mergedBudgetCents = extracted.budgetCents ?? lead.budgetCents;
      const mergedIntent = extracted.intent !== "UNKNOWN" ? extracted.intent : lead.intent;
      const mergedServicePrice = matchedService?.priceCents ?? services.find((s) => s.id === mergedServiceId)?.priceCents;

      const { score, reasons } = scoreLead({
        intent: mergedIntent,
        hasRequestedDate: Boolean(mergedDateText),
        requestedDate: lead.requestedDate,
        serviceValueCents: mergedServicePrice ?? lead.estimatedValueCents,
        hoursSinceLastInbound: 0,
        hasRespondedYet: false,
        fieldsKnownCount: [mergedName, mergedServiceId, mergedDateText, mergedLocation, mergedBudgetCents].filter(Boolean).length,
      });

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          extractedName: mergedName,
          serviceId: mergedServiceId,
          requestedDateText: mergedDateText,
          requestedLocation: mergedLocation,
          budgetCents: mergedBudgetCents,
          intent: mergedIntent,
          score,
          scoreReasons: reasons,
          estimatedValueCents: mergedServicePrice ?? lead.estimatedValueCents,
          lastInboundAt: new Date(),
          respondedAt: null,
        },
      });
    }

    await prisma.notification.create({
      data: { businessId, title: "New message", body: `${client.name} sent a new message on ${channel.toLowerCase()}.` },
    });

    return { client, conversation: existingConversation, lead: existingConversation.lead, duplicate: false as const, category: "PRIORITY" as const };
  }

  const conversation = await prisma.conversation.create({
    data: { businessId, clientId: client.id, channel, externalHandle: senderHandle, subject, lastMessageAt: new Date(), category: "PRIORITY", categoryReason: classification.reason, categorySource: "rules" },
  });

  await prisma.message.create({ data: { conversationId: conversation.id, direction: "INBOUND", body, providerMessageId, rawBody } });

  const { score, reasons } = scoreLead({
    intent: extracted.intent,
    hasRequestedDate: Boolean(extracted.dateText),
    requestedDate: null,
    serviceValueCents: matchedService?.priceCents ?? 0,
    hoursSinceLastInbound: 0,
    hasRespondedYet: false,
    fieldsKnownCount: [extracted.name, matchedService, extracted.dateText, extracted.location, extracted.budgetCents].filter(Boolean).length,
  });

  const lead = await prisma.lead.create({
    data: {
      businessId,
      clientId: client.id,
      conversationId: conversation.id,
      extractedName: extracted.name ?? senderName,
      serviceId: matchedService?.id,
      requestedDateText: extracted.dateText,
      requestedLocation: extracted.location,
      budgetCents: extracted.budgetCents,
      intent: extracted.intent,
      score,
      scoreReasons: reasons,
      estimatedValueCents: matchedService?.priceCents ?? extracted.budgetCents ?? 0,
      lastInboundAt: new Date(),
    },
  });

  await prisma.notification.create({
    data: { businessId, title: "New lead", body: `${extracted.name ?? senderName} messaged you on ${channel.toLowerCase()}.` },
  });

  return { client, conversation, lead, duplicate: false as const, category: "PRIORITY" as const };
}
