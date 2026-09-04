"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { googleOAuthConfigured, signGoogleState, getGoogleAuthUrl, getValidAccessToken, listRecentGmailMessages } from "@/lib/google";
import { ingestInboundMessage } from "@/server/leadIngestion";

/** Kicks off the real Google consent screen — never a fake "Connected" toggle. Only
 * reachable when GOOGLE_CLIENT_ID/SECRET are actually configured on this deployment. */
export async function connectGoogle() {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) throw new Error("unauthorized");
  if (!googleOAuthConfigured()) throw new Error("Google sign-in isn't configured on this deployment.");

  const state = await signGoogleState(ctx.business.id);
  const url = await getGoogleAuthUrl(state);
  redirect(url);
}

export async function disconnectGoogle() {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) throw new Error("unauthorized");

  await prisma.integration.updateMany({
    where: { businessId: ctx.business.id, provider: "EMAIL" },
    data: { status: "NOT_CONNECTED", accessToken: null, refreshToken: null, tokenExpiresAt: null, externalAccount: null },
  });
  revalidatePath("/dashboard/settings");
}

export type SyncGmailResult = { ok: true; found: number; ingested: number } | { ok: false; error: string };

/** The real, on-demand equivalent of a webhook for a channel (Gmail) that doesn't push
 * to us — pulls recent inbox messages right now and routes each new one through the
 * same ingestion pipeline every other channel uses. Not a simulation: this is a live
 * Gmail API call against the connected account. */
export async function syncGmailNow(): Promise<SyncGmailResult> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) return { ok: false, error: "unauthorized" };

  const integration = await prisma.integration.findUnique({
    where: { businessId_provider: { businessId: ctx.business.id, provider: "EMAIL" } },
  });
  if (!integration?.refreshToken) return { ok: false, error: "Gmail isn't connected for this business." };

  try {
    const accessToken = await getValidAccessToken(integration);
    // First sync pulls deeper so the first minute shows the real shape of the inbox
    // ("184 conversations · 127 automated · 7 need you"); later syncs only need the top.
    const messages = await listRecentGmailMessages(accessToken, integration.lastSyncedAt ? 15 : 60);

    let ingested = 0;
    for (const m of messages) {
      const result = await ingestInboundMessage({
        businessId: ctx.business.id,
        channel: "EMAIL",
        senderName: m.fromName || m.from.split("@")[0],
        senderHandle: m.from,
        body: m.body,
        subject: m.subject,
        clientEmail: m.from,
        providerMessageId: m.messageIdHeader || m.id,
        headers: m.headers,
        rawBody: m.rawBody,
      });
      if (!result.duplicate) ingested += 1;
    }

    await prisma.integration.update({ where: { id: integration.id }, data: { lastSyncedAt: new Date() } });
    revalidatePath("/dashboard/inbox");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/settings");
    return { ok: true, found: messages.length, ingested };
  } catch (err) {
    console.error("[gmail-sync] failed", err);
    return { ok: false, error: err instanceof Error ? err.message : "Gmail sync failed" };
  }
}
