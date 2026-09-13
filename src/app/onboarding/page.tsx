import { redirect } from "next/navigation";
import { requireBusiness } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { prisma } from "@/lib/db";
import { PROVIDERS, providerConfigured, displayStatus } from "@/lib/integrations/registry";
import { tokenCryptoConfigured } from "@/lib/tokenCrypto";
import { Welcome, type ChannelOption, type PersonalWelcome, type StarterRecipe } from "./Welcome";
import { connectGoogle } from "@/app/actions/googleAuth";
import { connectInstagram, connectMicrosoft, connectWhatsApp } from "@/app/actions/connect";
import { AUTOMATION_RECIPES, STARTER_RECIPES } from "@/lib/automationRecipes";
import { smsEntitled, trialEligible, betaProActive, planPurchasable } from "@/lib/billing";
import { subscriptionBillingIsLive } from "@/lib/subscriptionBilling";
import { getPersonalization } from "@/server/personalization";
import type { IntegrationProvider } from "@prisma/client";

/**
 * After the account exists: switch on the follow-through, then connect the channels clients
 * use (theirs first, from /start). Both steps end on Today, where the setup checklist
 * continues from the database. Without a /start profile (mobile signup, an invite) the same
 * two steps run with no channel marked as theirs.
 */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string; connected?: string; connect_error?: string }> }) {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (ctx.role === "CLIENT") redirect("/workspaces");
  if (ctx.business.onboardingComplete) redirect("/dashboard");
  const sp = await searchParams;

  const [started, rows, personalization, automations] = await Promise.all([
    prisma.analyticsEvent.count({ where: { businessId: ctx.business.id, name: "onboarding_started" } }),
    prisma.integration.findMany({ where: { businessId: ctx.business.id } }),
    getPersonalization(ctx.business.id),
    prisma.automation.findMany({ where: { businessId: ctx.business.id }, select: { trigger: true, action: true, offsetHours: true } }),
  ]);
  if (started === 0) await track("onboarding_started", { businessId: ctx.business.id, properties: { personalized: Boolean(personalization) } });

  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  const encryptionOk = process.env.NODE_ENV !== "production" || tokenCryptoConfigured();
  const order: IntegrationProvider[] = ["EMAIL", "MICROSOFT_OUTLOOK", "INSTAGRAM", "WHATSAPP", "SMS"];
  // This step is about where customers reach them. A calendar and a file store are named in
  // onboarding too, but they belong to the Files and Calendar cards on Today, not here.
  const notAChannel = ["GOOGLE_CALENDAR", "GOOGLE_DRIVE", "DROPBOX"] as const;
  type NotAChannel = (typeof notAChannel)[number];
  const wantedFirst = personalization
    ? [
        ...personalization.connectProviders.filter((p): p is Exclude<typeof p, NotAChannel> => !(notAChannel as readonly string[]).includes(p)),
        ...order.filter((p) => !personalization.connectProviders.includes(p as never)),
      ]
    : order;
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

  const WHEN: Record<string, string> = { confirm: "As soon as you book someone", remind: "The day before their booking", thanks: "A day after a booking is marked done" };
  const recipes: StarterRecipe[] = STARTER_RECIPES.map((key) => {
    const r = AUTOMATION_RECIPES.find((x) => x.key === key)!;
    const on = automations.some((a) => a.trigger === r.input.trigger && a.action === r.input.action && a.offsetHours === r.input.offsetHours);
    return { key, label: r.label, when: WHEN[key], template: r.input.messageTemplate, on };
  });

  const personal: PersonalWelcome | null = personalization
    ? {
        recommendedPlan: personalization.recommendedPlan,
        selectedPlan: personalization.selectedPlan,
        reasons: personalization.reasons,
        wantsCalendar: personalization.connectProviders.includes("GOOGLE_CALENDAR"),
        billingLive: subscriptionBillingIsLive,
        trialOffered: subscriptionBillingIsLive && trialEligible(ctx.business),
        canBill: ctx.role === "OWNER" || ctx.role === "ADMIN",
        betaProEndsAt: betaProActive(ctx.business) && ctx.business.planTier === "FREE" ? ctx.business.betaProEndsAt!.toISOString() : null,
        businessUnavailable: !planPurchasable("BUSINESS"),
      }
    : null;

  return (
    <Welcome
      firstName={ctx.user.name.split(" ")[0] || "there"}
      businessName={ctx.business.name}
      step={sp.step === "connect" || sp.connected || sp.connect_error ? "connect" : "automate"}
      channels={channels}
      connectedCount={connected}
      justConnected={sp.connected ?? null}
      connectError={sp.connect_error ?? null}
      recipes={recipes}
      personal={personal}
      connect={{ EMAIL: connectGmailAction, MICROSOFT_OUTLOOK: connectOutlookAction, INSTAGRAM: connectInstagramAction, WHATSAPP: connectWhatsAppAction }}
    />
  );
}

/**
 * A connect leaves for the provider's sign-in and comes back to this step (the signed OAuth
 * state carries `returnTo: "onboarding"`), so onboarding is only ever marked done by the
 * person finishing it — never by leaving, and never by a connect that failed.
 */
async function connectGmailAction() {
  "use server";
  await connectGoogle("gmail", undefined, { returnTo: "onboarding" });
}
async function connectOutlookAction() {
  "use server";
  await connectMicrosoft("mail", undefined, { returnTo: "onboarding" });
}
async function connectInstagramAction() {
  "use server";
  await connectInstagram(undefined, { returnTo: "onboarding" });
}
async function connectWhatsAppAction() {
  "use server";
  await connectWhatsApp(undefined, { returnTo: "onboarding" });
}
