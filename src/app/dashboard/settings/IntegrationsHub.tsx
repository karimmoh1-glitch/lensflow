import { prisma } from "@/lib/db";
import { formatDistanceToNowStrict } from "date-fns";
import { PROVIDERS, providerConfigured, displayStatus, type ProviderSpec } from "@/lib/integrations/registry";
import { smsEntitled, PLANS, limitLabel } from "@/lib/billing";
import { usageFor, countsTowardQuota, limitMessage } from "@/server/integrationQuota";
import { tokenCryptoConfigured } from "@/lib/tokenCrypto";
import { readCalendarSettings } from "@/server/calendarSync";
import { ChannelIcon, type ChannelKey } from "@/app/landing/ChannelIcon";
import { IntegrationCard, type CardModel } from "./IntegrationCard";
import { SmsNumberPicker } from "./SmsNumberPicker";
import { MetaConfigPanel } from "./MetaConfigPanel";
import { WhatsAppManage, type WhatsAppManageModel } from "./WhatsAppManage";
import { InstagramManage, type InstagramManageModel } from "./InstagramManage";
import { templatesEnabled } from "@/lib/meta/whatsapp";
import { connectionState } from "@/lib/meta/config";
import { connectGoogle } from "@/app/actions/googleAuth";
import { connectInstagram, connectWhatsApp } from "@/app/actions/connect";
import { CalendarDays, Apple } from "lucide-react";
import type { Business, IntegrationProvider } from "@prisma/client";
import Link from "next/link";

/**
 * Settings → Channels: the hub. Two groups, one visual language, every status read
 * from the row and the deployment. The Connect button is always the obvious thing.
 *
 *   Communication  Gmail · Instagram · WhatsApp · SMS     (where conversations come from)
 *   Calendar       Google · Apple                         (availability + booking mirrors)
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
  configuration: "could not be connected. This deployment doesn't have the provider credentials set.",
  no_refresh_token: "could not be connected. Google didn't grant long-term access — try again and approve everything it asks.",
  scopes: "could not be connected. The permissions Daythread needs weren't granted — try again and approve everything it asks.",
  account_type: "only allows messaging for professional accounts (Business or Creator). Switch your account type in Instagram, then try again.",
  in_use: "is already connected to another Daythread workspace.",
  no_waba: "returned no WhatsApp Business Account for that login.",
  no_phone: "has no phone number on that WhatsApp Business Account yet — add one in Meta Business Manager, then connect again.",
  provider: "could not be connected. The provider returned an error and nothing was saved — try again in a minute.",
  limit: "could not be connected: your plan's connection limit is reached. Disconnect one, or upgrade to connect more.",
};

export async function IntegrationsHub({ business, role, connected, connectError, errorProvider }: { business: Business; role: string; connected?: string; connectError?: string; errorProvider?: string }) {
  const rows = await prisma.integration.findMany({ where: { businessId: business.id } });
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  const encryptionOk = process.env.NODE_ENV !== "production" || tokenCryptoConfigured();
  const owner = role === "OWNER";
  // The same arithmetic the server uses to refuse a connection — shown, never decided, here.
  const usage = usageFor(business, rows);
  const planName = PLANS[usage.plan].name;
  const nextPlanName = usage.nextPlan ? PLANS[usage.nextPlan].name : null;
  const limitCopy = usage.atLimit ? limitMessage(usage) : null;

  const model = (provider: IntegrationProvider): CardModel => {
    const spec: ProviderSpec = PROVIDERS[provider as keyof typeof PROVIDERS];
    const row = byProvider.get(provider) ?? null;
    const configured = providerConfigured(spec);
    const status = displayStatus(spec, row, configured);
    const canStore = spec.auth === "oauth" || spec.auth === "app_password" ? encryptionOk : true;
    const planOk = provider === "SMS" ? smsEntitled(business) : true;
    const cal = row && (provider === "GOOGLE_CALENDAR" || provider === "APPLE_CALENDAR") ? readCalendarSettings(row) : null;
    // A provider that is not currently holding a slot needs a free one to (re)connect.
    const holdsSlot = Boolean(row && countsTowardQuota(row));
    const needsSlot = (status === "disconnected" || status === "needs_attention") && !holdsSlot;
    const limitReached = needsSlot && usage.atLimit;
    const pill: CardModel["pill"] =
      status === "connected" ? { label: "Connected", tone: "success" }
      : status === "always_on" ? { label: "Always on", tone: "success" }
      : status === "sync_issue" ? { label: "Sync issue", tone: "warning" }
      : status === "needs_attention" ? { label: "Needs attention", tone: "accent" }
      : status === "unavailable" ? { label: owner ? "Configuration required" : "Not available yet", tone: "neutral" }
      : !canStore ? { label: "Configuration required", tone: "neutral" }
      : !planOk || limitReached ? { label: "Upgrade required", tone: "signal" }
      : { label: "Available", tone: "neutral" };
    return {
      provider,
      // The five product-level states, derived from the row and the deployment. Rendered as
      // a data attribute so what the page claims can be asserted directly in a browser test.
      configState: connectionState(row, configured && canStore),
      name: spec.name,
      description: DESCRIPTION[provider] ?? spec.summary,
      status,
      account: provider === "SMS" ? business.twilioPhoneNumber : (row?.externalAccount ?? null),
      lastSyncedAt: row?.lastSyncedAt ? `${formatDistanceToNowStrict(row.lastSyncedAt)} ago` : null,
      lastError: row?.lastError ?? null,
      detail: !planOk ? "Part of Daythread Pro." : status === "unavailable" ? `Not available on Daythread yet — coming as soon as ${spec.name} approves the app.` : null,
      adminNote: owner && !canStore && (status === "disconnected" || status === "unavailable") ? "Daythread configuration required: the deployment's credential encryption key isn't set, so new connections are paused." : owner && !configured && spec.env.length > 0 && status === "unavailable" ? `Daythread configuration required: ${spec.name} credentials aren't set on this deployment.` : null,
      approval: spec.approval ?? null,
      capabilities: CAPS[provider] ?? [],
      entitled: planOk && canStore && !limitReached,
      pill,
      limit: limitReached && limitCopy ? { message: limitCopy, upgradePlan: nextPlanName, upgradeHref: "/dashboard/settings?tab=subscription" } : !planOk ? { message: `${spec.name} is part of Daythread Pro.`, upgradePlan: "Pro", upgradeHref: "/dashboard/settings?tab=subscription" } : null,
      calendarsConnected: cal?.selected.length,
      accent: ACCENT[provider] ?? "#101114",
    };
  };

  // The Manage sheet reads only what the callback stored after Meta confirmed it: the WABA,
  // the number, and every number Meta granted this workspace. No secret is in `settings`.
  const waRow = byProvider.get("WHATSAPP");
  const waSettings = (waRow?.settings ?? null) as null | {
    wabaId?: string;
    wabaName?: string | null;
    phoneNumberId?: string;
    displayPhoneNumber?: string;
    verifiedName?: string;
    qualityRating?: string | null;
    codeVerificationStatus?: string | null;
    webhooksSubscribed?: boolean;
    availableNumbers?: Array<{ id: string; displayPhoneNumber: string; verifiedName: string; codeVerificationStatus?: string | null }>;
  };
  const waManage: WhatsAppManageModel | null =
    waRow && waSettings?.phoneNumberId && waSettings.wabaId
      ? {
          wabaId: waSettings.wabaId,
          wabaName: waSettings.wabaName ?? null,
          phoneNumberId: waSettings.phoneNumberId,
          displayPhoneNumber: waSettings.displayPhoneNumber ?? waRow.externalAccount ?? "",
          verifiedName: waSettings.verifiedName ?? "",
          qualityRating: waSettings.qualityRating ?? null,
          codeVerificationStatus: waSettings.codeVerificationStatus ?? null,
          webhooksSubscribed: waSettings.webhooksSubscribed !== false,
          availableNumbers: waSettings.availableNumbers ?? [],
          templatesEnabled: templatesEnabled(),
        }
      : null;

  const igRow = byProvider.get("INSTAGRAM");
  const igSettings = (igRow?.settings ?? null) as null | { username?: string; accountType?: string | null; webhooksSubscribed?: boolean; scopes?: string[] };
  const igManage: InstagramManageModel | null = igRow
    ? {
        username: igSettings?.username ?? igRow.externalAccount ?? null,
        accountType: igSettings?.accountType ?? null,
        scopes: igSettings?.scopes ?? (igRow.scopes ? igRow.scopes.split(",").map((x) => x.trim()).filter(Boolean) : []),
        webhooksSubscribed: igSettings?.webhooksSubscribed !== false,
        tokenExpiresAt: igRow.tokenExpiresAt,
        lastSyncedAt: igRow.lastSyncedAt,
      }
    : null;

  const banner = connected
    ? { tone: "success" as const, text: `${PROVIDERS[connected as keyof typeof PROVIDERS]?.name ?? connected} is connected.` }
    : connectError
      ? { tone: "warning" as const, text: `${errorProvider && PROVIDERS[errorProvider as keyof typeof PROVIDERS] ? PROVIDERS[errorProvider as keyof typeof PROVIDERS].name : "The integration"} ${ERRORS[connectError] ?? ERRORS.provider}` }
      : null;
  const wanted = rows.filter((r) => r.wanted && r.status === "NOT_CONNECTED").map((r) => PROVIDERS[r.provider as keyof typeof PROVIDERS]?.name).filter(Boolean);
  const connectedCount = usage.active;
  const unlimited = !Number.isFinite(usage.limit);
  const pct = unlimited ? 0 : Math.min(100, Math.round((usage.active / usage.limit) * 100));
  const icon = (provider: IntegrationProvider) =>
    provider === "GOOGLE_CALENDAR" ? <CalendarDays className="w-5 h-5 text-[#4285F4]" strokeWidth={2} aria-hidden /> : provider === "APPLE_CALENDAR" ? <Apple className="w-5 h-5 text-ink" strokeWidth={2} aria-hidden /> : ICON[provider] ? <ChannelIcon k={ICON[provider]!} size={24} /> : null;

  return (
    <div className="space-y-9">
      <header className="relative overflow-hidden rounded-[26px] border border-border bg-[radial-gradient(120%_140%_at_0%_0%,rgba(109,90,230,0.10),transparent_55%),radial-gradient(100%_120%_at_100%_100%,rgba(240,82,77,0.08),transparent_55%)] px-6 py-6 md:px-8 md:py-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-text">Connected channels</p>
        <h2 className="mt-2 font-sans font-extrabold text-[1.5rem] md:text-[1.9rem] leading-[1.05] tracking-[-0.03em] text-ink">Every place people write to you, and your calendar.</h2>
        <p className="mt-2 max-w-xl text-sm text-ink/65 leading-relaxed">Messages from every connected channel land in one inbox; connected calendars keep bookings and busy time in step. Every connection uses the provider&rsquo;s own sign-in — there is never a key to paste.</p>
        <div className="mt-5 rounded-2xl border border-border bg-white/80 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3" aria-label="Connected integrations">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-sans font-extrabold text-[1.25rem] tracking-[-0.02em] text-ink tabular-nums">{unlimited ? "Unlimited" : `${connectedCount} / ${usage.limit}`}</span>
              <span className="text-sm text-ink/70">{unlimited ? `connections on ${planName}` : "connected"}</span>
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink/80 ml-auto">{planName} plan</span>
            </div>
            {!unlimited && (
              <div className="mt-2 h-1.5 rounded-full bg-black/[0.06] overflow-hidden" role="progressbar" aria-valuenow={connectedCount} aria-valuemin={0} aria-valuemax={usage.limit} aria-label="Connections used">
                <div className={cn2("h-full rounded-full transition-[width]", usage.overQuota ? "bg-warning" : usage.atLimit ? "bg-signal" : "bg-ink")} style={{ width: `${pct}%` }} />
              </div>
            )}
            {!unlimited && !usage.atLimit && <p className="mt-1.5 text-[11px] text-ink/60">{usage.limit - connectedCount} more can be connected on {planName}.{nextPlanName ? ` ${PLANS[usage.nextPlan!].name} includes ${limitLabel(PLANS[usage.nextPlan!].maxIntegrations).toLowerCase()} connections.` : ""}</p>}
            {usage.atLimit && !usage.overQuota && <p className="mt-1.5 text-[11px] text-signal-text font-semibold">Connection limit reached. {planName} includes {usage.limit} connection{usage.limit === 1 ? "" : "s"}.{nextPlanName ? ` Upgrade to ${nextPlanName} to connect every channel.` : ""}</p>}
          </div>
          {usage.atLimit && nextPlanName && (
            <Link href="/dashboard/settings?tab=subscription" className="inline-flex items-center justify-center h-9 px-4 rounded-full bg-signal text-white text-sm font-bold shrink-0 hover:bg-signal-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50">Upgrade to {nextPlanName} →</Link>
          )}
        </div>
        {wanted.length > 0 && <p className="mt-3 text-xs text-signal-text font-semibold">You said you use {wanted.join(", ")} — connect {wanted.length === 1 ? "it" : "them"} below.</p>}
      </header>

      {usage.overQuota && (
        <div role="alert" className="rounded-2xl border border-warning/40 bg-warning-soft/60 px-4 py-3.5 text-sm text-ink/80">
          <span className="font-semibold text-ink">You have {connectedCount} connections; {planName} includes {usage.limit}.</span> Nothing was disconnected and everything keeps working. New connections are paused until you disconnect down to {usage.limit}{nextPlanName ? `, or upgrade to ${nextPlanName}` : ""}.
          {nextPlanName && <Link href="/dashboard/settings?tab=subscription" className="ml-2 font-semibold text-signal-text hover:underline">See plans →</Link>}
        </div>
      )}

      {banner && (
        <div role={banner.tone === "warning" ? "alert" : "status"} className={cn2(banner.tone === "success" ? "rounded-2xl border border-success/30 bg-success-soft/50 px-4 py-3 text-sm text-success-text" : "rounded-2xl border border-warning/40 bg-warning-soft/60 px-4 py-3 text-sm text-ink/80")}>{banner.text}</div>
      )}

      <Group title="Channels" hint="Where conversations come from">
        {(["EMAIL", "INSTAGRAM", "WHATSAPP", "SMS"] as IntegrationProvider[]).map((provider) => {
          const m = model(provider);
          const connect = provider === "EMAIL" ? connectGoogleGmail : provider === "INSTAGRAM" ? connectInstagramAction : provider === "WHATSAPP" ? connectWhatsAppAction : undefined;
          const live = m.status !== "disconnected" && m.status !== "unavailable";
          const manage =
            provider === "WHATSAPP" && waManage && live ? <WhatsAppManage model={waManage} />
            : provider === "INSTAGRAM" && igManage && live ? <InstagramManage model={igManage} />
            : undefined;
          return (
            <IntegrationCard key={provider} model={m} icon={icon(provider)} connect={connect} manage={manage}>
              {provider === "SMS" && m.entitled && m.status !== "unavailable" ? <SmsNumberPicker current={business.twilioPhoneNumber} /> : null}
              {provider === "EMAIL" && m.status === "connected" ? <p className="text-xs text-ink/65">New mail is pulled while Daythread is open and classified before it reaches you. Replies send from this account.</p> : null}
              {provider === "WHATSAPP" && m.status === "connected" ? <p className="text-xs text-ink/65">Free-form replies are allowed within 24 hours of a customer&rsquo;s message; later ones need an approved template, and Daythread says so instead of sending.</p> : null}
            </IntegrationCard>
          );
        })}
        <IntegrationCard model={model("WEBSITE")} icon={icon("WEBSITE")}>
          <p className="text-xs text-ink/65">Requests from <Link href={`/book/${business.handle}`} className="font-semibold text-ink hover:underline">/book/{business.handle}</Link> and the contact form at <Link href={`/embed/${business.handle}`} className="font-semibold text-ink hover:underline">/embed/{business.handle}</Link> arrive as conversations and bookings.</p>
        </IntegrationCard>
      </Group>

      <Group title="Calendar" hint="Bookings go out; busy time comes in">
        {(["GOOGLE_CALENDAR", "APPLE_CALENDAR"] as IntegrationProvider[]).map((provider) => (
          <IntegrationCard key={provider} model={model(provider)} icon={icon(provider)} connect={provider === "GOOGLE_CALENDAR" ? connectGoogleCalendar : undefined} />
        ))}
        <p className="text-[11px] text-ink/60 px-1">Daythread bookings are the source of truth and are mirrored to the calendar you choose. Events on selected calendars only block availability; they never create or change a booking.</p>
      </Group>

      {owner && (
        <section aria-label="Deployment configuration">
          <div className="flex items-baseline gap-3 mb-3 px-1">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink/60">Deployment</h3>
            <span className="text-[11px] text-ink/60">What the operator sets, not the business</span>
          </div>
          <MetaConfigPanel />
        </section>
      )}

    </div>
  );
}

function Group({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="flex items-baseline gap-3 mb-3 px-1">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink/60">{title}</h3>
        <span className="text-[11px] text-ink/60">{hint}</span>
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
