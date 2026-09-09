"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole, type SessionPayload } from "@/lib/auth";
import { googleOAuthConfigured, getGoogleAuthUrl, getValidAccessToken, listRecentGmailMessages, revokeGoogleToken } from "@/lib/google";
import { signOAuthState } from "@/lib/integrations/oauthState";
import { tokenCryptoConfigured } from "@/lib/tokenCrypto";
import { syncGmailForBusiness } from "@/server/gmailSync";
import { reportFailure } from "@/lib/observe";
import { track } from "@/lib/analytics";
import { canActivate } from "@/server/integrationQuota";

/** Kicks off Google's real consent screen for Gmail (default) or Google Calendar. Never a
 * toggle. Only reachable when Daythread's Google OAuth client is configured, and only when
 * tokens can be stored encrypted. */
export async function connectGoogle(purpose: "gmail" | "calendar" = "gmail", session?: SessionPayload | null) {
  const ctx = await requireRole(["OWNER", "ADMIN"], session);
  if (!ctx) throw new Error("unauthorized");
  if (!googleOAuthConfigured()) throw new Error("Google sign-in isn't configured on this deployment.");
  if (process.env.NODE_ENV === "production" && !tokenCryptoConfigured()) throw new Error("Connections are paused until the deployment's encryption key is configured.");
  const provider = purpose === "calendar" ? "GOOGLE_CALENDAR" : "EMAIL";
  // No free slot on the plan: say so now rather than after Google's consent screen. The
  // callback enforces the same limit atomically regardless.
  const slot = await canActivate(ctx.business.id, provider);
  if (!slot.ok) {
    await track("integration_limit_reached", { businessId: ctx.business.id, properties: { provider, plan: slot.usage.plan, stage: "start" } });
    redirect(`/dashboard/settings?tab=connections&connect_error=limit&provider=${provider}`);
  }
  await track("integration_connect_started", { businessId: ctx.business.id, properties: { provider } });
  const state = await signOAuthState({ provider: "google", purpose, businessId: ctx.business.id, userId: ctx.session.userId });
  redirect(await getGoogleAuthUrl(state, purpose));
}

/** Disconnect really stops access: the grant is revoked at Google, the tokens are erased,
 * the mirror events are forgotten, and no sync will run again for this row. */
export async function disconnectGoogle(provider: "EMAIL" | "GOOGLE_CALENDAR" = "EMAIL", session?: SessionPayload | null) {
  const ctx = await requireRole(["OWNER", "ADMIN"], session);
  if (!ctx) throw new Error("unauthorized");
  const row = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider } } });
  if (row?.refreshToken) await revokeGoogleToken(row.refreshToken);
  else if (row?.accessToken) await revokeGoogleToken(row.accessToken);
  if (row) {
    await prisma.externalEvent.deleteMany({ where: { integrationId: row.id } });
    await prisma.integration.update({ where: { id: row.id }, data: { status: "NOT_CONNECTED", accessToken: null, refreshToken: null, tokenExpiresAt: null, externalAccount: null, externalId: null, scopes: null, syncCursor: null, settings: undefined, lastSyncStatus: null, lastError: null, lastErrorAt: null } });
    if (provider === "GOOGLE_CALENDAR") await prisma.booking.updateMany({ where: { businessId: ctx.business.id, externalCalendarProvider: "GOOGLE_CALENDAR" }, data: { externalEventId: null, externalCalendarProvider: null } });
  }
  await track("integration_disconnected", { businessId: ctx.business.id, properties: { provider } });
  revalidatePath("/dashboard/settings");
}

export type SyncGmailResult = { ok: true; found: number; ingested: number } | { ok: false; error: string };

/** The real, on-demand equivalent of a webhook for Gmail: pulls recent inbox messages now
 * and routes each new one through the same ingestion every channel uses. A revoked grant
 * flips the row to NEEDS_ATTENTION instead of failing silently forever. */
/** Manual and on-open pulls closer together than this reuse the last one. */
const MIN_SYNC_GAP_MS = 30_000;

export async function syncGmailNow(): Promise<SyncGmailResult> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) return { ok: false, error: "unauthorized" };
  // Every open tab polls; the record, not the process, decides whether a pull is due, so
  // two tabs (or two serverless instances) can't multiply Gmail API calls.
  const recent = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: ctx.business.id, provider: "EMAIL" } }, select: { lastSyncedAt: true, lastSyncStatus: true } });
  if (recent?.lastSyncedAt && recent.lastSyncStatus === "ok" && Date.now() - recent.lastSyncedAt.getTime() < MIN_SYNC_GAP_MS) return { ok: true, found: 0, ingested: 0 };
  const result = await syncGmailForBusiness(ctx.business.id);
  if (result.ok) {
    revalidatePath("/dashboard/inbox");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/settings");
    return { ok: true, found: result.found, ingested: result.ingested };
  }
  return { ok: false, error: result.error };
}
