import { prisma } from "@/lib/db";
import { extractLeadInfo } from "@/lib/ai";
import { scoreLead } from "@/lib/leadScoring";
import { cleanEmailBody } from "@/lib/emailText";
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
}) {
  const { businessId, channel, senderName, senderHandle, subject, clientEmail, clientPhone, providerMessageId, rawBody } = params;
  const body = channel === "EMAIL" ? cleanEmailBody(params.body) : params.body;

  // Idempotency: a webhook can legitimately be redelivered (provider retry after a slow
  // response, a duplicate event). If we've already stored this exact provider message,
  // return the conversation it landed in instead of creating a second copy.
  if (providerMessageId) {
    const existing = await prisma.message.findFirst({
      where: { providerMessageId, conversation: { businessId } },
      include: { conversation: true },
    });
    if (existing) return { client: null, conversation: existing.conversation, lead: null, duplicate: true as const };
  }

  // A verified email address is a strong identity — matching on it alone avoids merging
  // two different people who happen to share a display name, and reliably finds the
  // same person across messages even if a sender's display name changes. Other channels
  // don't have as strong a signal, so they fall back to matching by name.
  const client =
    (await prisma.client.findFirst({
      where: clientEmail ? { businessId, email: clientEmail } : { businessId, name: senderName },
    })) ??
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

    return { client, conversation: existingConversation, lead: existingConversation.lead, duplicate: false as const };
  }

  const conversation = await prisma.conversation.create({
    data: { businessId, clientId: client.id, channel, externalHandle: senderHandle, subject, lastMessageAt: new Date() },
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

  return { client, conversation, lead, duplicate: false as const };
}
