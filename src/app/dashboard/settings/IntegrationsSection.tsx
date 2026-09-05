import { prisma } from "@/lib/db";
import { formatDistanceToNowStrict } from "date-fns";
import { PROVIDERS, providerConfigured, displayStatus, CHANNEL_PROVIDERS, CALENDAR_PROVIDERS } from "@/lib/integrations/registry";
import { smsEntitled } from "@/lib/billing";
import { stripeIsLive } from "@/lib/payments";
import { aiEnabled } from "@/lib/ai";
import { tokenCryptoConfigured } from "@/lib/tokenCrypto";
import { ChannelIcon, type ChannelKey } from "@/app/landing/ChannelIcon";
import { IntegrationCard, type CardModel } from "./IntegrationCard";
import { CalendarPicker } from "./CalendarPicker";
import { AppleCalendarForm } from "./AppleCalendarForm";
import { SmsNumberPicker } from "./SmsNumberPicker";
import { SimulateInbound } from "../integrations/SimulateInbound";
import { connectGoogle } from "@/app/actions/googleAuth";
import { connectInstagram, connectWhatsApp } from "@/app/actions/connect";
import { CalendarDays, Apple, CreditCard } from "lucide-react";
import type { Business, IntegrationProvider } from "@prisma/client";
import Link from "next/link";

/**
 * Settings → Integrations. Three groups, one visual language:
 *   Where clients reach you — Gmail · Instagram · WhatsApp · Messages · booking page
 *   Calendar                — Google · Apple
 *   Collecting payment      — Stripe (an outcome, not a channel; nothing here feeds the inbox)
 * Every status is derived from a real row and real configuration. No toggle anywhere.
 */
const ICON: Partial<Record<IntegrationProvider, ChannelKey>> = { EMAIL: "gmail", SMS: "sms", INSTAGRAM: "instagram", WHATSAPP: "whatsapp", WEBSITE: "website" };
const ERRORS: Record<string, string> = {
  denied: "You didn't approve access, so nothing was connected.",
  expired: "That sign-in took too long. Start again.",
  state: "The sign-in couldn't be verified. Start again from this page.",
  session: "Finish connecting from the browser you started in, signed in to this workspace.",
  tenant: "Only an owner or admin of this workspace can connect it.",
  encryption: "Connections are paused until the deployment's encryption key is configured.",
  no_refresh_token: "Google didn't grant long-term access. Try again and approve everything it asks.",
  scopes: "The permissions Daythread needs weren't granted. Try again and approve everything it asks.",
  account_type: "Instagram only allows messaging for professional accounts (Business or Creator). Switch your account type in Instagram, then try again.",
  in_use: "That account is already connected to another Daythread workspace.",
  no_waba: "Meta didn't return a WhatsApp Business Account for that login.",
  no_phone: "That WhatsApp Business Account has no phone number yet — add one in Meta Business Manager, then connect again.",
  provider: "The provider returned an error. Nothing was connected — try again in a minute.",
};

export async function IntegrationsSection({ business, connected, connectError, errorProvider }: { business: Business; connected?: string; connectError?: string; errorProvider?: string }) {
  const rows = await prisma.integration.findMany({ where: { businessId: business.id } });
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  const encryptionOk = process.env.NODE_ENV !== "production" || tokenCryptoConfigured();

  const model = (provider: IntegrationProvider): CardModel => {
    const spec = PROVIDERS[provider as keyof typeof PROVIDERS];
    const row = byProvider.get(provider) ?? null;
    // Whether the provider works on this deployment (drives the status) is separate from
    // whether a NEW credential can be stored right now (drives the Connect button): an
    // existing Gmail connection keeps reading while the operator adds the encryption key.
    const configured = providerConfigured(spec);
    const status = displayStatus(spec, row, configured);
    const canStore = spec.auth === "oauth" || spec.auth === "app_password" ? encryptionOk : true;
    const entitled = (provider === "SMS" ? smsEntitled(business) : true) && canStore;
    const settings = (row?.settings as Record<string, string> | null) ?? null;
    return {
      provider,
      name: spec.name,
      summary: spec.summary,
      status,
      account: provider === "SMS" ? business.twilioPhoneNumber : (row?.externalAccount ?? null),
      lastSyncedAt: row?.lastSyncedAt ? `${formatDistanceToNowStrict(row.lastSyncedAt)} ago` : null,
      lastError: row?.lastError ?? null,
      detail: !canStore ? "New connections are paused until Daythread's operator sets the deployment's encryption key." : !entitled ? "Part of the Pro plan and above." : !configured ? `Daythread's operator hasn't enabled ${spec.name} on this deployment yet.` : settings?.calendarName ? `Calendar: ${settings.calendarName}` : null,
      approval: spec.approval ?? null,
      capabilities: spec.capabilities,
      entitled,
      canRetry: spec.kind === "calendar",
    };
  };

  const banner = connected ? { tone: "success" as const, text: `${PROVIDERS[connected as keyof typeof PROVIDERS]?.name ?? connected} is connected.` } : connectError ? { tone: "warning" as const, text: `${errorProvider && PROVIDERS[errorProvider as keyof typeof PROVIDERS] ? PROVIDERS[errorProvider as keyof typeof PROVIDERS].name + ": " : ""}${ERRORS[connectError] ?? ERRORS.provider}` } : null;
  const channelList = CHANNEL_PROVIDERS.filter((p) => p !== "WEBSITE");
  const wanted = rows.filter((r) => r.wanted && r.status === "NOT_CONNECTED").map((r) => PROVIDERS[r.provider as keyof typeof PROVIDERS]?.name).filter(Boolean);

  return (
    <div className="space-y-8">
      {banner && (
        <div role={banner.tone === "warning" ? "alert" : "status"} className={banner.tone === "success" ? "rounded-2xl border border-success/30 bg-success-soft/50 px-4 py-3 text-sm text-success-text" : "rounded-2xl border border-warning/40 bg-warning-soft/60 px-4 py-3 text-sm text-ink/80"}>
          {banner.text}
        </div>
      )}
      {wanted.length > 0 && !banner && (
        <p className="text-sm text-ink/60">You said you use {wanted.join(", ")}. Connect {wanted.length === 1 ? "it" : "them"} below and messages start arriving in your inbox.</p>
      )}

      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink/45 mb-2">Where clients reach you</h3>
        <div className="space-y-3">
          {channelList.map((provider) => {
            const m = model(provider);
            const icon = ICON[provider] ? <ChannelIcon k={ICON[provider]!} size={28} /> : null;
            const connect = provider === "EMAIL" ? connectGoogleGmail : provider === "INSTAGRAM" ? connectInstagramAction : provider === "WHATSAPP" ? connectWhatsAppAction : undefined;
            return (
              <IntegrationCard key={provider} model={m} icon={icon} connect={connect}>
                {provider === "SMS" && m.entitled && m.status !== "unavailable" && <SmsNumberPicker current={business.twilioPhoneNumber} />}
                {provider === "EMAIL" && m.status === "connected" && <p className="text-xs text-ink/55">New mail is pulled every 20 seconds while Daythread is open, and classified before it reaches you. Replies send from this account.</p>}
                {provider === "WHATSAPP" && m.status === "connected" && <p className="text-xs text-ink/55">Free-form replies are allowed within 24 hours of a customer&rsquo;s message; later replies need an approved template, and Daythread will say so instead of sending.</p>}
              </IntegrationCard>
            );
          })}
          <IntegrationCard model={model("WEBSITE")} icon={<ChannelIcon k="website" size={28} />}>
            <p className="text-xs text-ink/55">Requests from <Link href={`/book/${business.handle}`} className="font-semibold text-ink hover:underline">/book/{business.handle}</Link> arrive as conversations and bookings.</p>
          </IntegrationCard>
        </div>
      </div>

      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink/45 mb-2">Calendar</h3>
        <div className="space-y-3">
          {CALENDAR_PROVIDERS.map((provider) => {
            const m = model(provider);
            const settings = (byProvider.get(provider)?.settings as { calendarName?: string } | null) ?? null;
            const icon = provider === "GOOGLE_CALENDAR" ? <span className="w-7 h-7 rounded-lg bg-white border border-border flex items-center justify-center"><CalendarDays className="w-4 h-4 text-[#4285F4]" strokeWidth={2} aria-hidden /></span> : <span className="w-7 h-7 rounded-lg bg-ink text-white flex items-center justify-center"><Apple className="w-4 h-4" strokeWidth={2} aria-hidden /></span>;
            const connectedNow = m.status === "connected" || m.status === "sync_issue";
            return (
              <IntegrationCard key={provider} model={m} icon={icon} connect={provider === "GOOGLE_CALENDAR" ? connectGoogleCalendar : undefined}>
                {provider === "APPLE_CALENDAR" && (m.status === "disconnected" || m.status === "needs_attention") && (m.entitled ? <AppleCalendarForm /> : <p className="text-xs text-ink/55">{m.detail}</p>)}
                {connectedNow && <CalendarPicker provider={provider as "GOOGLE_CALENDAR" | "APPLE_CALENDAR"} selectedName={settings?.calendarName ?? null} />}
              </IntegrationCard>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-ink/45">Bookings are pushed to the selected calendar and updated when they change. Busy time on that calendar can&rsquo;t be booked over. Events on the calendar never create or change bookings.</p>
      </div>

      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink/45 mb-2">Collecting payment</h3>
        <div className="rounded-[22px] border border-border bg-white px-5 py-4 flex items-start gap-4">
          <span className="w-7 h-7 rounded-lg bg-[#635BFF] text-white flex items-center justify-center shrink-0"><CreditCard className="w-4 h-4" strokeWidth={2} aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><h3 className="text-sm font-semibold text-ink">Stripe</h3><span className={stripeIsLive ? "text-[11px] font-semibold text-success-text" : "text-[11px] font-semibold text-ink/50"}>{stripeIsLive ? "● Connected" : "● Not connected"}</span></div>
            <p className="mt-0.5 text-xs text-ink/55">{stripeIsLive ? "Card and Apple Pay checkout for deposits and balances, confirmed by Stripe itself. Payments are outcomes on bookings, never inbox messages." : "Card checkout is simulated until Stripe is connected by Daythread's operator — nothing is ever shown as paid unless it was."}</p>
            <p className="mt-1 text-[11px] text-ink/45">Zelle and bank transfer: {business.paymentMethods.filter((m) => m !== "card").length > 0 ? "on, confirmed by you from Payments." : "off — turn on under Payments."}</p>
          </div>
        </div>
      </div>

      {!aiEnabled && <p className="text-[11px] text-ink/45">AI drafts and summaries run on a rule-based fallback on this deployment (no model key configured). Nothing is presented as AI that isn&rsquo;t.</p>}

      <details className="group">
        <summary className="cursor-pointer select-none text-[11px] font-bold uppercase tracking-[0.14em] text-ink/40 hover:text-ink/60">Demo tool</summary>
        <div className="mt-3"><SimulateInbound /></div>
        <p className="mt-2 text-[11px] text-ink/45">Injects a clearly labeled test message through the real ingestion pipeline. Never a real customer message.</p>
      </details>
    </div>
  );
}

async function connectGoogleGmail() {
  "use server";
  await connectGoogle("gmail");
}
async function connectGoogleCalendar() {
  "use server";
  await connectGoogle("calendar");
}
async function connectInstagramAction() {
  "use server";
  await connectInstagram();
}
async function connectWhatsAppAction() {
  "use server";
  await connectWhatsApp();
}
