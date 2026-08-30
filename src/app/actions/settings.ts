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

  await prisma.$transaction(async (tx) => {
    await tx.service.deleteMany({ where: { businessId: business.id } });
    await tx.service.createMany({
      data: services.map((s, i) => ({ businessId: business.id, name: s.name, priceCents: s.priceCents, durationMins: s.durationMins, sortOrder: i })),
    });
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
