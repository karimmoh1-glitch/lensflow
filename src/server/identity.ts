import { prisma } from "@/lib/db";
import type { ChannelType } from "@prisma/client";

/**
 * Who is this? One person reaches a business from several places; Daythread joins them only
 * on strong, exact identifiers — an email address, an E.164 phone number, an Instagram
 * account id — never on a name alone across channels. A booking-page submission with an
 * email joins the email identity; an SMS or WhatsApp joins on the phone; Instagram joins on
 * the sender id. Uncertain matches stay separate; a human can merge later. Always
 * tenant-scoped.
 */
export type IdentityInput = { businessId: string; channel: ChannelType; senderHandle: string; senderName: string; email?: string | null; phone?: string | null };

export function normalizeEmail(v: string | null | undefined): string | null {
  const e = (v ?? "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null;
}

/** Digits only, with a leading + when it looks like an international number. */
export function normalizePhone(v: string | null | undefined): string | null {
  if (!v) return null;
  const digits = v.replace(/[^\d+]/g, "");
  if (!digits) return null;
  const core = digits.replace(/^\+/, "");
  if (core.length < 7 || core.length > 15) return null;
  // Ten US digits get their country code so "(512) 555-0148" and "+15125550148" are one person.
  const e164 = core.length === 10 ? `+1${core}` : `+${core}`;
  return e164;
}

export async function findKnownClient(input: IdentityInput) {
  const { businessId, channel } = input;
  const email = normalizeEmail(input.email ?? (channel === "EMAIL" ? input.senderHandle : null));
  const phone = normalizePhone(input.phone ?? (channel === "SMS" || channel === "WHATSAPP" ? input.senderHandle : null));
  const include = { _count: { select: { bookings: true, payments: true } } } as const;
  if (email) {
    const byEmail = await prisma.client.findFirst({ where: { businessId, email: { equals: email, mode: "insensitive" } }, include });
    if (byEmail) return { client: byEmail, matchedOn: "email" as const, email, phone };
  }
  if (phone) {
    const byPhone = await prisma.client.findFirst({ where: { businessId, phone }, include });
    if (byPhone) return { client: byPhone, matchedOn: "phone" as const, email, phone };
    // Older rows may hold the number in a different format.
    const loose = await prisma.client.findFirst({ where: { businessId, phone: { not: null } }, include, orderBy: { updatedAt: "desc" }, ...(phone ? {} : {}) });
    if (loose && normalizePhone(loose.phone) === phone) return { client: loose, matchedOn: "phone" as const, email, phone };
  }
  if (channel === "INSTAGRAM") {
    const byIg = await prisma.client.findFirst({ where: { businessId, instagram: input.senderHandle }, include });
    if (byIg) return { client: byIg, matchedOn: "instagram" as const, email, phone };
  }
  if (channel === "WEBSITE" && !email && !phone) {
    // A booking-page submission with neither email nor phone can only match by exact name on
    // the same channel (weak, and only within WEBSITE-originated records).
    const byName = await prisma.client.findFirst({ where: { businessId, name: input.senderName, email: null, phone: null }, include });
    if (byName) return { client: byName, matchedOn: "name" as const, email, phone };
  }
  return { client: null, matchedOn: null, email, phone };
}
