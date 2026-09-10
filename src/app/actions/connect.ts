"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole, type SessionPayload } from "@/lib/auth";
import { signOAuthState, beginPkce, type OAuthProvider, type OAuthPurpose } from "@/lib/integrations/oauthState";
import { microsoftConfigured, microsoftAuthUrl } from "@/lib/microsoft";
import { slackConfigured, slackAuthUrl, revokeSlackToken, listSlackChannels, joinSlackChannel, type SlackChannel } from "@/lib/slack";
import { dropboxConfigured, dropboxAuthUrl, revokeDropboxToken } from "@/lib/dropbox";
import { calendlyConfigured, calendlyAuthUrl, revokeCalendlyToken, deleteCalendlyWebhook, calendlyToken } from "@/lib/calendly";
import { stripeConnectConfigured, stripeConnectAuthUrl, deauthorizeStripeAccount } from "@/lib/stripeConnect";
import { accessGranted } from "@/server/accessRequests";
import { providerMaturity } from "@/lib/integrations/flags";
import { recordAudit } from "@/server/audit";
import { syncOutlookForBusiness } from "@/server/outlookSync";
import { syncCalendlyForBusiness, type CalendlySettings } from "@/server/calendlySync";
import { postToSlack, type SlackSettings } from "@/server/notify";
import { runInstagramDeliveryCheck, type DeliveryCheck } from "@/server/instagramDelivery";
import { enforceRateLimit } from "@/lib/rateLimit";
import { tokenCryptoConfigured } from "@/lib/tokenCrypto";
import { instagramConfigured, instagramAuthUrl, unsubscribeInstagramWebhooks } from "@/lib/meta/instagram";
import { whatsappConfigured, whatsappAuthUrl, unsubscribeWabaWebhooks, listPhoneNumbers, tokenOwnsWaba } from "@/lib/meta/whatsapp";
import { makeClient, discover, listCalendars as caldavCalendars } from "@/lib/caldav";
import { syncCalendarIn, readCalendarSettings, type CalendarChoice } from "@/server/calendarSync";
import { twilioConfigured, searchNumbers, provisionNumber, releaseNumber } from "@/lib/twilio";
import { smsEntitled } from "@/lib/billing";
import { track } from "@/lib/analytics";
import { reportFailure } from "@/lib/observe";
import { disconnectGoogle } from "@/app/actions/googleAuth";
import { activateIntegration, canActivate, limitMessage } from "@/server/integrationQuota";
import { syncCalendarNow } from "@/app/actions/calendars";
import { z } from "zod";
import type { IntegrationProvider } from "@prisma/client";

const ADMIN = ["OWNER", "ADMIN"] as const;

function guardEncryption() {
  if (process.env.NODE_ENV === "production" && !tokenCryptoConfigured()) throw new Error("Connections are paused until the deployment's encryption key is configured.");
}

/** Before sending someone to a provider: if the plan has no free slot, come straight back
 * with the reason instead of a wasted trip. The callback enforces it again, atomically. */
async function guardQuotaOrRedirect(businessId: string, provider: IntegrationProvider) {
  const check = await canActivate(businessId, provider);
  if (check.ok) return;
  await track("integration_limit_reached", { businessId, properties: { provider, plan: check.usage.plan, stage: "start" } });
  redirect(`/dashboard/settings?tab=connections&connect_error=limit&provider=${provider}`);
}

/** Instagram: Meta's own authorization screen. Professional accounts only. Invite-only while
 * Meta's review is pending: a workspace without an approved access request is sent back
 * with the reason instead of to Meta. */
export async function connectInstagram(session?: SessionPayload | null) {
  const ctx = await requireRole([...ADMIN], session);
  if (!ctx) throw new Error("unauthorized");
  if (!instagramConfigured()) throw new Error("Instagram isn't configured on this deployment.");
  if (!(await accessGranted(ctx.business.id, "INSTAGRAM"))) redirect(`/dashboard/settings?tab=connections&connect_error=access&provider=INSTAGRAM`);
  guardEncryption();
  await guardQuotaOrRedirect(ctx.business.id, "INSTAGRAM");
  await track("integration_connect_started", { businessId: ctx.business.id, properties: { provider: "INSTAGRAM" } });
  const state = await signOAuthState({ provider: "instagram", purpose: "messaging", businessId: ctx.business.id, userId: ctx.session.userId });
  redirect(instagramAuthUrl(state));
}

/** WhatsApp: Meta's Embedded Signup (Facebook Login for Business). */
export async function connectWhatsApp(session?: SessionPayload | null) {
  const ctx = await requireRole([...ADMIN], session);
  if (!ctx) throw new Error("unauthorized");
  if (!whatsappConfigured()) throw new Error("WhatsApp isn't configured on this deployment.");
  if (providerMaturity("WHATSAPP") !== "ga") redirect(`/dashboard/settings?tab=connections&connect_error=coming_soon&provider=WHATSAPP`);
  guardEncryption();
  await guardQuotaOrRedirect(ctx.business.id, "WHATSAPP");
  await track("integration_connect_started", { businessId: ctx.business.id, properties: { provider: "WHATSAPP" } });
  const state = await signOAuthState({ provider: "whatsapp", purpose: "messaging", businessId: ctx.business.id, userId: ctx.session.userId });
  redirect(whatsappAuthUrl(state));
}

/**
 * One start for every OAuth provider: role, deployment configuration, encryption, plan
 * slot, a signed state (and a PKCE challenge when the provider uses one), then the
 * provider's own authorization screen. Never a toggle.
 */
async function startOAuth(opts: { provider: IntegrationProvider; oauthProvider: OAuthProvider; purpose: OAuthPurpose; configured: boolean; name: string; pkce?: boolean; url: (state: string, codeChallenge: string | null) => string }, session?: SessionPayload | null): Promise<never> {
  const ctx = await requireRole([...ADMIN], session);
  if (!ctx) throw new Error("unauthorized");
  if (!opts.configured) throw new Error(`${opts.name} isn't configured on this deployment.`);
  guardEncryption();
  await guardQuotaOrRedirect(ctx.business.id, opts.provider);
  await track("integration_connect_started", { businessId: ctx.business.id, properties: { provider: opts.provider } });
  const state = await signOAuthState({ provider: opts.oauthProvider, purpose: opts.purpose, businessId: ctx.business.id, userId: ctx.session.userId });
  const challenge = opts.pkce ? (await beginPkce(opts.oauthProvider)).codeChallenge : null;
  redirect(opts.url(state, challenge));
}

/** Microsoft: Outlook mail or Outlook calendar, one Entra app, the purpose picks the scopes. */
export async function connectMicrosoft(purpose: "mail" | "calendar", session?: SessionPayload | null) {
  const calendar = purpose === "calendar";
  return startOAuth({ provider: calendar ? "MICROSOFT_CALENDAR" : "MICROSOFT_OUTLOOK", oauthProvider: "microsoft", purpose: calendar ? "calendar" : "mail", configured: microsoftConfigured(), name: calendar ? "Microsoft Calendar" : "Microsoft Outlook", pkce: true, url: (state, challenge) => microsoftAuthUrl(state, purpose, challenge!) }, session);
}

export async function connectSlack(session?: SessionPayload | null) {
  return startOAuth({ provider: "SLACK", oauthProvider: "slack", purpose: "notifications", configured: slackConfigured(), name: "Slack", url: (state) => slackAuthUrl(state) }, session);
}

export async function connectDropbox(session?: SessionPayload | null) {
  return startOAuth({ provider: "DROPBOX", oauthProvider: "dropbox", purpose: "files", configured: dropboxConfigured(), name: "Dropbox", pkce: true, url: (state, challenge) => dropboxAuthUrl(state, challenge!) }, session);
}

export async function connectCalendly(session?: SessionPayload | null) {
  return startOAuth({ provider: "CALENDLY", oauthProvider: "calendly", purpose: "scheduling", configured: calendlyConfigured(), name: "Calendly", url: (state) => calendlyAuthUrl(state) }, session);
}

/** Stripe Connect (Standard): the business authorizes Daythread on its own Stripe account. */
export async function connectStripe(session?: SessionPayload | null) {
  const ctx = await requireRole([...ADMIN], session);
  if (!ctx) throw new Error("unauthorized");
  const owner = await prisma.user.findUnique({ where: { id: ctx.session.userId }, select: { email: true } });
  return startOAuth({ provider: "STRIPE", oauthProvider: "stripe", purpose: "payments", configured: stripeConnectConfigured(), name: "Stripe", url: (state) => stripeConnectAuthUrl(state, { email: owner?.email ?? null, businessName: ctx.business.name, url: process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/book/${ctx.business.handle}` : null }) }, session);
}

/**
 * "Is Instagram going to deliver DMs here?" — asks Meta, rather than reporting the boolean
 * written when the subscription was first made. Owner or admin, tenant-scoped to their own
 * connection. Returns states and counts; never a token, a secret or a message.
 */
export async function checkInstagramDelivery(session?: SessionPayload | null): Promise<{ ok: true; check: DeliveryCheck } | { ok: false; error: string }> {
  const ctx = await requireRole([...ADMIN], session);
  if (!ctx) return { ok: false, error: "unauthorized" };
  try {
    await enforceRateLimit(`ig-delivery-check:${ctx.business.id}`, { limit: 10, windowMs: 10 * 60 * 1000 });
  } catch {
    return { ok: false, error: "Checked too many times just now. Try again in a few minutes." };
  }
  const r = await runInstagramDeliveryCheck(ctx.business.id);
  revalidatePath("/dashboard/settings");
  return r;
}

/** The channels the Slack bot can post to, for the picker in Manage. */
export async function listSlackChannelsAction(session?: SessionPayload | null): Promise<{ channels: SlackChannel[]; current: string | null; error?: string }> {
  const ctx = await requireRole([...ADMIN], session);
  if (!ctx) return { channels: [], current: null, error: "unauthorized" };
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider: "SLACK" } } });
  if (!row?.accessToken || row.status === "NOT_CONNECTED") return { channels: [], current: null, error: "Slack isn't connected." };
  try {
    return { channels: await listSlackChannels(row.accessToken), current: ((row.settings ?? {}) as SlackSettings).channelId ?? null };
  } catch (err) {
    await reportFailure("sync", "Slack channel list failed", { businessId: ctx.business.id, provider: "SLACK", error: err, level: "warn" });
    return { channels: [], current: null, error: "Couldn't list channels right now. Reconnect Slack if this keeps happening." };
  }
}

/** Choose the channel. The bot joins it (public channels) and posts one line so the choice is verified, not assumed. */
export async function selectSlackChannel(channelId: string, session?: SessionPayload | null): Promise<{ error?: string; channelName?: string }> {
  const ctx = await requireRole([...ADMIN], session);
  if (!ctx) return { error: "unauthorized" };
  const id = channelId.trim().slice(0, 40);
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider: "SLACK" } } });
  if (!row?.accessToken || row.status === "NOT_CONNECTED") return { error: "Slack isn't connected." };
  try {
    const channels = await listSlackChannels(row.accessToken);
    const chosen = channels.find((c) => c.id === id);
    if (!chosen) return { error: "That channel isn't available to the Daythread app." };
    if (!chosen.isMember) await joinSlackChannel(row.accessToken, chosen.id);
    const settings = (row.settings ?? {}) as SlackSettings;
    await prisma.integration.update({ where: { id: row.id }, data: { settings: { ...settings, channelId: chosen.id, channelName: chosen.name, lastPostError: null }, status: "CONNECTED", lastError: null, lastErrorAt: null, lastSyncStatus: null } });
    const posted = await postToSlack(ctx.business.id, { kind: "integration", title: "Daythread connected", body: `New inquiries and bookings for ${ctx.business.name} will be posted here.` });
    if (!posted) return { error: "The channel was saved but the first message didn't go through. Check the app's permissions in Slack." };
    await recordAudit({ businessId: ctx.business.id, actorId: ctx.session.userId, action: "integration.slack_channel_set", targetType: "integration", targetId: row.id, metadata: { channel: chosen.name } });
    revalidatePath("/dashboard/settings");
    return { channelName: chosen.name };
  } catch (err) {
    await reportFailure("oauth", "Slack channel selection failed", { businessId: ctx.business.id, provider: "SLACK", error: err });
    return { error: "Slack didn't accept that. Nothing was changed — try again in a minute." };
  }
}

/**
 * Apple Calendar over iCloud CalDAV. The credential is an app-specific password the user
 * generates at appleid.apple.com — Apple's supported mechanism for third-party calendar
 * clients — never their Apple ID password. It is verified by a real discovery call before
 * anything is stored, stored encrypted, and revocable from Apple's side at any time.
 */
const AppleSchema = z.object({
  appleId: z.string().trim().toLowerCase().email("Enter the email address of your Apple ID."),
  appSpecificPassword: z.string().trim().regex(/^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$/i, "That isn't an app-specific password. They look like abcd-efgh-ijkl-mnop — create one at appleid.apple.com → Sign-In and Security → App-Specific Passwords."),
});

export type AppleConnectResult = { error?: string; calendars?: CalendarChoice[]; selected?: string[] };

export async function connectAppleCalendar(appleId: string, appSpecificPassword: string, session?: SessionPayload | null): Promise<AppleConnectResult> {
  const ctx = await requireRole([...ADMIN], session);
  if (!ctx) throw new Error("unauthorized");
  guardEncryption();
  const parsed = AppleSchema.safeParse({ appleId, appSpecificPassword });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details and try again." };
  const { appleId: id, appSpecificPassword: pw } = parsed.data;
  const slot = await canActivate(ctx.business.id, "APPLE_CALENDAR");
  if (!slot.ok) {
    await track("integration_limit_reached", { businessId: ctx.business.id, properties: { provider: "APPLE_CALENDAR", plan: slot.usage.plan, stage: "start" } });
    return { error: limitMessage(slot.usage) };
  }
  await track("integration_connect_started", { businessId: ctx.business.id, properties: { provider: "APPLE_CALENDAR" } });
  try {
    const client = makeClient(id, pw);
    const found = await discover(client);
    const cals = await caldavCalendars({ ...client, baseUrl: found.baseUrl }, found.calendarHome);
    if (cals.length === 0) return { error: "Apple accepted the sign-in but returned no calendars. Make sure iCloud Calendar is turned on for this Apple ID." };
    const available: CalendarChoice[] = cals.map((c) => ({ id: c.href, name: c.name, readOnly: c.readOnly }));
    const prior = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider: "APPLE_CALENDAR" } } });
    const priorSettings = readCalendarSettings(prior ?? { settings: null });
    const keep = priorSettings.selected.filter((h) => available.some((c) => c.id === h));
    const firstWritable = available.find((c) => !c.readOnly) ?? available[0];
    const selected = keep.length ? keep : [firstWritable.id];
    const settings = { available, selected, bookingCalendar: priorSettings.bookingCalendar && selected.includes(priorSettings.bookingCalendar) ? priorSettings.bookingCalendar : selected[0], cursors: {}, baseUrl: found.baseUrl, principal: found.principal, calendarHome: found.calendarHome };
    const activation = await activateIntegration({
      businessId: ctx.business.id,
      provider: "APPLE_CALENDAR",
      create: { externalAccount: id, externalId: found.principal, accessToken: pw, settings, lastError: null, lastErrorAt: null, wanted: false },
      update: { externalAccount: id, externalId: found.principal, accessToken: pw, settings, lastError: null, lastErrorAt: null, lastSyncStatus: null, syncCursor: null, wanted: false },
    });
    if (!activation.ok) {
      await track("integration_limit_reached", { businessId: ctx.business.id, properties: { provider: "APPLE_CALENDAR", plan: activation.usage.plan } });
      return { error: limitMessage(activation.usage) };
    }
    const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider: "APPLE_CALENDAR" } } });
    if (row) await syncCalendarIn(row);
    await track("integration_connected", { businessId: ctx.business.id, properties: { provider: "APPLE_CALENDAR" } });
    revalidatePath("/dashboard/settings");
    return { calendars: available, selected };
  } catch (err) {
    await reportFailure("oauth", "Apple Calendar connect failed", { businessId: ctx.business.id, provider: "APPLE_CALENDAR", error: err });
    await track("integration_failed", { businessId: ctx.business.id, properties: { provider: "APPLE_CALENDAR", stage: "discover" } });
    const msg = err instanceof Error ? err.message : "";
    if (/rejected the sign-in/i.test(msg)) return { error: "Apple Calendar authentication failed. Make sure you're using an Apple app-specific password, not your normal Apple ID password, and that the Apple ID is right." };
    if (/principal|calendar home/i.test(msg)) return { error: "Authentication succeeded but calendar discovery failed. Check that iCloud Calendar is enabled for this Apple ID, then try again." };
    return { error: "Couldn't reach iCloud just now. Nothing was saved — try again in a minute." };
  }
}

/** Disconnect for every provider: credentials erased, sync stopped, provider grant revoked
 * where the provider offers revocation (Google). Tenant-scoped: only this business's row. */
export async function disconnectIntegration(provider: IntegrationProvider, session?: SessionPayload | null): Promise<{ error?: string }> {
  const ctx = await requireRole([...ADMIN], session);
  if (!ctx) throw new Error("unauthorized");
  if (provider === "EMAIL" || provider === "GOOGLE_CALENDAR" || provider === "GOOGLE_DRIVE") {
    await disconnectGoogle(provider, session);
    return {};
  }
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider } } });
  if (!row) return { error: "Nothing to disconnect." };
  // Providers with a revocation endpoint are told first, while the credential still works.
  // Best effort, like Meta below: a provider that refuses never blocks the local disconnect.
  const warn = (err: unknown) => reportFailure("oauth", `${provider} revoke failed on disconnect`, { businessId: ctx.business.id, provider, error: err, level: "warn" });
  if (provider === "SLACK" && row.accessToken) await revokeSlackToken(row.accessToken).catch(warn);
  if (provider === "DROPBOX" && row.accessToken) await revokeDropboxToken(row.accessToken).catch(warn);
  if (provider === "STRIPE" && row.externalId) await deauthorizeStripeAccount(row.externalId).catch(warn);
  if (provider === "CALENDLY" && row.refreshToken) {
    const hook = ((row.settings ?? {}) as CalendlySettings).webhookUri;
    if (hook) await calendlyToken(row).then((t) => deleteCalendlyWebhook(t, hook)).catch(warn);
    await revokeCalendlyToken(row.refreshToken).catch(warn);
  }
  // Tell Meta to stop delivering first, while the credential still works. Best effort: a
  // provider that refuses must never leave the user unable to disconnect locally, and the
  // webhook ignores events for a row that is no longer connected either way.
  if ((provider === "INSTAGRAM" || provider === "WHATSAPP") && row.accessToken) {
    await revokeMetaSubscription(provider, row).catch((err) =>
      reportFailure("oauth", `${provider} webhook unsubscribe failed on disconnect`, { businessId: ctx.business.id, provider, error: err, level: "warn" })
    );
  }
  await prisma.externalEvent.deleteMany({ where: { integrationId: row.id } });
  await prisma.integration.update({ where: { id: row.id }, data: { status: "NOT_CONNECTED", accessToken: null, refreshToken: null, tokenExpiresAt: null, externalAccount: null, externalId: null, scopes: null, syncCursor: null, settings: undefined, lastSyncStatus: null, lastError: null, lastErrorAt: null } });
  if (provider === "APPLE_CALENDAR" || provider === "MICROSOFT_CALENDAR") await prisma.booking.updateMany({ where: { businessId: ctx.business.id, externalCalendarProvider: provider }, data: { externalEventId: null, externalCalendarProvider: null } });
  await recordAudit({ businessId: ctx.business.id, actorId: ctx.session.userId, action: "integration.disconnected", targetType: "integration", targetId: row.id, metadata: { provider } });
  await track("integration_disconnected", { businessId: ctx.business.id, properties: { provider } });
  revalidatePath("/dashboard/settings");
  return {};
}

export async function retrySync(provider: IntegrationProvider, session?: SessionPayload | null): Promise<{ ok: boolean; error?: string }> {
  if (provider === "GOOGLE_CALENDAR" || provider === "APPLE_CALENDAR" || provider === "MICROSOFT_CALENDAR") return syncCalendarNow(provider, session);
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], session);
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (provider === "MICROSOFT_OUTLOOK") { const r = await syncOutlookForBusiness(ctx.business.id); revalidatePath("/dashboard/settings"); return r.ok ? { ok: true } : { ok: false, error: r.error }; }
  if (provider === "CALENDLY") { const r = await syncCalendlyForBusiness(ctx.business.id); revalidatePath("/dashboard/settings"); return r.ok ? { ok: true } : { ok: false, error: r.error }; }
  if (provider === "SLACK") { const ok = await postToSlack(ctx.business.id, { kind: "integration", title: "Daythread check", body: "Slack notices are working again." }); revalidatePath("/dashboard/settings"); return ok ? { ok: true } : { ok: false, error: "Slack still refused the message." }; }
  return { ok: false, error: "This integration syncs by webhook; nothing to retry." };
}

/** SMS: a dedicated number for this business, bought from Daythread's Twilio account. */
export async function searchSmsNumbers(areaCode?: string, session?: SessionPayload | null): Promise<{ numbers: Array<{ phoneNumber: string; friendlyName: string; locality: string | null; region: string | null }>; error?: string }> {
  const ctx = await requireRole([...ADMIN], session);
  if (!ctx) return { numbers: [], error: "unauthorized" };
  if (!twilioConfigured()) return { numbers: [], error: "Text messaging isn't available on this deployment yet." };
  if (!smsEntitled(ctx.business)) return { numbers: [], error: "A text number is part of the Pro plan and above." };
  try {
    return { numbers: await searchNumbers(areaCode?.replace(/\D/g, "").slice(0, 3) || undefined) };
  } catch (err) {
    await reportFailure("oauth", "Twilio number search failed", { businessId: ctx.business.id, provider: "SMS", error: err });
    return { numbers: [], error: "Couldn't search for numbers just now." };
  }
}

export async function claimSmsNumber(phoneNumber: string, session?: SessionPayload | null): Promise<{ error?: string; phoneNumber?: string }> {
  const ctx = await requireRole([...ADMIN], session);
  if (!ctx) throw new Error("unauthorized");
  if (!twilioConfigured()) return { error: "Text messaging isn't available on this deployment yet." };
  if (!smsEntitled(ctx.business)) return { error: "A text number is part of the Pro plan and above." };
  if (ctx.business.twilioPhoneNumber) return { error: "This business already has a number." };
  if (!/^\+\d{8,15}$/.test(phoneNumber)) return { error: "Choose a number from the list." };
  const slot = await canActivate(ctx.business.id, "SMS");
  if (!slot.ok) {
    await track("integration_limit_reached", { businessId: ctx.business.id, properties: { provider: "SMS", plan: slot.usage.plan, stage: "start" } });
    return { error: limitMessage(slot.usage) };
  }
  try {
    const bought = await provisionNumber(phoneNumber, ctx.business.name);
    const activation = await activateIntegration({
      businessId: ctx.business.id,
      provider: "SMS",
      create: { externalAccount: bought.phoneNumber, externalId: bought.sid, lastSyncedAt: new Date(), lastSyncStatus: "ok", wanted: false },
      update: { externalAccount: bought.phoneNumber, externalId: bought.sid, lastSyncedAt: new Date(), lastSyncStatus: "ok", lastError: null, lastErrorAt: null, wanted: false },
    });
    if (!activation.ok) {
      // Lost the race with another connection: give the number back, keep nothing.
      await releaseNumber(bought.sid).catch((err) => reportFailure("oauth", "Twilio release after quota refusal failed", { businessId: ctx.business.id, provider: "SMS", error: err, level: "warn" }));
      await track("integration_limit_reached", { businessId: ctx.business.id, properties: { provider: "SMS", plan: activation.usage.plan } });
      return { error: limitMessage(activation.usage) };
    }
    await prisma.business.update({ where: { id: ctx.business.id }, data: { twilioPhoneNumber: bought.phoneNumber } });
    await track("integration_connected", { businessId: ctx.business.id, properties: { provider: "SMS" } });
    revalidatePath("/dashboard/settings");
    return { phoneNumber: bought.phoneNumber };
  } catch (err) {
    await reportFailure("oauth", "Twilio number purchase failed", { businessId: ctx.business.id, provider: "SMS", error: err });
    await track("integration_failed", { businessId: ctx.business.id, properties: { provider: "SMS", stage: "provision" } });
    return { error: "Couldn't get that number. It may have just been taken — search again." };
  }
}

export async function releaseSmsNumber(session?: SessionPayload | null): Promise<{ error?: string }> {
  const ctx = await requireRole([...ADMIN], session);
  if (!ctx) throw new Error("unauthorized");
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider: "SMS" } } });
  if (row?.externalId && twilioConfigured()) await releaseNumber(row.externalId);
  await prisma.business.update({ where: { id: ctx.business.id }, data: { twilioPhoneNumber: null } });
  if (row) await prisma.integration.update({ where: { id: row.id }, data: { status: "NOT_CONNECTED", externalAccount: null, externalId: null, lastSyncStatus: null } });
  await track("integration_disconnected", { businessId: ctx.business.id, properties: { provider: "SMS" } });
  revalidatePath("/dashboard/settings");
  return {};
}

/**
 * Stops Meta sending this account's events to Daythread. Instagram unsubscribes the
 * connected account; WhatsApp unsubscribes the WABA the phone number belongs to.
 * Meta offers no token-revocation endpoint for Instagram Login, so the stored credential is
 * erased here and the user can also remove Daythread from their Instagram settings — the
 * disconnect UI says so rather than implying a revocation that did not happen.
 */
async function revokeMetaSubscription(provider: IntegrationProvider, row: { accessToken: string | null; externalId: string | null; settings: unknown }): Promise<void> {
  if (!row.accessToken) return;
  if (provider === "INSTAGRAM" && row.externalId) {
    await unsubscribeInstagramWebhooks(row.accessToken, row.externalId);
    return;
  }
  if (provider === "WHATSAPP") {
    const wabaId = (row.settings as { wabaId?: string } | null)?.wabaId;
    if (wabaId) await unsubscribeWabaWebhooks(row.accessToken, wabaId);
  }
}

/**
 * Switch the connected WhatsApp number. The id arrives from the browser, so it is only
 * accepted after Meta itself confirms — through the token's granular scopes and the WABA's
 * own phone list — that this workspace's token owns it. A number connected to another
 * workspace is refused.
 */
export async function selectWhatsAppNumber(phoneNumberId: string, session?: SessionPayload | null): Promise<{ error?: string; displayPhoneNumber?: string }> {
  const ctx = await requireRole([...ADMIN], session);
  if (!ctx) throw new Error("unauthorized");
  if (!/^\d{5,25}$/.test(phoneNumberId)) return { error: "That isn't a WhatsApp phone number id." };
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider: "WHATSAPP" } } });
  if (!row || row.status === "NOT_CONNECTED" || !row.accessToken) return { error: "WhatsApp isn't connected." };
  const settings = (row.settings ?? {}) as { wabaId?: string; availableNumbers?: Array<{ id: string; wabaId: string }> };
  const candidate = settings.availableNumbers?.find((n) => n.id === phoneNumberId);
  if (!candidate) return { error: "That number isn't one of the numbers Meta granted this workspace. Reconnect WhatsApp to refresh the list." };
  try {
    // Re-check with Meta rather than trusting what we stored earlier: access can be removed.
    if (!(await tokenOwnsWaba(row.accessToken, candidate.wabaId))) return { error: "Meta no longer grants this workspace access to that WhatsApp Business Account. Reconnect WhatsApp." };
    const phones = await listPhoneNumbers(row.accessToken, candidate.wabaId);
    const phone = phones.find((p) => p.id === phoneNumberId);
    if (!phone) return { error: "Meta no longer lists that number on this WhatsApp Business Account." };
    const elsewhere = await prisma.integration.findFirst({ where: { provider: "WHATSAPP", externalId: phone.id, businessId: { not: ctx.business.id }, status: { in: ["CONNECTED", "SYNC_ERROR", "NEEDS_ATTENTION"] } } });
    if (elsewhere) return { error: "That number is already connected to another Daythread workspace." };
    await prisma.integration.update({
      where: { id: row.id },
      data: {
        externalId: phone.id,
        externalAccount: `${phone.verified_name} · ${phone.display_phone_number}`,
        settings: { ...settings, wabaId: candidate.wabaId, phoneNumberId: phone.id, displayPhoneNumber: phone.display_phone_number, verifiedName: phone.verified_name, qualityRating: phone.quality_rating ?? null, codeVerificationStatus: phone.code_verification_status ?? null },
        lastError: null,
        lastErrorAt: null,
      },
    });
    await track("integration_connected", { businessId: ctx.business.id, properties: { provider: "WHATSAPP", change: "number" } });
    revalidatePath("/dashboard/settings");
    return { displayPhoneNumber: phone.display_phone_number };
  } catch (err) {
    await reportFailure("oauth", "WhatsApp number switch failed", { businessId: ctx.business.id, provider: "WHATSAPP", error: err });
    return { error: "Meta couldn't confirm that number just now. Nothing was changed — try again." };
  }
}
