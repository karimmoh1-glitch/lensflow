import { prisma } from "@/lib/db";
import { extractLeadInfo } from "@/lib/ai";
import { scoreLead } from "@/lib/leadScoring";
import type { ChannelType } from "@prisma/client";

/**
 * The single ingestion path every inbound channel funnels through — website form,
 * SMS webhook, email webhook, or the settings-page demo simulator. Whatever the
 * source, the result is the same: a normalized Conversation + Message + Lead, with
 * AI extraction (or its rule-based fallback) run once, in one place. Never invents a
 * field that wasn't actually present in the message.
 */
export async function ingestInboundMessage(params: {
  businessId: string;
  channel: ChannelType;
  senderName: string;
  senderHandle: string;
  body: string;
  clientEmail?: string;
  clientPhone?: string;
}) {
  const { businessId, channel, senderName, senderHandle, body, clientEmail, clientPhone } = params;

  const client =
    (await prisma.client.findFirst({
      where: { businessId, OR: [clientEmail ? { email: clientEmail } : undefined, { name: senderName }].filter(Boolean) as object[] },
    })) ??
    (await prisma.client.create({
      data: { businessId, name: senderName, email: clientEmail, phone: clientPhone, instagram: channel === "INSTAGRAM" ? senderHandle : undefined },
    }));

  const conversation = await prisma.conversation.create({
    data: { businessId, clientId: client.id, channel, externalHandle: senderHandle, lastMessageAt: new Date() },
  });

  await prisma.message.create({ data: { conversationId: conversation.id, direction: "INBOUND", body } });

  const extracted = await extractLeadInfo(body);
  const services = await prisma.service.findMany({ where: { businessId, active: true } });
  const matchedService = extracted.serviceHint
    ? services.find((s) => s.name.toLowerCase().includes(extracted.serviceHint!.toLowerCase()))
    : null;

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

  return { client, conversation, lead };
}
