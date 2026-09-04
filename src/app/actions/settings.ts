"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const ADMIN_ROLES = ["OWNER", "ADMIN"] as const;

export async function updateBusinessProfile(data: {
  name: string;
  bio: string;
  timezone: string;
  bufferMinutes: number;
  bookingLeadHours: number;
}) {
  const ctx = await requireRole([...ADMIN_ROLES]);
  if (!ctx) throw new Error("unauthorized");
  await prisma.business.update({ where: { id: ctx.business.id }, data });
  revalidatePath("/dashboard/settings");
}

export async function updatePaymentSettings(data: {
  depositPercent: number;
  paymentMethods: string[];
  zelleHandle: string;
  bankInstructions: string;
}) {
  const ctx = await requireRole([...ADMIN_ROLES]);
  if (!ctx) throw new Error("unauthorized");
  await prisma.business.update({ where: { id: ctx.business.id }, data });
  revalidatePath("/dashboard/settings");
}

export async function saveServices(services: { id?: string; name: string; priceCents: number; durationMins: number }[]) {
  const ctx = await requireRole([...ADMIN_ROLES]);
  if (!ctx) throw new Error("unauthorized");
  const { business } = ctx;

  // Services are referenced by bookings, so they are never deleted from here: existing rows
  // are updated in place (ids stay stable), new rows are created, and anything the owner
  // removed is retired (active: false) so past bookings keep their service.
  await prisma.$transaction(async (tx) => {
    const existing = await tx.service.findMany({ where: { businessId: business.id }, select: { id: true } });
    const keep = new Set<string>();
    for (const [i, s] of services.entries()) {
      const data = { name: s.name.trim(), priceCents: Math.max(0, Math.round(s.priceCents)), durationMins: Math.max(5, Math.round(s.durationMins)), sortOrder: i, active: true };
      if (s.id && existing.some((e) => e.id === s.id)) {
        await tx.service.update({ where: { id: s.id }, data });
        keep.add(s.id);
      } else {
        const created = await tx.service.create({ data: { businessId: business.id, ...data } });
        keep.add(created.id);
      }
    }
    const retired = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
    if (retired.length) await tx.service.updateMany({ where: { id: { in: retired }, businessId: business.id }, data: { active: false } });
  });
  revalidatePath("/dashboard/settings");
}

export async function saveAvailability(windows: { weekday: number; startMin: number; endMin: number }[]) {
  const ctx = await requireRole([...ADMIN_ROLES]);
  if (!ctx) throw new Error("unauthorized");
  const { business } = ctx;

  await prisma.$transaction(async (tx) => {
    await tx.availability.deleteMany({ where: { businessId: business.id } });
    await tx.availability.createMany({ data: windows.map((w) => ({ businessId: business.id, ...w })) });
  });
  revalidatePath("/dashboard/settings");
}
