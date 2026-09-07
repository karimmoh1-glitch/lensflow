"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { sendOnChannel } from "@/lib/messaging";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

const leadFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().optional(),
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
  const { name, email, phone, preferredDate, message } = parsed.data;

  const business = await prisma.business.findUnique({ where: { handle } });
  if (!business) return { ok: false, error: "This business isn't accepting inquiries right now." };


  const client =
    (await prisma.client.findFirst({ where: { businessId: business.id, email } })) ??
    (await prisma.client.create({ data: { businessId: business.id, name, email, phone: phone || undefined } }));

  const conversation = await prisma.conversation.create({
    data: { businessId: business.id, clientId: client.id, channel: "WEBSITE", externalHandle: email, lastMessageAt: new Date() },
  });

  const body = [message, preferredDate ? `Preferred date: ${preferredDate}` : null]
    .filter(Boolean)
    .join("\n");

  await prisma.message.create({ data: { conversationId: conversation.id, direction: "INBOUND", body } });


  await prisma.lead.create({
    data: {
      businessId: business.id,
      clientId: client.id,
      conversationId: conversation.id,
      extractedName: name,
      requestedDateText: preferredDate || null,
      requestedDate: preferredDate ? new Date(preferredDate) : null,
      intent: "HIGH",
      lastInboundAt: new Date(),
    },
  });

  await prisma.notification.create({
    data: {
      businessId: business.id,
      title: "New website inquiry",
      body: `${name} wrote to you through your contact form.`,
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
