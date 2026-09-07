import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { hashPassword, setSessionCookie, getUserMemberships, homeRouteFor } from "@/lib/auth";
import { exchangeCodeForTokens, revokeGoogleToken } from "@/lib/google";
import { personalWorkspaceName, uniqueHandle } from "@/app/actions/auth";
import { track } from "@/lib/analytics";
import { withLock } from "@/lib/dbLock";

/**
 * "Continue with Google" — sign in or sign up with a Google account, on the same OAuth
 * client Daythread already uses for Gmail and Calendar, with only identity scopes.
 *
 * Linking is by verified email and nothing else: Google has proven the person controls
 * that address, which is the same proof a password reset relies on. An address Google has
 * not verified is refused. A new address gets exactly what the signup form gives — a user,
 * their own workspace, an OWNER membership — with an unusable random password (they can set
 * one later with "forgot password"). Two sign-ins racing for the same new address are
 * serialized, so they can never create two accounts.
 */
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

import type { GoogleSignInFailure } from "./googleSignInMessages";
export type { GoogleSignInFailure };

export async function completeGoogleSignIn(code: string): Promise<{ ok: true; redirectTo: string } | { ok: false; reason: GoogleSignInFailure }> {
  let accessToken: string | null = null;
  try {
    const tokens = await exchangeCodeForTokens(code);
    accessToken = tokens.access_token;
    const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return { ok: false, reason: "provider" };
    const info = (await res.json()) as { email?: string; email_verified?: boolean; name?: string };
    const email = info.email?.trim().toLowerCase();
    if (!email) return { ok: false, reason: "no_email" };
    if (!info.email_verified) return { ok: false, reason: "unverified" };
    const name = (info.name ?? "").trim() || email.split("@")[0];

    const user = await withLock(`google-signin:${email}`, async () => {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return { row: existing, created: false };
      const workspaceName = await personalWorkspaceName(name);
      const handle = await uniqueHandle(name);
      const passwordHash = await hashPassword(randomBytes(32).toString("hex"));
      const row = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({ data: { name: name.slice(0, 80), email, passwordHash } });
        const business = await tx.business.create({ data: { name: workspaceName, handle } });
        await tx.orgMembership.create({ data: { userId: created.id, businessId: business.id, role: "OWNER" } });
        return created;
      });
      return { row, created: true };
    });

    const memberships = await getUserMemberships(user.row.id);
    await track(user.created ? "signup_completed" : "login_completed", { businessId: memberships[0]?.businessId ?? null, properties: { method: "google" } });
    if (memberships.length === 0) return { ok: false, reason: "provider" };
    if (memberships.length > 1) {
      await setSessionCookie({ userId: user.row.id });
      return { ok: true, redirectTo: "/workspaces" };
    }
    const m = memberships[0];
    await setSessionCookie({ userId: user.row.id, activeBusinessId: m.businessId });
    return { ok: true, redirectTo: homeRouteFor(m.role, m.business) };
  } catch {
    return { ok: false, reason: "provider" };
  } finally {
    // Identity only: nothing is kept, so the grant is released right away.
    if (accessToken) await revokeGoogleToken(accessToken).catch(() => {});
  }
}
