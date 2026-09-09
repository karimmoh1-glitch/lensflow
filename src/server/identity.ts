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
  const include = { _count: { select: { bookings: true } } } as const;
  if (email) {
    const byEmail = await prisma.client.findFirst({ where: { businessId, email: { equals: email, mode: "insensitive" } }, include });
    if (byEmail) return { client: byEmail, matchedOn: "email" as const, email, phone };
  }
  if (phone) {
    const byPhone = await prisma.client.findFirst({ where: { businessId, phone }, include });
    if (byPhone) return { client: byPhone, matchedOn: "phone" as const, email, phone };
    // Older rows may hold the same number in a different format — "(512) 555-0148" written
    // by hand, a WhatsApp wa_id with no plus. Narrow to rows whose stored number contains
    // the same national tail, then confirm on the normalized value: the tail only chooses
    // candidates, it never decides a match, so two different people can't be merged.
    // The last four digits survive every human format ("(512) 555-0199", "512.555.0199"),
    // so they pick the candidates; the normalized comparison below is what decides.
    const tail = phone.replace(/\D/g, "").slice(-4);
    if (tail.length === 4) {
      const candidates = await prisma.client.findMany({ where: { businessId, phone: { contains: tail } }, include, orderBy: { updatedAt: "desc" }, take: 50 });
      const hit = candidates.find((c) => normalizePhone(c.phone) === phone);
      if (hit) return { client: hit, matchedOn: "phone" as const, email, phone };
    }
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

export type MergeCandidate = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  /** Exact identifier in common (strong) or the same full name with nothing contradicting it (suggested). */
  basis: "email" | "phone" | "instagram" | "name";
  why: string;
  conversations: number;
  bookings: number;
};

/**
 * Other records in the same business that may be this person. An identifier in common is
 * strong evidence; the same full name (two or more words) with no conflicting email or
 * phone is only a suggestion. A single first name never qualifies, and a person the owner
 * already said is someone else stays out. The owner decides; nothing merges on its own.
 */
export async function findMergeCandidates(businessId: string, clientId: string): Promise<MergeCandidate[]> {
  const me = await prisma.client.findFirst({ where: { id: clientId, businessId } });
  if (!me) return [];
  const email = normalizeEmail(me.email);
  const phone = normalizePhone(me.phone);
  const fullName = me.name.trim().replace(/\s+/g, " ");
  const nameQualifies = fullName.split(" ").length >= 2;
  const or: Array<Record<string, unknown>> = [];
  if (email) or.push({ email: { equals: email, mode: "insensitive" } });
  if (phone) or.push({ phone: { contains: phone.replace(/\D/g, "").slice(-4) } });
  if (me.instagram) or.push({ instagram: me.instagram });
  if (nameQualifies) or.push({ name: { equals: fullName, mode: "insensitive" } });
  if (or.length === 0) return [];
  const rows = await prisma.client.findMany({
    where: { businessId, id: { not: me.id, notIn: me.notSameAs }, OR: or },
    include: { _count: { select: { conversations: true, bookings: true } } },
    take: 20,
  });
  const out: MergeCandidate[] = [];
  for (const c of rows) {
    if (c.notSameAs.includes(me.id)) continue;
    const cEmail = normalizeEmail(c.email);
    const cPhone = normalizePhone(c.phone);
    let basis: MergeCandidate["basis"] | null = null;
    let why = "";
    if (email && cEmail === email) { basis = "email"; why = `Same email address, ${email}.`; }
    else if (phone && cPhone === phone) { basis = "phone"; why = `Same phone number, ${phone}.`; }
    else if (me.instagram && c.instagram === me.instagram) { basis = "instagram"; why = "Same Instagram account."; }
    else if (nameQualifies && c.name.trim().replace(/\s+/g, " ").toLowerCase() === fullName.toLowerCase()) {
      // Same name is a suggestion only when nothing on either record says otherwise.
      const conflict = (email && cEmail && cEmail !== email) || (phone && cPhone && cPhone !== phone);
      if (conflict) continue;
      basis = "name"; why = "Same name on another channel. Not proven — check before merging.";
    }
    if (!basis) continue;
    out.push({ id: c.id, name: c.name, email: c.email, phone: c.phone, instagram: c.instagram, basis, why, conversations: c._count.conversations, bookings: c._count.bookings });
  }
  return out.sort((a, b) => (a.basis === "name" ? 1 : 0) - (b.basis === "name" ? 1 : 0));
}

/**
 * Folds `mergeId` into `keepId`: every conversation, lead, booking, note, payment,
 * invoice, membership and referral moves; a missing identifier on the kept record is
 * filled from the other, a known one is never overwritten; the merged row is deleted.
 * Both must belong to the business. Atomic.
 */
export async function mergeClientRecords(businessId: string, keepId: string, mergeId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (keepId === mergeId) return { ok: false, error: "That's the same record." };
  const [keep, gone] = await Promise.all([prisma.client.findFirst({ where: { id: keepId, businessId } }), prisma.client.findFirst({ where: { id: mergeId, businessId } })]);
  if (!keep || !gone) return { ok: false, error: "One of these people isn't in this workspace." };
  if (keep.userId && gone.userId) return { ok: false, error: "Both records have a portal login; remove one login first." };
  await prisma.$transaction(async (tx) => {
    await tx.conversation.updateMany({ where: { clientId: gone.id, businessId }, data: { clientId: keep.id } });
    await tx.lead.updateMany({ where: { clientId: gone.id, businessId }, data: { clientId: keep.id } });
    await tx.booking.updateMany({ where: { clientId: gone.id, businessId }, data: { clientId: keep.id } });
    await tx.clientNote.updateMany({ where: { clientId: gone.id }, data: { clientId: keep.id } });
    await tx.payment.updateMany({ where: { clientId: gone.id, businessId }, data: { clientId: keep.id } });
    await tx.invoice.updateMany({ where: { clientId: gone.id, businessId }, data: { clientId: keep.id } });
    await tx.subscription.updateMany({ where: { clientId: gone.id }, data: { clientId: keep.id } });
    await tx.invitation.updateMany({ where: { clientId: gone.id }, data: { clientId: keep.id } });
    await tx.client.updateMany({ where: { referredById: gone.id, businessId }, data: { referredById: keep.id } });
    await tx.client.update({
      where: { id: keep.id },
      data: {
        email: keep.email ?? gone.email ?? undefined,
        phone: keep.phone ?? gone.phone ?? undefined,
        instagram: keep.instagram ?? gone.instagram ?? undefined,
        userId: keep.userId ?? gone.userId ?? undefined,
        relationship: keep.relationship === "CUSTOMER" || gone.relationship === "CUSTOMER" ? "CUSTOMER" : keep.relationship,
        notesText: [keep.notesText, gone.notesText].filter(Boolean).join("\n") || undefined,
        notSameAs: { set: Array.from(new Set([...keep.notSameAs, ...gone.notSameAs].filter((id) => id !== gone.id && id !== keep.id))) },
      },
    });
    if (gone.userId) await tx.client.update({ where: { id: gone.id }, data: { userId: null } });
    await tx.client.delete({ where: { id: gone.id } });
  });
  return { ok: true };
}
