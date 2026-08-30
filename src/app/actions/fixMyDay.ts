"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { addHours } from "date-fns";

export type FixMyDayItem = {
  id: string;
  title: string;
  href: string;
  actionLabel: string;
};

export async function runFixMyDay(): Promise<FixMyDayItem[]> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) return [];
  const { business } = ctx;
  const now = new Date();
  const soon = addHours(now, 48);

  const [unconfirmedSoon, missingQuestionnaire, unpaidBalances, unansweredLeads] = await Promise.all([
    prisma.booking.findMany({
      where: { businessId: business.id, status: "BOOKED", startAt: { gte: now, lte: soon } },
      include: { client: true },
    }),
    prisma.booking.findMany({
      where: {
        businessId: business.id,
        startAt: { gte: now, lte: soon },
        status: { notIn: ["CANCELED", "INQUIRY"] },
        questionnaire: { is: null },
      },
      include: { client: true },
    }),
    prisma.payment.findMany({
      where: { businessId: business.id, status: "AWAITING_CONFIRMATION" },
      include: { client: true },
    }),
    prisma.lead.findMany({
      where: { businessId: business.id, respondedAt: null, status: { in: ["NEW", "CONTACTED"] } },
      orderBy: { lastInboundAt: "asc" },
      take: 5,
    }),
  ]);

  const items: FixMyDayItem[] = [];

  for (const b of unconfirmedSoon) {
    items.push({
      id: `confirm-${b.id}`,
      title: `${b.client.name} hasn't confirmed their upcoming shoot`,
      href: `/dashboard/bookings/${b.id}`,
      actionLabel: "Review booking",
    });
  }

  for (const p of unpaidBalances) {
    items.push({
      id: `payment-${p.id}`,
      title: `${p.client.name} has a payment awaiting confirmation — $${(p.amountCents / 100).toFixed(0)}`,
      href: `/dashboard/payments`,
      actionLabel: "Confirm payment",
    });
  }

  for (const lead of unansweredLeads) {
    items.push({
      id: `lead-${lead.id}`,
      title: `${lead.extractedName || "A lead"}'s inquiry hasn't received a response`,
      href: `/dashboard/inbox`,
      actionLabel: "Draft reply",
    });
  }

  for (const b of missingQuestionnaire) {
    items.push({
      id: `quest-${b.id}`,
      title: `${b.client.name}'s upcoming shoot is missing a questionnaire`,
      href: `/dashboard/bookings/${b.id}`,
      actionLabel: "Send questionnaire",
    });
  }

  return items.slice(0, 8);
}
