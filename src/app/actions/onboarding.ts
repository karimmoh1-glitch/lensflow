"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import type { IntegrationProvider } from "@prisma/client";

export type OnboardingPayload = {
  businessName: string;
  handle: string;
  specialties: string[];
  services: { name: string; priceCents: number; durationMins: number }[];
  workingDays: number[]; // 0-6
  startMin: number;
  endMin: number;
  depositPercent: number;
  paymentMethods: string[]; // "card" | "zelle" | "bank_transfer"
  connectedChannels: string[]; // "INSTAGRAM" | "EMAIL" | "SMS" | "WHATSAPP" | "CALENDAR"
  bio: string;
  timezone: string;
};

export async function completeOnboarding(payload: OnboardingPayload) {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) redirect("/login");
  const { business } = ctx;

  await prisma.$transaction(async (tx) => {
    await tx.business.update({
      where: { id: business.id },
      data: {
        name: payload.businessName,
        handle: payload.handle,
        specialties: payload.specialties,
        bio: payload.bio,
        timezone: payload.timezone,
        depositPercent: payload.depositPercent,
        paymentMethods: payload.paymentMethods,
        onboardingComplete: true,
        onboardingStep: 8,
      },
    });

    await tx.service.deleteMany({ where: { businessId: business.id } });
    await tx.service.createMany({
      data: payload.services.map((s, i) => ({
        businessId: business.id,
        name: s.name,
        priceCents: s.priceCents,
        durationMins: s.durationMins,
        sortOrder: i,
      })),
    });

    await tx.availability.deleteMany({ where: { businessId: business.id } });
    await tx.availability.createMany({
      data: payload.workingDays.map((weekday) => ({
        businessId: business.id,
        weekday,
        startMin: payload.startMin,
        endMin: payload.endMin,
      })),
    });

    const allProviders: IntegrationProvider[] = ["INSTAGRAM", "EMAIL", "SMS", "WHATSAPP", "CALENDAR", "STRIPE"];
    for (const provider of allProviders) {
      const connected = payload.connectedChannels.includes(provider) || provider === "STRIPE";
      await tx.integration.upsert({
        where: { businessId_provider: { businessId: business.id, provider } },
        create: {
          businessId: business.id,
          provider,
          status: connected ? "DEMO" : "NOT_CONNECTED",
          lastSyncedAt: connected ? new Date() : null,
        },
        update: {
          status: connected ? "DEMO" : "NOT_CONNECTED",
          lastSyncedAt: connected ? new Date() : null,
        },
      });
    }

    // Sensible default automations so the engine isn't empty on day one.
    const existingAutomations = await tx.automation.count({ where: { businessId: business.id } });
    if (existingAutomations === 0) {
      await tx.automation.createMany({
        data: [
          {
            businessId: business.id,
            name: "Booking confirmation",
            trigger: "BOOKING_CREATED",
            offsetHours: 0,
            action: "SEND_CONFIRMATION",
            messageTemplate: "Thanks for booking with {{business}}! We can't wait for your {{service}} session on {{date}}.",
          },
          {
            businessId: business.id,
            name: "Shoot reminder",
            trigger: "DAYS_BEFORE_SHOOT",
            offsetHours: 24,
            action: "SEND_REMINDER",
            messageTemplate: "Quick reminder: your {{service}} session is tomorrow at {{time}}. See you then!",
          },
          {
            businessId: business.id,
            name: "Payment reminder",
            trigger: "PAYMENT_DUE_SOON",
            offsetHours: 72,
            action: "SEND_PAYMENT_REMINDER",
            messageTemplate: "Friendly reminder — your remaining balance of {{amount}} is due soon.",
          },
          {
            businessId: business.id,
            name: "Thank-you follow-up",
            trigger: "SHOOT_COMPLETED",
            offsetHours: 24,
            action: "SEND_THANK_YOU",
            messageTemplate: "It was a pleasure photographing you! Your gallery will be ready soon — thank you for booking with {{business}}.",
          },
        ],
      });
    }
  });

  redirect("/dashboard");
}
