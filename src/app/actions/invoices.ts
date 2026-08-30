"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";

async function nextInvoiceNumber(businessId: string) {
  const count = await prisma.invoice.count({ where: { businessId } });
  return `INV-${String(count + 1).padStart(4, "0")}`;
}

export async function getOrCreateInvoice(bookingId: string): Promise<string> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) throw new Error("unauthorized");
  const { business } = ctx;

  const existing = await prisma.invoice.findFirst({ where: { bookingId, businessId: business.id } });
  if (existing) return existing.id;

  const booking = await prisma.booking.findFirst({ where: { id: bookingId, businessId: business.id }, include: { service: true } });
  if (!booking) throw new Error("not found");

  const invoice = await prisma.invoice.create({
    data: {
      businessId: business.id,
      bookingId: booking.id,
      clientId: booking.clientId,
      number: await nextInvoiceNumber(business.id),
      subtotalCents: booking.totalCents,
      totalCents: booking.totalCents,
      status: "SENT",
      dueDate: booking.startAt,
      sentAt: new Date(),
    },
  });

  revalidatePath(`/dashboard/bookings/${bookingId}`);
  return invoice.id;
}
