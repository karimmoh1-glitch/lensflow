import { redirect } from "next/navigation";
import { requireBusiness } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { prisma } from "@/lib/db";
import { PROVIDERS, providerConfigured, displayStatus } from "@/lib/integrations/registry";
import { tokenCryptoConfigured } from "@/lib/tokenCrypto";
import { Welcome, type ChannelOption, type PersonalWelcome } from "./Welcome";
import { connectGoogle } from "@/app/actions/googleAuth";
import { connectInstagram, connectWhatsApp } from "@/app/actions/connect";
import { smsEntitled, trialEligible } from "@/lib/billing";
import { subscriptionBillingIsLive } from "@/lib/subscriptionBilling";
import { getPersonalization } from "@/server/personalization";
import { buildSteps } from "@/lib/personalization";
import type { IntegrationProvider } from "@prisma/client";

/**
 * After the account exists. With a profile from /start: a short, honest "building" moment
 * (each line is a write that already happened), a welcome built from their answers, the
 * plan they chose or were recommended, then the connect step with their channels first.
 * Without one (mobile signup, an invite): the plain welcome and connect step. Every
 * connect button is the same real provider sign-in as Settings → Channels.
 */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string; connected?: string; connect_error?: string }> }) {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (ctx.role === "CLIENT") redirect("/workspaces");
  if (ctx.business.onboardingComplete) redirect("/dashboard/inbox");
  const sp = await searchParams;

  const [started, rows, personalization] = await Promise.all([
    prisma.analyticsEvent.count({ where: { businessId: ctx.business.id, name: "onboarding_started" } }),
    prisma.integration.findMany({ where: { businessId: ctx.business.id } }),
    getPersonalization(ctx.business.id),
  ]);
  if (started === 0) await track("onboarding_started", { businessId: ctx.business.id, properties: { personalized: Boolean(personalization) } });

  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  const encryptionOk = process.env.NODE_ENV !== "production" || tokenCryptoConfigured();
  const order: IntegrationProvider[] = ["EMAIL", "INSTAGRAM", "WHATSAPP", "SMS"];
  const wantedFirst = personalization ? [...personalization.connectProviders.filter((p): p is Exclude<typeof p, "GOOGLE_CALENDAR"> => p !== "GOOGLE_CALENDAR"), ...order.filter((p) => !personalization.connectProviders.includes(p as never))] : order;
  const channels: ChannelOption[] = wantedFirst.map((provider) => {
    const spec = PROVIDERS[provider as keyof typeof PROVIDERS];
    const configured = providerConfigured(spec) && (spec.auth === "oauth" ? encryptionOk : true);
    const status = displayStatus(spec, byProvider.get(provider) ?? null, configured);
    return {
      provider,
      name: spec.name,
      connected: status === "connected" || status === "sync_issue" || status === "needs_attention",
      available: status !== "unavailable" && (provider !== "SMS" || smsEntitled(ctx.business)),
      wanted: Boolean(personalization?.connectProviders.includes(provider as never)),
      note: provider === "SMS" && !smsEntitled(ctx.business) ? "Part of Pro — connect it later from Settings." : status === "unavailable" ? "Not available on this deployment yet." : null,
    };
  });
  const connected = channels.filter((c) => c.connected).length;

  const personal: PersonalWelcome | null = personalization
    ? {
        priorities: personalization.priorities,
        recommendedPlan: personalization.recommendedPlan,
        selectedPlan: personalization.selectedPlan,
        reasons: personalization.reasons,
        buildSteps: buildSteps(personalization),
        channelCount: personalization.channelCount,
        wantsCalendar: personalization.connectProviders.includes("GOOGLE_CALENDAR"),
        billingLive: subscriptionBillingIsLive,
        trialOffered: subscriptionBillingIsLive && trialEligible(ctx.business),
        canBill: ctx.role === "OWNER" || ctx.role === "ADMIN",
      }
    : null;

  return (
    <Welcome
      firstName={ctx.user.name.split(" ")[0] || "there"}
      workspaceKey={ctx.business.handle}
      step={sp.step === "connect" || sp.connected || sp.connect_error ? "connect" : "welcome"}
      channels={channels}
      connectedCount={connected}
      justConnected={sp.connected ?? null}
      connectError={sp.connect_error ?? null}
      personal={personal}
      connectGmail={connectGmailAction}
      connectInstagram={connectInstagramAction}
      connectWhatsApp={connectWhatsAppAction}
    />
  );
}

async function connectGmailAction() {
  "use server";
  await connectGoogle("gmail");
}
async function connectInstagramAction() {
  "use server";
  await connectInstagram();
}
async function connectWhatsAppAction() {
  "use server";
  await connectWhatsApp();
}
