import { redirect } from "next/navigation";
import { requireBusiness } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { prisma } from "@/lib/db";
import { PROVIDERS, providerConfigured, displayStatus } from "@/lib/integrations/registry";
import { tokenCryptoConfigured } from "@/lib/tokenCrypto";
import { Welcome, type ChannelOption } from "./Welcome";
import { connectGoogle } from "@/app/actions/googleAuth";
import { connectInstagram, connectWhatsApp } from "@/app/actions/connect";
import { smsEntitled } from "@/lib/billing";
import type { IntegrationProvider } from "@prisma/client";

/**
 * Two screens after signup: welcome, then connect a first channel. Both skippable. The
 * connect buttons are the same real provider sign-ins as Settings → Channels; a provider
 * that isn't configured on this deployment shows as such instead of a dead button.
 */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string; connected?: string; connect_error?: string }> }) {
  const ctx = await requireBusiness();
  if (!ctx) redirect("/login");
  if (ctx.role === "CLIENT") redirect("/workspaces");
  if (ctx.business.onboardingComplete) redirect("/dashboard/inbox");
  const sp = await searchParams;

  const started = await prisma.analyticsEvent.count({ where: { businessId: ctx.business.id, name: "onboarding_started" } });
  if (started === 0) await track("onboarding_started", { businessId: ctx.business.id });

  const rows = await prisma.integration.findMany({ where: { businessId: ctx.business.id } });
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  const encryptionOk = process.env.NODE_ENV !== "production" || tokenCryptoConfigured();
  const channels: ChannelOption[] = (["EMAIL", "INSTAGRAM", "WHATSAPP", "SMS"] as IntegrationProvider[]).map((provider) => {
    const spec = PROVIDERS[provider as keyof typeof PROVIDERS];
    const configured = providerConfigured(spec) && (spec.auth === "oauth" ? encryptionOk : true);
    const status = displayStatus(spec, byProvider.get(provider) ?? null, configured);
    return {
      provider,
      name: spec.name,
      connected: status === "connected" || status === "sync_issue" || status === "needs_attention",
      available: status !== "unavailable" && (provider !== "SMS" || smsEntitled(ctx.business)),
      note: provider === "SMS" && !smsEntitled(ctx.business) ? "Part of Pro — connect it later from Settings." : status === "unavailable" ? "Not available on this deployment yet." : null,
    };
  });
  const connected = channels.filter((c) => c.connected).length;

  return (
    <Welcome
      firstName={ctx.user.name.split(" ")[0] || "there"}
      step={sp.step === "connect" || sp.connected || sp.connect_error ? "connect" : "welcome"}
      channels={channels}
      connectedCount={connected}
      justConnected={sp.connected ?? null}
      connectError={sp.connect_error ?? null}
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
