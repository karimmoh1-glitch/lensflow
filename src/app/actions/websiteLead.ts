"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { findKnownClient } from "@/server/identity";
import { sendOnChannel } from "@/lib/messaging";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { notifyBusiness } from "@/server/notify";

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
  const ip = await getClientIp();
  if (!rateLimit(`website-lead:${ip}`, { limit: 15, windowMs: 60 * 60 * 1000 }).ok) {
    return { ok: false, error: "Too many submissions. Please try again later." };
  }

  const parsed = leadFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { name, email, phone, serviceId, preferredDate, message } = parsed.data;

  const business = await prisma.business.findUnique({ where: { handle } });
  if (!business) return { ok: false, error: "This business isn't accepting inquiries right now." };

  const service = serviceId ? await prisma.service.findFirst({ where: { id: serviceId, businessId: business.id } }) : null;

  // Same identity rule as every channel: a normalized email or E.164 phone joins the
  // person who already wrote in, so a form submission never creates a second "Sarah".
  const known = await findKnownClient({ businessId: business.id, channel: "WEBSITE", senderHandle: email, senderName: name, email, phone: phone || null });
  const client =
    known.client ??
    (await prisma.client.create({ data: { businessId: business.id, name, email: known.email ?? email.trim().toLowerCase(), phone: known.phone ?? (phone || undefined) } }));
  // A known person who just told us a new identifier keeps it; a known value is never replaced.
  if (known.client && ((!known.client.email && known.email) || (!known.client.phone && known.phone))) {
    await prisma.client.update({ where: { id: client.id }, data: { email: known.client.email ?? known.email ?? undefined, phone: known.client.phone ?? known.phone ?? undefined } });
  }

  const conversation = await prisma.conversation.create({
    data: { businessId: business.id, clientId: client.id, channel: "WEBSITE", externalHandle: email, lastMessageAt: new Date() },
  });

  const body = [message, service ? `Interested in: ${service.name}` : null, preferredDate ? `Preferred date: ${preferredDate}` : null]
    .filter(Boolean)
    .join("\n");

  await prisma.message.create({ data: { conversationId: conversation.id, direction: "INBOUND", body } });


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
      estimatedValueCents: service?.priceCents ?? 0,
      lastInboundAt: new Date(),
    },
  });

  await notifyBusiness(business.id, { kind: "lead", title: "New website inquiry", body: `${name} submitted your website contact form${service ? ` about ${service.name}` : ""}.`, target: { kind: "conversation", id: conversation.id } });

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
