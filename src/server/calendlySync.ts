import { prisma } from "@/lib/db";
import { reportFailure } from "@/lib/observe";
import { calendlyToken, listCalendlyEvents, listCalendlyInvitees, rawToEvent, type CalendlyEvent, type CalendlyInvitee, type CalendlyWebhookPayload } from "@/lib/calendly";
import { findKnownClient } from "@/server/identity";
import { pushBookingToCalendars } from "@/server/calendarSync";
import { fireAutomationEvent } from "@/server/automationRunner";
import { notifyBusiness } from "@/server/notify";
import { recordAudit } from "@/server/audit";
import { OAuthError } from "@/lib/integrations/oauth";
import type { Integration } from "@prisma/client";

/**
 * Calendly → Daythread bookings. A scheduled event with an active invitee becomes a
 * CONFIRMED booking for that person (matched by email, then phone, else created); a
 * cancelled one cancels the booking. The Calendly event uri is the booking's source id,
 * so the webhook, the on-open check and the daily run can all apply the same event and
 * the result is one booking. Nothing is ever written back to Calendly.
 */
export type CalendlySettings = { userUri?: string; organization?: string; schedulingUrl?: string; name?: string; webhooks?: "active" | "unavailable" | "error"; webhookUri?: string | null; webhookDetail?: string | null; importedAt?: string | null };

export type CalendlyImport = { ok: true; found: number; created: number; updated: number; canceled: number } | { ok: false; error: string; skipped?: boolean };

const LOOKBACK_DAYS = 30;
const LOOKAHEAD_DAYS = 365;

export async function syncCalendlyForBusiness(businessId: string): Promise<CalendlyImport> {
  const integration = await prisma.integration.findUnique({ where: { businessId_provider: { businessId, provider: "CALENDLY" } } });
  if (!integration?.refreshToken || integration.status === "NOT_CONNECTED") return { ok: false, error: "Calendly isn't connected for this business.", skipped: true };
  const settings = (integration.settings ?? {}) as CalendlySettings;
  if (!settings.userUri) return { ok: false, error: "Calendly connection is incomplete — reconnect." };
  try {
    const token = await calendlyToken(integration);
    const events = await listCalendlyEvents(token, settings.userUri, { minStart: new Date(Date.now() - LOOKBACK_DAYS * 86_400_000), maxStart: new Date(Date.now() + LOOKAHEAD_DAYS * 86_400_000) });
    const out = { found: events.length, created: 0, updated: 0, canceled: 0 };
    for (const event of events) {
      const invitees = await listCalendlyInvitees(token, event.uri).catch(() => [] as CalendlyInvitee[]);
      const r = await applyCalendlyEvent(integration, event, invitees);
      if (r === "created") out.created++;
      else if (r === "updated") out.updated++;
      else if (r === "canceled") out.canceled++;
    }
    await prisma.integration.update({ where: { id: integration.id }, data: { lastSyncedAt: new Date(), lastSyncStatus: "ok", lastError: null, lastErrorAt: null, status: "CONNECTED", settings: { ...settings, importedAt: new Date().toISOString() } } });
    return { ok: true, ...out };
  } catch (err) {
    const revoked = err instanceof OAuthError ? err.revoked : false;
    await prisma.integration.update({ where: { id: integration.id }, data: { lastSyncStatus: "failed", lastError: revoked ? "Calendly revoked access — reconnect" : "Couldn't reach Calendly", lastErrorAt: new Date(), status: revoked ? "NEEDS_ATTENTION" : "SYNC_ERROR" } });
    await reportFailure("sync", "Calendly import failed", { businessId, provider: "CALENDLY", error: err });
    return { ok: false, error: revoked ? "Calendly revoked Daythread's access. Reconnect from Settings." : "Couldn't reach Calendly just now. Try again in a minute." };
  }
}

/** The service a Calendly event books: an existing one with the same name, else a hidden one named after it. */
async function serviceFor(businessId: string, event: CalendlyEvent): Promise<{ id: string; priceCents: number }> {
  const name = event.name.trim().slice(0, 80) || "Calendly meeting";
  const existing = await prisma.service.findFirst({ where: { businessId, name: { equals: name, mode: "insensitive" } }, select: { id: true, priceCents: true } });
  if (existing) return existing;
  const durationMins = Math.max(15, Math.round((new Date(event.endTime).getTime() - new Date(event.startTime).getTime()) / 60_000));
  return prisma.service.create({ data: { businessId, name, priceCents: 0, durationMins, active: false, description: "Created from Calendly. Hidden from your booking page until you switch it on." }, select: { id: true, priceCents: true } });
}

export type ApplyResult = "created" | "updated" | "canceled" | "skipped";

export async function applyCalendlyEvent(integration: Integration, event: CalendlyEvent, invitees: CalendlyInvitee[]): Promise<ApplyResult> {
  const businessId = integration.businessId;
  const invitee = invitees.find((i) => i.status === "active") ?? invitees[0] ?? null;
  const existing = await prisma.booking.findUnique({ where: { businessId_sourceProvider_sourceEventId: { businessId, sourceProvider: "CALENDLY", sourceEventId: event.uri } } });
  const canceled = event.status === "canceled" || (invitee?.status === "canceled" && !invitees.some((i) => i.status === "active"));

  if (canceled) {
    if (!existing || existing.status === "CANCELED") return "skipped";
    await prisma.booking.update({ where: { id: existing.id }, data: { status: "CANCELED" } });
    await pushBookingToCalendars(existing.id).catch(() => {});
    await recordAudit({ businessId, action: "booking.canceled", targetType: "booking", targetId: existing.id, metadata: { source: "CALENDLY" } });
    return "canceled";
  }
  if (!invitee) return "skipped";

  const startAt = new Date(event.startTime);
  const endAt = new Date(event.endTime);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return "skipped";

  if (existing) {
    const changed = existing.startAt.getTime() !== startAt.getTime() || existing.endAt.getTime() !== endAt.getTime() || (existing.location ?? null) !== (event.location ?? null) || existing.status === "CANCELED";
    if (!changed) return "skipped";
    await prisma.booking.update({ where: { id: existing.id }, data: { startAt, endAt, location: event.location ?? null, ...(existing.status === "CANCELED" ? { status: "CONFIRMED", confirmedAt: new Date() } : {}) } });
    await pushBookingToCalendars(existing.id).catch(() => {});
    return "updated";
  }

  const known = await findKnownClient({ businessId, channel: "WEBSITE", senderHandle: invitee.email, senderName: invitee.name, email: invitee.email, phone: invitee.phone });
  const client = known.client
    ? await prisma.client.update({ where: { id: known.client.id }, data: { relationship: "CUSTOMER", ...(known.client.phone || !known.phone ? {} : { phone: known.phone }) } })
    : await prisma.client.create({ data: { businessId, name: invitee.name || invitee.email, email: known.email ?? invitee.email, phone: known.phone, relationship: "CUSTOMER" } });
  const service = await serviceFor(businessId, event);
  const booking = await prisma.booking.create({
    data: { businessId, clientId: client.id, serviceId: service.id, startAt, endAt, location: event.location ?? null, status: "CONFIRMED", confirmedAt: new Date(), totalCents: service.priceCents, sourceProvider: "CALENDLY", sourceEventId: event.uri },
  });
  await recordAudit({ businessId, action: "booking.imported", targetType: "booking", targetId: booking.id, metadata: { source: "CALENDLY" } });
  await pushBookingToCalendars(booking.id).catch(() => {});
  await fireAutomationEvent({ businessId, trigger: "BOOKING_CREATED", targetType: "booking", targetId: booking.id }).catch(() => {});
  await notifyBusiness(businessId, { kind: "booking", title: "New booking from Calendly", body: `${client.name} · ${startAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`, target: { kind: "booking", id: booking.id } });
  return "created";
}

/** A verified Calendly webhook, routed to the connection whose user created it. */
export async function processCalendlyWebhook(payload: CalendlyWebhookPayload, integration: Integration): Promise<ApplyResult> {
  const p = payload.payload;
  if (!p?.scheduled_event?.uri) return "skipped";
  const event = rawToEvent(p.scheduled_event);
  const invitee: CalendlyInvitee | null = p.email ? { uri: p.uri ?? "", name: p.name ?? p.email, email: p.email, status: payload.event === "invitee.canceled" ? "canceled" : (p.status ?? "active"), timezone: p.timezone ?? null, phone: p.text_reminder_number ?? null, answers: p.questions_and_answers ?? [] } : null;
  const result = await applyCalendlyEvent(integration, payload.event === "invitee.canceled" ? { ...event, status: "canceled" } : event, invitee ? [invitee] : []);
  await prisma.integration.update({ where: { id: integration.id }, data: { lastWebhookAt: new Date() } });
  return result;
}

/** Every connected Calendly, inside a time budget (cron). */
export async function syncAllCalendly(opts: { budgetMs?: number; limit?: number } = {}): Promise<{ workspaces: number; created: number; failures: number }> {
  const started = Date.now();
  const out = { workspaces: 0, created: 0, failures: 0 };
  const rows = await prisma.integration.findMany({ where: { provider: "CALENDLY", status: { in: ["CONNECTED", "SYNC_ERROR"] } }, orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } }, take: opts.limit ?? 50, select: { businessId: true } });
  for (const row of rows) {
    if (Date.now() - started > (opts.budgetMs ?? 15_000)) break;
    out.workspaces++;
    const r = await syncCalendlyForBusiness(row.businessId);
    if (r.ok) out.created += r.created;
    else if (!r.skipped) out.failures++;
  }
  return out;
}
