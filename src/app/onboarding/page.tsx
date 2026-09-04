import { redirect } from "next/navigation";
import { requireBusiness } from "@/lib/auth";
import { Wizard } from "./Wizard";
import { track } from "@/lib/analytics";
import { prisma } from "@/lib/db";

export default async function OnboardingPage() {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (ctx.role === "CLIENT") redirect("/portal");
  if (ctx.role === "PARTNER") redirect("/partner");
  if (ctx.business.onboardingComplete) redirect("/dashboard");

  // Funnel: the first visit to onboarding, once per business.
  const started = await prisma.analyticsEvent.count({ where: { businessId: ctx.business.id, name: "onboarding_started" } });
  if (started === 0) await track("onboarding_started", { businessId: ctx.business.id });
  return <Wizard businessName={ctx.business.name} />;
}
