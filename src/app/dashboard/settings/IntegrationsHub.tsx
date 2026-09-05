import { prisma } from "@/lib/db";
import { formatDistanceToNowStrict } from "date-fns";
import { PROVIDERS, providerConfigured, displayStatus, type ProviderSpec } from "@/lib/integrations/registry";
import { smsEntitled } from "@/lib/billing";
import { stripeIsLive } from "@/lib/payments";
import { tokenCryptoConfigured } from "@/lib/tokenCrypto";
import { readCalendarSettings } from "@/server/calendarSync";
import { ChannelIcon, type ChannelKey } from "@/app/landing/ChannelIcon";
import { IntegrationCard, type CardModel } from "./IntegrationCard";
import { SmsNumberPicker } from "./SmsNumberPicker";
import { SimulateInbound } from "../integrations/SimulateInbound";
import { connectGoogle } from "@/app/actions/googleAuth";
import { connectInstagram, connectWhatsApp } from "@/app/actions/connect";
import { CalendarDays, Apple, CreditCard } from "lucide-react";
import type { Business, IntegrationProvider } from "@prisma/client";
import Link from "next/link";

/**
 * Settings → Integrations: the hub. Three groups, one visual language, every status read
 * from the row and the deployment. The Connect button is always the obvious thing.
 *
 *   Communication  Gmail · Instagram · WhatsApp · SMS     (where conversations come from)
 *   Calendar       Google · Apple                         (availability + booking mirrors)
 *   Payments       Stripe                                 (an outcome, never a channel)
 */
const ICON: Partial<Record<IntegrationProvider, ChannelKey>> = { EMAIL: "gmail", SMS: "sms", INSTAGRAM: "instagram", WHATSAPP: "whatsapp", WEBSITE: "website" };
const ACCENT: Partial<Record<IntegrationProvider, string>> = { EMAIL: "linear-gradient(90deg,#4285F4,#34A853,#FBBC04,#EA4335)", INSTAGRAM: "linear-gradient(90deg,#F58529,#DD2A7B,#8134AF)", WHATSAPP: "#25D366", SMS: "#34C759", WEBSITE: "#101114", GOOGLE_CALENDAR: "linear-gradient(90deg,#4285F4,#34A853)", APPLE_CALENDAR: "#101114", STRIPE: "#635BFF" };
const DESCRIPTION: Partial<Record<IntegrationProvider, string>> = {
  EMAIL: "Read your inbox and reply from your own address. Daythread sorts what needs you from what doesn't.",
  INSTAGRAM: "DMs to your professional account land in the same thread as everything else.",
  WHATSAPP: "WhatsApp Business messages with real delivered and read receipts.",
  SMS: "A dedicated business number. Texts arrive here; replies go out from it.",
  GOOGLE_CALENDAR: "Sync your schedule and automatically account for busy time when managing bookings.",
  APPLE_CALENDAR: "Connect your iCloud calendars and keep your Daythread schedule aligned.",
};
const CAPS: Partial<Record<IntegrationProvider, string[]>> = {
  EMAIL: ["Inbox sync", "Send replies", "Threads"],
  INSTAGRAM: ["Inbox sync", "Send replies", "Webhooks"],
  WHATSAPP: ["Inbox sync", "Send replies", "Delivery receipts"],
  SMS: ["Inbox sync", "Send replies", "Delivery receipts"],
  GOOGLE_CALENDAR: ["Calendar sync", "Availability", "Booking coordination"],
  APPLE_CALENDAR: ["Calendar sync", "Availability", "Booking coordination"],
  WEBSITE: ["Inquiries", "Bookings"],
};
const ERRORS: Record<string, string> = {
  denied: "could not be connected. The authorization was canceled before it finished — try connecting again.",
  expired: "could not be connected. The sign-in took too long — start again.",
  state: "could not be connected. The sign-in couldn't be verified — start again from this page.",
  session: "could not be connected. Finish connecting from the browser you started in, signed in to this workspace.",
  tenant: "could not be connected. Only an owner or admin of this workspace can connect it.",
  encryption: "could not be connected. Daythread configuration is incomplete — the operator has been notified.",
  no_refresh_token: "could not be connected. Google didn't grant long-term access — try again and approve everything it asks.",
  scopes: "could not be connected. The permissions Daythread needs weren't granted — try again and approve everything it asks.",
  account_type: "only allows messaging for professional accounts (Business or Creator). Switch your account type in Instagram, then try again.",
  in_use: "is already connected to another Daythread workspace.",
  no_waba: "returned no WhatsApp Business Account for that login.",
  no_phone: "has no phone number on that WhatsApp Business Account yet — add one in Meta Business Manager, then connect again.",
  provider: "could not be connected. The provider returned an error and nothing was saved — try again in a minute.",
};

export async function IntegrationsHub({ business, role, connected, connectError, errorProvider }: { business: Business; role: string; connected?: string; connectError?: string; errorProvider?: string }) {
  const rows = await prisma.integration.findMany({ where: { businessId: business.id } });
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  const encryptionOk = process.env.NODE_ENV !== "production" || tokenCryptoConfigured();
  const owner = role === "OWNER";

  const model = (provider: IntegrationProvider): CardModel => {
    const spec: ProviderSpec = PROVIDERS[provider as keyof typeof PROVIDERS];
    const row = byProvider.get(provider) ?? null;
    const configured = providerConfigured(spec);
    const status = displayStatus(spec, row, configured);
    const canStore = spec.auth === "oauth" || spec.auth === "app_password" ? encryptionOk : true;
    const planOk = provider === "SMS" ? smsEntitled(business) : true;
    const cal = row && (provider === "GOOGLE_CALENDAR" || provider === "APPLE_CALENDAR") ? readCalendarSettings(row) : null;
    return {
      provider,
      name: spec.name,
      description: DESCRIPTION[provider] ?? spec.summary,
      status,
      account: provider === "SMS" ? business.twilioPhoneNumber : (row?.externalAccount ?? null),
      lastSyncedAt: row?.lastSyncedAt ? `${formatDistanceToNowStrict(row.lastSyncedAt)} ago` : null,
      lastError: row?.lastError ?? null,
      detail: !planOk ? "Part of the Pro plan and above." : status === "unavailable" ? `Not available on Daythread yet — coming as soon as ${spec.name} approves the app.` : null,
      adminNote: owner && !canStore && (status === "disconnected" || status === "unavailable") ? "Daythread configuration required: the deployment's credential encryption key isn't set, so new connections are paused. See Billing → Setup." : owner && !configured && spec.env.length > 0 && status === "unavailable" ? `Daythread configuration required: ${spec.name} credentials aren't set on this deployment.` : null,
      approval: spec.approval ?? null,
      capabilities: CAPS[provider] ?? [],
      entitled: planOk && canStore,
      calendarsConnected: cal?.selected.length,
      accent: ACCENT[provider] ?? "#101114",
    };
  };

  const banner = connected
    ? { tone: "success" as const, text: `${PROVIDERS[connected as keyof typeof PROVIDERS]?.name ?? connected} is connected.` }
    : connectError
      ? { tone: "warning" as const, text: `${errorProvider && PROVIDERS[errorProvider as keyof typeof PROVIDERS] ? PROVIDERS[errorProvider as keyof typeof PROVIDERS].name : "The integration"} ${ERRORS[connectError] ?? ERRORS.provider}` }
      : null;
  const wanted = rows.filter((r) => r.wanted && r.status === "NOT_CONNECTED").map((r) => PROVIDERS[r.provider as keyof typeof PROVIDERS]?.name).filter(Boolean);
  const connectedCount = rows.filter((r) => r.status === "CONNECTED" || r.status === "SYNC_ERROR").length;
  const icon = (provider: IntegrationProvider) =>
    provider === "GOOGLE_CALENDAR" ? <CalendarDays className="w-5 h-5 text-[#4285F4]" strokeWidth={2} aria-hidden /> : provider === "APPLE_CALENDAR" ? <Apple className="w-5 h-5 text-ink" strokeWidth={2} aria-hidden /> : ICON[provider] ? <ChannelIcon k={ICON[provider]!} size={24} /> : null;

  return (
    <div className="space-y-9">
      <header className="relative overflow-hidden rounded-[26px] border border-border bg-[radial-gradient(120%_140%_at_0%_0%,rgba(109,90,230,0.10),transparent_55%),radial-gradient(100%_120%_at_100%_100%,rgba(240,82,77,0.08),transparent_55%)] px-6 py-6 md:px-8 md:py-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-text">Integrations</p>
        <h2 className="mt-2 font-sans font-extrabold text-[1.6rem] md:text-[1.9rem] leading-[1.05] tracking-[-0.03em] text-ink">Connect the tools your business already uses.</h2>
        <p className="mt-2 max-w-xl text-sm text-ink/65 leading-relaxed">Daythread brings your conversations, calendar, clients and workflows together. Every connection uses the provider&rsquo;s own sign-in — there is never a key to paste.</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-ink/55">
          <span><span className="font-semibold text-ink">{connectedCount}</span> connected</span>
          {wanted.length > 0 && <span className="text-signal-text font-semibold">You said you use {wanted.join(", ")} — connect {wanted.length === 1 ? "it" : "them"} below.</span>}
        </div>
      </header>

      {banner && (
        <div role={banner.tone === "warning" ? "alert" : "status"} className={cn2(banner.tone === "success" ? "rounded-2xl border border-success/30 bg-success-soft/50 px-4 py-3 text-sm text-success-text" : "rounded-2xl border border-warning/40 bg-warning-soft/60 px-4 py-3 text-sm text-ink/80")}>{banner.text}</div>
      )}

      <Group title="Communication" hint="Where conversations come from">
        {(["EMAIL", "INSTAGRAM", "WHATSAPP", "SMS"] as IntegrationProvider[]).map((provider) => {
          const m = model(provider);
          const connect = provider === "EMAIL" ? connectGoogleGmail : provider === "INSTAGRAM" ? connectInstagramAction : provider === "WHATSAPP" ? connectWhatsAppAction : undefined;
          return (
            <IntegrationCard key={provider} model={m} icon={icon(provider)} connect={connect}>
              {provider === "SMS" && m.entitled && m.status !== "unavailable" ? <SmsNumberPicker current={business.twilioPhoneNumber} /> : null}
              {provider === "EMAIL" && m.status === "connected" ? <p className="text-xs text-ink/55">New mail is pulled while Daythread is open and classified before it reaches you. Replies send from this account.</p> : null}
              {provider === "WHATSAPP" && m.status === "connected" ? <p className="text-xs text-ink/55">Free-form replies are allowed within 24 hours of a customer&rsquo;s message; later ones need an approved template, and Daythread says so instead of sending.</p> : null}
            </IntegrationCard>
          );
        })}
        <IntegrationCard model={model("WEBSITE")} icon={icon("WEBSITE")}>
          <p className="text-xs text-ink/55">Requests from <Link href={`/book/${business.handle}`} className="font-semibold text-ink hover:underline">/book/{business.handle}</Link> arrive as conversations and bookings.</p>
        </IntegrationCard>
      </Group>

      <Group title="Calendar" hint="Bookings go out; busy time comes in">
        {(["GOOGLE_CALENDAR", "APPLE_CALENDAR"] as IntegrationProvider[]).map((provider) => (
          <IntegrationCard key={provider} model={model(provider)} icon={icon(provider)} connect={provider === "GOOGLE_CALENDAR" ? connectGoogleCalendar : undefined} />
        ))}
        <p className="text-[11px] text-ink/45 px-1">Daythread bookings are the source of truth and are mirrored to the calendar you choose. Events on selected calendars only block availability; they never create or change a booking.</p>
      </Group>

      <Group title="Payments" hint="An outcome on bookings, never a channel">
        <article className="rounded-[22px] border border-border bg-white px-5 py-5 flex gap-4">
          <span className="shrink-0 w-10 h-10 rounded-xl border border-border bg-paper flex items-center justify-center"><CreditCard className="w-5 h-5 text-[#635BFF]" strokeWidth={2} aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap"><h3 className="text-[15px] font-semibold text-ink">Stripe</h3><span className={cn2("text-[11px] font-bold rounded-full px-2 py-0.5", stripeIsLive ? "bg-success-soft text-success-text" : "bg-black/[0.05] text-ink/55")}>{stripeIsLive ? "✓ Connected" : "Not connected"}</span></div>
            <p className="mt-1 text-sm text-ink/60 leading-snug">{stripeIsLive ? "Card and Apple Pay checkout for deposits and balances, confirmed by Stripe itself." : "Card checkout is simulated until Stripe is connected by Daythread's operator — nothing is ever shown as paid unless it was."}</p>
            <ul className="mt-2.5 flex flex-wrap gap-1.5">{["Deposits", "Balances", "Subscriptions"].map((c) => <li key={c} className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/50 bg-black/[0.04] rounded-md px-1.5 py-0.5">{c}</li>)}</ul>
            <p className="mt-2 text-[11px] text-ink/45">Zelle and bank transfer: {business.paymentMethods.filter((m) => m !== "card").length > 0 ? "on, confirmed by you from Payments." : "off — turn on under Payments."}{owner && !stripeIsLive ? " Daythread configuration: Stripe keys are set by the operator under Billing → Setup." : ""}</p>
          </div>
        </article>
      </Group>

      <details className="group">
        <summary className="cursor-pointer select-none text-[11px] font-bold uppercase tracking-[0.14em] text-ink/40 hover:text-ink/60">Demo tool</summary>
        <div className="mt-3"><SimulateInbound /></div>
        <p className="mt-2 text-[11px] text-ink/45">Injects a clearly labeled test message through the real ingestion pipeline. Never a real customer message.</p>
      </details>
    </div>
  );
}

function Group({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="flex items-baseline gap-3 mb-3 px-1">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink/50">{title}</h3>
        <span className="text-[11px] text-ink/40">{hint}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
function cn2(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
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
