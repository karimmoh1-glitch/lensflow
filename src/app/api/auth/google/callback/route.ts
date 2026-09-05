import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { exchangeCodeForTokens, getGoogleUserEmail, revokeGoogleToken } from "@/lib/google";
import { verifyOAuthState } from "@/lib/integrations/oauthState";
import { tokenCryptoConfigured } from "@/lib/tokenCrypto";
import { reportFailure } from "@/lib/observe";
import { track } from "@/lib/analytics";
import { syncCalendarIn } from "@/server/calendarSync";
import { listCalendars } from "@/lib/googleCalendar";

/**
 * Where Google sends the owner back after the consent screen, for both Gmail and Google
 * Calendar (the state carries which). Nothing here trusts the query string alone: the
 * state must verify (signed, unexpired, single-use, bound to this browser's nonce), the
 * signed-in session must belong to the business the flow was started for, and the
 * provider account is recorded so later events can be matched to it. This is the only
 * place an EMAIL / GOOGLE_CALENDAR row becomes CONNECTED.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const back = new URL("/dashboard/settings", url.origin);
  back.searchParams.set("tab", "connections");
  const fail = (reason: string, provider = "google") => {
    back.searchParams.set("connect_error", reason);
    back.searchParams.set("provider", provider);
    return NextResponse.redirect(back);
  };

  if (error) return fail(error === "access_denied" ? "denied" : "provider");
  const verified = await verifyOAuthState("google", state);
  if (!verified.ok) return fail(verified.reason === "expired" ? "expired" : "state");
  if (!code) return fail("provider");
  const purpose = verified.state.purpose === "calendar" ? "calendar" : "gmail";
  const providerKey = purpose === "calendar" ? "GOOGLE_CALENDAR" : "EMAIL";

  // Tenant binding: the browser finishing this flow must be signed in to the business that started it.
  const session = await getSession();
  if (!session || session.userId !== verified.state.userId) return fail("session", providerKey);
  const membership = await prisma.orgMembership.findFirst({ where: { userId: session.userId, businessId: verified.state.businessId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN"] } } });
  if (!membership) return fail("tenant", providerKey);
  if (process.env.NODE_ENV === "production" && !tokenCryptoConfigured()) {
    await reportFailure("oauth", "Refused to store Google tokens: INTEGRATION_TOKEN_ENCRYPTION_KEY missing", { businessId: verified.state.businessId, provider: providerKey });
    return fail("encryption", providerKey);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const email = await getGoogleUserEmail(tokens.access_token);
    if (!tokens.refresh_token) {
      await revokeGoogleToken(tokens.access_token);
      return fail("no_refresh_token", providerKey);
    }
    const granted = tokens.scope ?? "";
    const needed = purpose === "calendar" ? /calendar/ : /gmail/;
    if (!needed.test(granted)) {
      await revokeGoogleToken(tokens.access_token);
      return fail("scopes", providerKey);
    }

    // Reconnect replaces stale credentials; the old grant is told to go away.
    const existing = await prisma.integration.findUnique({ where: { businessId_provider: { businessId: verified.state.businessId, provider: providerKey } } });
    if (existing?.refreshToken && existing.refreshToken !== tokens.refresh_token) await revokeGoogleToken(existing.refreshToken);

    const base = { status: "CONNECTED" as const, externalAccount: email, externalId: email, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000), scopes: granted, lastError: null, lastErrorAt: null, lastSyncStatus: null, syncCursor: null, wanted: false };
    const row = await prisma.integration.upsert({
      where: { businessId_provider: { businessId: verified.state.businessId, provider: providerKey } },
      create: { businessId: verified.state.businessId, provider: providerKey, ...base, lastSyncedAt: purpose === "gmail" ? new Date() : null },
      update: base,
    });

    if (purpose === "calendar") {
      // Pick the primary calendar by default and pull busy time right away.
      const calendars = await listCalendars(tokens.access_token).catch(() => []);
      const primary = calendars.find((c) => c.primary) ?? calendars[0];
      await prisma.integration.update({ where: { id: row.id }, data: { settings: { calendarId: primary?.id ?? "primary", calendarName: primary?.summary ?? "Primary", timeZone: primary?.timeZone ?? null } } });
      const fresh = await prisma.integration.findUnique({ where: { id: row.id } });
      if (fresh) await syncCalendarIn(fresh);
    }

    await track("integration_connected", { businessId: verified.state.businessId, properties: { provider: providerKey } });
    back.searchParams.set("connected", providerKey);
    return NextResponse.redirect(back);
  } catch (err) {
    await reportFailure("oauth", `Google ${purpose} connect failed`, { businessId: verified.state.businessId, provider: providerKey, error: err });
    await track("integration_failed", { businessId: verified.state.businessId, properties: { provider: providerKey, stage: "callback" } });
    return fail("provider", providerKey);
  }
}
