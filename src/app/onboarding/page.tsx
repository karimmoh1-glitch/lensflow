import { redirect } from "next/navigation";
import { requireBusiness } from "@/lib/auth";
import { Wizard } from "./Wizard";

export default async function OnboardingPage() {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (ctx.role === "CLIENT") redirect("/portal");
  if (ctx.role === "PARTNER") redirect("/partner");
  if (ctx.business.onboardingComplete) redirect("/dashboard");

  return <Wizard businessName={ctx.business.name} />;
}
