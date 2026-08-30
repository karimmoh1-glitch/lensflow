"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { scoreLead } from "@/lib/leadScoring";
import { sendOnChannel } from "@/lib/messaging";

const leadFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().optional(),
  serviceId: z.string().optional(),
  preferredDate: z.string().optional(),
  message: z.string().min(1, "Tell us a bit about what you're looking for"),
});

export type WebsiteLeadInput = z.infer<typeof leadFormSchema>;

/**
 * A genuinely functional inbound channel — no API key, no OAuth, no external provider.
 * A business embeds /embed/[handle] on their own site; submissions land here and flow
 * through the exact same lead pipeline as every other channel.
 */
export async function submitWebsiteLead(
  handle: string,
  input: WebsiteLeadInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = leadFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { name, email, phone, serviceId, preferredDate, message } = parsed.data;

  const business = await prisma.business.findUnique({ where: { handle } });
  if (!business) return { ok: false, error: "This studio isn't accepting inquiries right now." };

  const service = serviceId ? await prisma.service.findFirst({ where: { id: serviceId, businessId: business.id } }) : null;

  const client =
    (await prisma.client.findFirst({ where: { businessId: business.id, email } })) ??
    (await prisma.client.create({ data: { businessId: business.id, name, email, phone: phone || undefined } }));

  const conversation = await prisma.conversation.create({
    data: { businessId: business.id, clientId: client.id, channel: "WEBSITE", externalHandle: email, lastMessageAt: new Date() },
  });

  const body = [message, service ? `Interested in: ${service.name}` : null, preferredDate ? `Preferred date: ${preferredDate}` : null]
    .filter(Boolean)
    .join("\n");

  await prisma.message.create({ data: { conversationId: conversation.id, direction: "INBOUND", body } });

  // The form gives us structured facts directly — no need to guess what a free-text
  // parser would infer, since the customer told us explicitly via the form fields.
  const { score, reasons } = scoreLead({
    intent: "HIGH", // filling out a form with a specific service/date is a strong signal
    hasRequestedDate: Boolean(preferredDate),
    requestedDate: preferredDate ? new Date(preferredDate) : null,
    serviceValueCents: service?.priceCents ?? 0,
    hoursSinceLastInbound: 0,
    hasRespondedYet: false,
    fieldsKnownCount: [name, service, preferredDate, phone].filter(Boolean).length,
  });

  await prisma.lead.create({
    data: {
      businessId: business.id,
      clientId: client.id,
      conversationId: conversation.id,
      extractedName: name,
      serviceId: service?.id,
      requestedDateText: preferredDate || null,
      requestedDate: preferredDate ? new Date(preferredDate) : null,
      intent: "HIGH",
      score,
      scoreReasons: reasons,
      estimatedValueCents: service?.priceCents ?? 0,
      lastInboundAt: new Date(),
    },
  });

  await prisma.notification.create({
    data: {
      businessId: business.id,
      title: "New website inquiry",
      body: `${name} submitted your website contact form${service ? ` about ${service.name}` : ""}.`,
    },
  });

  const owner = await prisma.orgMembership.findFirst({ where: { businessId: business.id, role: "OWNER" }, include: { user: true } });
  if (owner) {
    await sendOnChannel({
      channel: "EMAIL",
      to: owner.user.email,
      subject: `New inquiry from ${name}`,
      body: `${name} (${email}) submitted your website contact form:\n\n${body}`,
    });
  }

  return { ok: true };
}
