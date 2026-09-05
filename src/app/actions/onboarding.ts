"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { track } from "@/lib/analytics";
import type { IntegrationProvider } from "@prisma/client";

export type OnboardingPayload = {
  businessName: string;
  handle: string;
  specialties: string[];
  priorities?: string[]; // "messages" | "clients" | "bookings" | "payments" | "follow-ups"
  businessType?: string | null;
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
        priorities: payload.priorities ?? [],
        businessType: payload.businessType ?? undefined,
        onboardingStep: 7,
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

    // What the owner said they use. Nothing is "connected" here — a real authorization
    // happens later from Settings → Integrations; this only remembers what to guide them to.
    const wantedKeys = new Set(payload.connectedChannels.map((c) => (c === "CALENDAR" ? "GOOGLE_CALENDAR" : c)));
    const guidable: IntegrationProvider[] = ["EMAIL", "INSTAGRAM", "WHATSAPP", "SMS", "GOOGLE_CALENDAR", "APPLE_CALENDAR"];
    for (const provider of guidable) {
      const existing = await tx.integration.findUnique({ where: { businessId_provider: { businessId: business.id, provider } } });
      if (existing && existing.status !== "NOT_CONNECTED" && existing.status !== "DEMO") continue; // never touch a real connection
      await tx.integration.upsert({
        where: { businessId_provider: { businessId: business.id, provider } },
        create: { businessId: business.id, provider, status: "NOT_CONNECTED", wanted: wantedKeys.has(provider) },
        update: { status: "NOT_CONNECTED", wanted: wantedKeys.has(provider), lastSyncedAt: null },
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
            name: "Booking reminder",
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
            messageTemplate: "It was a pleasure working with you! Your files will be ready soon — thank you for booking with {{business}}.",
          },
        ],
      });
    }
  });

  await track("onboarding_completed", {
    businessId: business.id,
    properties: { moduleCount: payload.connectedChannels.length, serviceCount: payload.services.length },
  });

  // Straight into connecting what they said they use; skippable.
  redirect(payload.connectedChannels.length > 0 ? "/onboarding/connect" : "/dashboard");
}
