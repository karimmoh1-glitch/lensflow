import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyGoogleState, exchangeCodeForTokens, getGoogleUserEmail } from "@/lib/google";

/**
 * Where Google redirects back to after the owner approves (or denies) access on the
 * real consent screen. Exchanges the one-time code for real tokens and stores them on
 * that business's EMAIL integration — this is the only place Integration.status ever
 * becomes CONNECTED for email via Gmail, and it only happens after a genuine OAuth
 * round trip, never as a UI toggle.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const settingsUrl = new URL("/dashboard/settings", url.origin);
  settingsUrl.searchParams.set("tab", "connections");

  if (error) {
    settingsUrl.searchParams.set("google_error", error === "access_denied" ? "denied" : "error");
    return NextResponse.redirect(settingsUrl);
  }
  if (!code || !state) {
    settingsUrl.searchParams.set("google_error", "error");
    return NextResponse.redirect(settingsUrl);
  }

  const verified = await verifyGoogleState(state);
  if (!verified) {
    settingsUrl.searchParams.set("google_error", "expired");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const email = await getGoogleUserEmail(tokens.access_token);

    if (!tokens.refresh_token) {
      // Google only issues a refresh token on first consent (or when prompt=consent
      // forces re-approval) — without one there's no way to stay connected past the
      // first access token's ~1hr lifetime, so this is a real failure, not a nitpick.
      settingsUrl.searchParams.set("google_error", "no_refresh_token");
      return NextResponse.redirect(settingsUrl);
    }

    await prisma.integration.upsert({
      where: { businessId_provider: { businessId: verified.businessId, provider: "EMAIL" } },
      create: {
        businessId: verified.businessId,
        provider: "EMAIL",
        status: "CONNECTED",
        externalAccount: email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        lastSyncedAt: new Date(),
      },
      update: {
        status: "CONNECTED",
        externalAccount: email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });

    settingsUrl.searchParams.set("google_connected", "1");
    return NextResponse.redirect(settingsUrl);
  } catch (err) {
    console.error("[google-oauth-callback] failed", err);
    settingsUrl.searchParams.set("google_error", "error");
    return NextResponse.redirect(settingsUrl);
  }
}
