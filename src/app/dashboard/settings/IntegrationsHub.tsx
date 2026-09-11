import { prisma } from "@/lib/db";
import { formatDistanceToNowStrict } from "date-fns";
import { PROVIDERS, GROUPS, comingSoonFor, providerConfigured, providerMaturity, displayStatus, type ProviderSpec, type RegisteredProvider } from "@/lib/integrations/registry";
import { accessGated } from "@/lib/integrations/flags";
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
import { SlackManage } from "./SlackManage";
import { templatesEnabled } from "@/lib/meta/whatsapp";
import { connectionState } from "@/lib/meta/config";
import { connectGoogle } from "@/app/actions/googleAuth";
import { connectInstagram, connectWhatsApp, connectMicrosoft, connectSlack, connectDropbox, connectCalendly, connectStripe } from "@/app/actions/connect";
import { accessRequestFor } from "@/server/accessRequests";
import type { CalendlySettings } from "@/server/calendlySync";
import type { DeliveryCheck } from "@/server/instagramDelivery";
import type { SlackSettings } from "@/server/notify";
import { CalendarDays, Apple, Mail, CalendarClock, CreditCard, HardDrive, Box, Hash } from "lucide-react";
import type { Business, IntegrationProvider } from "@prisma/client";
import Link from "next/link";

/**
 * Settings → Integrations: the hub. Five groups from the registry, one visual language,
 * every status read from the row and the deployment. The Connect button is always the
 * obvious thing; a provider that is invite-only shows a request instead, and one that is
 * not offered yet says so without a button that pretends.
 */
const ICON: Partial<Record<IntegrationProvider, ChannelKey>> = { EMAIL: "gmail", SMS: "sms", INSTAGRAM: "instagram", WHATSAPP: "whatsapp", WEBSITE: "website" };
const ACCENT: Partial<Record<IntegrationProvider, string>> = { EMAIL: "linear-gradient(90deg,#4285F4,#34A853,#FBBC04,#EA4335)", MICROSOFT_OUTLOOK: "#0F6CBD", INSTAGRAM: "linear-gradient(90deg,#F58529,#DD2A7B,#8134AF)", WHATSAPP: "#25D366", SMS: "#34C759", WEBSITE: "#101114", GOOGLE_CALENDAR: "linear-gradient(90deg,#4285F4,#34A853)", MICROSOFT_CALENDAR: "#0F6CBD", APPLE_CALENDAR: "#101114", CALENDLY: "#006BFF", STRIPE: "#635BFF", GOOGLE_DRIVE: "linear-gradient(90deg,#4285F4,#FBBC04,#34A853)", DROPBOX: "#0061FF", SLACK: "linear-gradient(90deg,#E01E5A,#36C5F0,#2EB67D,#ECB22E)" };
const DESCRIPTION: Partial<Record<IntegrationProvider, string>> = {
  EMAIL: "Read your inbox and reply from your own address. Daythread sorts what needs you from what doesn't.",
  MICROSOFT_OUTLOOK: "Read your Outlook inbox and reply from your own address, sorted the same way.",
  INSTAGRAM: "DMs to your professional account land in the same thread as everything else.",
  WHATSAPP: "WhatsApp Business messages with real delivered and read receipts.",
  SMS: "A dedicated business number. Texts arrive here; replies go out from it.",
  GOOGLE_CALENDAR: "Sync your schedule and automatically account for busy time when managing bookings.",
  MICROSOFT_CALENDAR: "Bookings go to your Outlook calendar; busy time on it can't be double-booked.",
  APPLE_CALENDAR: "Connect your iCloud calendars and keep your Daythread schedule aligned.",
  CALENDLY: "Meetings booked through Calendly become bookings here, matched to the person who booked.",
  STRIPE: "Payments to your own Stripe account, recorded against the person who paid. Daythread never moves money.",
  GOOGLE_DRIVE: "A Daythread folder in your Drive with a folder per client. Files stay in Drive.",
  DROPBOX: "A Daythread app folder in your Dropbox with a folder per client. Files stay in Dropbox.",
  WEBSITE: "Your public booking page and contact form. Inquiries and bookings arrive as conversations.",
  SLACK: "New inquiries and bookings posted to a channel you choose. Names and times, never the message.",
};
const CAPS: Partial<Record<IntegrationProvider, string[]>> = {
  EMAIL: ["Inbox sync", "Send replies", "Threads"],
  MICROSOFT_OUTLOOK: ["Inbox sync", "Send replies", "Threads"],
  INSTAGRAM: ["Inbox sync", "Send replies", "Webhooks"],
  WHATSAPP: ["Inbox sync", "Send replies", "Delivery receipts"],
  SMS: ["Inbox sync", "Send replies", "Delivery receipts"],
  GOOGLE_CALENDAR: ["Calendar sync", "Availability", "Booking coordination"],
  MICROSOFT_CALENDAR: ["Calendar sync", "Availability", "Booking coordination"],
  APPLE_CALENDAR: ["Calendar sync", "Availability", "Booking coordination"],
  CALENDLY: ["Import bookings", "Webhooks", "Daily check"],
  STRIPE: ["Record payments", "Refunds", "Webhooks"],
  GOOGLE_DRIVE: ["Folder per client", "File list"],
  DROPBOX: ["Folder per client", "File list"],
  WEBSITE: ["Inquiries", "Bookings"],
  SLACK: ["New inquiry", "New booking", "Connection alerts"],
};
const ERRORS: Record<string, string> = {
  denied: "could not be connected. The authorization was canceled before it finished — try connecting again.",
  expired: "could not be connected. The sign-in took too long — start again.",
  state: "could not be connected. The sign-in couldn't be verified — start again from this page.",
  session: "could not be connected. Finish connecting from the browser you started in, signed in to this workspace.",
  tenant: "could not be connected. Only an owner or admin of this workspace can connect it.",
  encryption: "could not be connected. Daythread configuration is incomplete — the operator has been notified.",
  configuration: "could not be connected. This deployment doesn't have the provider credentials set.",
  no_refresh_token: "could not be connected. The provider didn't grant long-term access — try again and approve everything it asks.",
  scopes: "could not be connected. The permissions Daythread needs weren't granted — try again and approve everything it asks.",
  account_type: "only allows messaging for professional accounts (Business or Creator). Switch your account type in Instagram, then try again.",
  in_use: "is already connected to another Daythread workspace.",
  no_waba: "returned no WhatsApp Business Account for that login.",
  no_phone: "has no phone number on that WhatsApp Business Account yet — add one in Meta Business Manager, then connect again.",
  provider: "could not be connected. The provider returned an error and nothing was saved — try again in a minute.",
  limit: "could not be connected: your plan's connection limit is reached. Disconnect one, or upgrade to connect more.",
  access: "is invite-only right now. Request access below and Daythread will let you know when it's open for your workspace.",
  coming_soon: "isn't available on Daythread yet.",
};

export async function IntegrationsHub({ business, role, connected, connectError, errorProvider }: { business: Business; role: string; connected?: string; connectError?: string; errorProvider?: string }) {
  const rows = await prisma.integration.findMany({ where: { businessId: business.id } });
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  const encryptionOk = process.env.NODE_ENV !== "production" || tokenCryptoConfigured();
  const owner = role === "OWNER";
  const admin = owner || role === "ADMIN";
  // The same arithmetic the server uses to refuse a connection — shown, never decided, here.
  const usage = usageFor(business, rows);
  const planName = PLANS[usage.plan].name;
  const nextPlanName = usage.nextPlan ? PLANS[usage.nextPlan].name : null;
  const limitCopy = usage.atLimit ? limitMessage(usage) : null;
  const igAccess = providerMaturity("INSTAGRAM") === "beta" ? await accessRequestFor(business.id, "INSTAGRAM") : null;

  const model = (provider: RegisteredProvider): CardModel => {
    const spec: ProviderSpec = PROVIDERS[provider];
    const row = byProvider.get(provider) ?? null;
    const configured = providerConfigured(spec);
    const maturity = providerMaturity(provider);
    const status = displayStatus(spec, row, configured);
    const canStore = spec.auth === "oauth" || spec.auth === "app_password" ? encryptionOk : true;
    const planOk = provider === "SMS" ? smsEntitled(business) : true;
    const cal = row && spec.kind === "calendar" ? readCalendarSettings(row) : null;
    // A provider that is not currently holding a slot needs a free one to (re)connect.
    const holdsSlot = Boolean(row && countsTowardQuota(row));
    const needsSlot = (status === "disconnected" || status === "needs_attention") && !holdsSlot;
    const limitReached = needsSlot && usage.atLimit;
    const access = provider === "INSTAGRAM" && igAccess ? { status: igAccess.status, decisionNote: igAccess.decisionNote, requestedAt: igAccess.requestedAt?.toISOString() ?? null } : null;
    const gated = accessGated(maturity, access?.status, row?.status);
    const pill: CardModel["pill"] =
      status === "connected" ? { label: "Connected", tone: "success" }
      : status === "always_on" ? { label: "Always on", tone: "success" }
      : status === "sync_issue" ? { label: "Sync issue", tone: "warning" }
      : status === "needs_attention" ? { label: "Needs attention", tone: "accent" }
      : maturity === "coming_soon" ? { label: "Coming soon", tone: "neutral" }
      : gated ? { label: "Beta", tone: "accent" }
      : status === "unavailable" ? { label: owner ? "Configuration required" : "Not available yet", tone: "neutral" }
      : !canStore ? { label: "Configuration required", tone: "neutral" }
      : !planOk || limitReached ? { label: "Upgrade required", tone: "signal" }
      : { label: "Available", tone: "neutral" };
    const detail =
      maturity === "coming_soon" ? `${spec.name} isn't available on Daythread yet. It will appear here as soon as it is.`
      : gated ? (access?.status === "REJECTED" ? `Daythread couldn't open ${spec.name} for this workspace yet${access.decisionNote ? `: ${access.decisionNote}` : "."}` : access?.status === "REVOKED" ? `Your ${spec.name} access on Daythread was paused${access.decisionNote ? `: ${access.decisionNote}` : "."}` : `${spec.name} is in an invite-only beta while Meta reviews the app. Ask for access and Daythread will let you know.`)
      : !planOk ? "Part of Daythread Pro."
      : status === "unavailable" ? `Not available on Daythread yet — coming as soon as ${spec.name} approves the app.`
      : null;
    return {
      provider,
      configState: connectionState(row, configured && canStore),
      name: spec.name,
      description: DESCRIPTION[provider] ?? spec.summary,
      status,
      maturity,
      access: gated ? access ?? { status: "NONE", decisionNote: null, requestedAt: null } : null,
      canAsk: admin,
      account: provider === "SMS" ? business.twilioPhoneNumber : (row?.externalAccount ?? null),
      lastSyncedAt: row?.lastSyncedAt ? `${formatDistanceToNowStrict(row.lastSyncedAt)} ago` : null,
      lastReceivedAt: row?.lastWebhookAt ? `${formatDistanceToNowStrict(row.lastWebhookAt)} ago` : null,
      lastError: row?.lastError ?? null,
      detail,
      adminNote: owner && !canStore && (status === "disconnected" || status === "unavailable") ? "Daythread configuration required: the deployment's credential encryption key isn't set, so new connections are paused." : owner && !configured && spec.env.length > 0 && status === "unavailable" && maturity !== "coming_soon" ? `Daythread configuration required: ${spec.name} credentials aren't set on this deployment.` : null,
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
  const igSettings = (igRow?.settings ?? null) as null | { username?: string; accountType?: string | null; webhooksSubscribed?: boolean; scopes?: string[]; deliveryCheck?: DeliveryCheck };
  const igManage: InstagramManageModel | null = igRow
    ? {
        username: igSettings?.username ?? igRow.externalAccount ?? null,
        accountType: igSettings?.accountType ?? null,
        scopes: igSettings?.scopes ?? (igRow.scopes ? igRow.scopes.split(",").map((x) => x.trim()).filter(Boolean) : []),
        webhooksSubscribed: igSettings?.webhooksSubscribed !== false,
        tokenExpiresAt: igRow.tokenExpiresAt,
        lastSyncedAt: igRow.lastSyncedAt,
        deliveryCheck: igSettings?.deliveryCheck ?? null,
      }
    : null;

  const slackRow = byProvider.get("SLACK");
  const slackSettings = (slackRow?.settings ?? {}) as SlackSettings;
  const calendlyRow = byProvider.get("CALENDLY");
  const calendlySettings = (calendlyRow?.settings ?? {}) as CalendlySettings;
  const stripeRow = byProvider.get("STRIPE");
  const stripeSettings = (stripeRow?.settings ?? {}) as { accountId?: string; livemode?: boolean; chargesEnabled?: boolean | null; currency?: string | null };

  const manageFor = (provider: RegisteredProvider, live: boolean): React.ReactNode => {
    if (!live) return undefined;
    if (provider === "WHATSAPP" && waManage) return <WhatsAppManage model={waManage} />;
    if (provider === "INSTAGRAM" && igManage) return <InstagramManage model={igManage} />;
    if (provider === "SLACK" && slackRow) return <SlackManage model={{ teamName: slackSettings.teamName ?? slackRow.externalAccount ?? null, channelName: slackSettings.channelName ?? null, lastPostAt: slackSettings.lastPostAt ?? null, lastPostError: slackSettings.lastPostError ?? null }} />;
    if (provider === "CALENDLY" && calendlyRow) return (
      <Details rows={[
        ["Account", calendlyRow.externalAccount ?? "—"],
        ["Scheduling page", calendlySettings.schedulingUrl ?? "—"],
        ["Instant updates", calendlySettings.webhooks === "active" ? "On (Calendly webhook)" : calendlySettings.webhooks === "unavailable" ? "Not on your Calendly plan — checked on open and daily instead" : "Not set up — checked on open and daily"],
        ["Last import", calendlyRow.lastSyncedAt ? `${formatDistanceToNowStrict(calendlyRow.lastSyncedAt)} ago` : "—"],
      ]} note="Meetings from the last 30 days and the year ahead are imported as confirmed bookings. A service is created for each Calendly event type, hidden from your booking page until you switch it on. Nothing is written to Calendly." />
    );
    if (provider === "STRIPE" && stripeRow) return (
      <Details rows={[
        ["Account", stripeRow.externalAccount ?? "—"],
        ["Account id", stripeSettings.accountId ?? stripeRow.externalId ?? "—"],
        ["Mode", stripeSettings.livemode === false ? "Test" : "Live"],
        ["Charges", stripeSettings.chargesEnabled === false ? "Not enabled yet in Stripe" : stripeSettings.chargesEnabled ? "Enabled" : "—"],
        ["Last event", stripeRow.lastWebhookAt ? `${formatDistanceToNowStrict(stripeRow.lastWebhookAt)} ago` : "None yet"],
      ]} note="Successful payments and refunds on your account are recorded against the person who paid. Daythread never creates charges, refunds or payouts." />
    );
    if ((provider === "GOOGLE_DRIVE" || provider === "DROPBOX") && byProvider.get(provider)) return <Details rows={[["Account", byProvider.get(provider)?.externalAccount ?? "—"], ["Folders", "Created per client from a client's page"]]} note="Daythread only sees the folders it created. Files stay where they are; the client page lists their names and links." />;
    if (provider === "MICROSOFT_OUTLOOK" && byProvider.get(provider)) return <Details rows={[["Mailbox", byProvider.get(provider)?.externalAccount ?? "—"], ["Last sync", byProvider.get(provider)?.lastSyncedAt ? `${formatDistanceToNowStrict(byProvider.get(provider)!.lastSyncedAt!)} ago` : "—"]]} note="New mail is pulled while Daythread is open and once a day. Replies send from this mailbox, inside the customer's thread." />;
    return undefined;
  };

  const banner = connected
    ? { tone: "success" as const, text: `${PROVIDERS[connected as RegisteredProvider]?.name ?? connected} is connected.` }
    : connectError
      ? { tone: "warning" as const, text: `${errorProvider && PROVIDERS[errorProvider as RegisteredProvider] ? PROVIDERS[errorProvider as RegisteredProvider].name : "The integration"} ${ERRORS[connectError] ?? ERRORS.provider}` }
      : null;
  const wanted = rows.filter((r) => r.wanted && r.status === "NOT_CONNECTED").map((r) => PROVIDERS[r.provider as RegisteredProvider]?.name).filter(Boolean);
  const connectedCount = usage.active;
  const unlimited = !Number.isFinite(usage.limit);
  const pct = unlimited ? 0 : Math.min(100, Math.round((usage.active / usage.limit) * 100));
  const icon = (provider: IntegrationProvider) =>
    provider === "GOOGLE_CALENDAR" ? <CalendarDays className="w-5 h-5 text-[#4285F4]" strokeWidth={2} aria-hidden />
    : provider === "MICROSOFT_CALENDAR" ? <CalendarDays className="w-5 h-5 text-[#0F6CBD]" strokeWidth={2} aria-hidden />
    : provider === "APPLE_CALENDAR" ? <Apple className="w-5 h-5 text-ink" strokeWidth={2} aria-hidden />
    : provider === "MICROSOFT_OUTLOOK" ? <Mail className="w-5 h-5 text-[#0F6CBD]" strokeWidth={2} aria-hidden />
    : provider === "CALENDLY" ? <CalendarClock className="w-5 h-5 text-[#006BFF]" strokeWidth={2} aria-hidden />
    : provider === "STRIPE" ? <CreditCard className="w-5 h-5 text-[#635BFF]" strokeWidth={2} aria-hidden />
    : provider === "GOOGLE_DRIVE" ? <HardDrive className="w-5 h-5 text-[#34A853]" strokeWidth={2} aria-hidden />
    : provider === "DROPBOX" ? <Box className="w-5 h-5 text-[#0061FF]" strokeWidth={2} aria-hidden />
    : provider === "SLACK" ? <Hash className="w-5 h-5 text-[#4A154B]" strokeWidth={2} aria-hidden />
    : ICON[provider] ? <ChannelIcon k={ICON[provider]!} size={24} /> : null;
  const connectFor = (provider: RegisteredProvider) =>
    provider === "EMAIL" ? connectGoogleGmail
    : provider === "GOOGLE_CALENDAR" ? connectGoogleCalendar
    : provider === "GOOGLE_DRIVE" ? connectGoogleDrive
    : provider === "MICROSOFT_OUTLOOK" ? connectMicrosoftMail
    : provider === "MICROSOFT_CALENDAR" ? connectMicrosoftCalendar
    : provider === "INSTAGRAM" ? connectInstagramAction
    : provider === "WHATSAPP" ? connectWhatsAppAction
    : provider === "SLACK" ? connectSlackAction
    : provider === "DROPBOX" ? connectDropboxAction
    : provider === "CALENDLY" ? connectCalendlyAction
    : provider === "STRIPE" ? connectStripeAction
    : undefined;

  return (
    <div className="space-y-9">
      <header className="relative overflow-hidden rounded-[26px] border border-border bg-[radial-gradient(120%_140%_at_0%_0%,rgba(109,90,230,0.10),transparent_55%),radial-gradient(100%_120%_at_100%_100%,rgba(240,82,77,0.08),transparent_55%)] px-6 py-6 md:px-8 md:py-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-text">Integrations</p>
        <h2 className="mt-2 font-sans font-extrabold text-[1.5rem] md:text-[1.9rem] leading-[1.05] tracking-[-0.03em] text-ink">Every place people write to you, book you, and pay you.</h2>
        <p className="mt-2 max-w-xl text-sm text-ink/70 leading-relaxed">Messages from every connected channel land in one inbox; calendars, scheduling tools and payments keep bookings and people in step. Every connection uses the provider&rsquo;s own sign-in — there is never a key to paste.</p>
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
            {!unlimited && !usage.atLimit && <p className="mt-1.5 text-[11px] text-ink/65">{usage.limit - connectedCount} more can be connected on {planName}.{nextPlanName ? ` ${PLANS[usage.nextPlan!].name} includes ${limitLabel(PLANS[usage.nextPlan!].maxIntegrations).toLowerCase()} connections.` : ""}</p>}
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

      {GROUPS.map((group) => (
        <Group key={group.key} title={group.title} hint={group.hint}>
          {group.providers.filter((p) => providerMaturity(p) !== "off").map((provider) => {
            const m = model(provider);
            const live = m.status !== "disconnected" && m.status !== "unavailable";
            return (
              <IntegrationCard key={provider} model={m} icon={icon(provider)} connect={m.maturity === "coming_soon" ? undefined : connectFor(provider)} manage={manageFor(provider, live)}>
                {provider === "SMS" && m.entitled && m.status !== "unavailable" ? <SmsNumberPicker current={business.twilioPhoneNumber} /> : null}
                {provider === "EMAIL" && m.status === "connected" ? <p className="text-xs text-ink/70">New mail is pulled while Daythread is open and classified before it reaches you. Replies send from this account.</p> : null}
                {provider === "WHATSAPP" && m.status === "connected" ? <p className="text-xs text-ink/70">Free-form replies are allowed within 24 hours of a customer&rsquo;s message; later ones need an approved template, and Daythread says so instead of sending.</p> : null}
                {provider === "SLACK" && m.status === "connected" && !slackSettings.channelId ? <p className="text-xs text-signal-text font-semibold">Choose a channel under Manage — nothing is posted until you do.</p> : null}
                {provider === "WEBSITE" ? <p className="text-xs text-ink/70">Requests from <Link href={`/book/${business.handle}`} className="font-semibold text-ink hover:underline">/book/{business.handle}</Link> and the contact form at <Link href={`/embed/${business.handle}`} className="font-semibold text-ink hover:underline">/embed/{business.handle}</Link> arrive as conversations and bookings.</p> : null}
              </IntegrationCard>
            );
          })}
          {comingSoonFor(group.key).map((c) => (
            <NotYet key={c.key} name={c.name} summary={c.summary} />
          ))}
          {group.key === "scheduling" && <p className="text-[11px] text-ink/65 px-1">Daythread bookings are the source of truth and are mirrored to the calendar you choose. Events on selected calendars only block availability; they never create or change a booking. Calendly is the exception by design: its meetings become bookings here.</p>}
        </Group>
      ))}

      {owner && (
        <section aria-label="Deployment configuration">
          <div className="flex items-baseline gap-3 mb-3 px-1">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink/65">Deployment</h3>
            <span className="text-[11px] text-ink/65">What the operator sets, not the business</span>
          </div>
          <MetaConfigPanel />
        </section>
      )}
    </div>
  );
}

/**
 * An integration Daythread does not have yet. Deliberately not an IntegrationCard: there is
 * no row, no status to derive and nothing to connect, and a card that looked the same would
 * invite a click that goes nowhere.
 */
function NotYet({ name, summary }: { name: string; summary: string }) {
  return (
    <article aria-label={name} data-coming-soon="true" className="rounded-[22px] border border-dashed border-border bg-paper/40 px-4 sm:px-5 py-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-[15px] font-semibold text-ink/70">{name}</h3>
        <span className="inline-flex items-center text-[11px] font-bold rounded-full px-2 py-0.5 bg-black/[0.05] text-ink/60">Coming soon</span>
      </div>
      <p className="mt-1 text-sm text-ink/55 leading-snug">{summary}</p>
    </article>
  );
}

function Group({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="flex items-baseline gap-3 mb-3 px-1">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink/65">{title}</h3>
        <span className="text-[11px] text-ink/65">{hint}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
function Details({ rows, note }: { rows: Array<[string, string]>; note?: string }) {
  return (
    <div className="space-y-3 text-sm">
      <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-[13px]">
        {rows.map(([k, v]) => (<span key={k} className="contents"><dt className="text-ink/60">{k}</dt><dd className="text-ink break-all">{v}</dd></span>))}
      </dl>
      {note && <p className="text-[12px] text-ink/65 leading-relaxed">{note}</p>}
    </div>
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
async function connectGoogleDrive() {
  "use server";
  await connectGoogle("drive");
}
async function connectMicrosoftMail() {
  "use server";
  await connectMicrosoft("mail");
}
async function connectMicrosoftCalendar() {
  "use server";
  await connectMicrosoft("calendar");
}
async function connectInstagramAction() {
  "use server";
  await connectInstagram();
}
async function connectWhatsAppAction() {
  "use server";
  await connectWhatsApp();
}
async function connectSlackAction() {
  "use server";
  await connectSlack();
}
async function connectDropboxAction() {
  "use server";
  await connectDropbox();
}
async function connectCalendlyAction() {
  "use server";
  await connectCalendly();
}
async function connectStripeAction() {
  "use server";
  await connectStripe();
}
