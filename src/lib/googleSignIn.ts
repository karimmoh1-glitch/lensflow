import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { hashPassword, setSessionCookie, getUserMemberships, homeRouteFor } from "@/lib/auth";
import { exchangeCodeForTokens, revokeGoogleToken } from "@/lib/google";
import { personalWorkspaceName, uniqueHandle } from "@/app/actions/auth";
import { track } from "@/lib/analytics";
import { withLock } from "@/lib/dbLock";
import { cookies } from "next/headers";
import { parseAnswers, savePersonalization } from "@/server/personalization";
import { planSchema } from "@/lib/personalization";

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
    const start = await readStartCookie();
    await track(user.created ? "signup_completed" : "login_completed", { businessId: memberships[0]?.businessId ?? null, anonymousId: start?.anonymousId ?? undefined, properties: { method: "google", personalized: Boolean(start?.answers) } });
    if (user.created && memberships[0]) await track("workspace_created", { businessId: memberships[0].businessId, properties: { method: "google" } });
    // Answers from /start apply to a brand-new workspace, or to the one workspace this
    // person owns if it was never personalized — never to someone else's.
    if (start?.answers && memberships.length === 1 && memberships[0].role === "OWNER") {
      const b = memberships[0].businessId;
      const had = user.created ? null : await prisma.onboardingProfile.findUnique({ where: { businessId: b }, select: { id: true } });
      if (!had) await savePersonalization(b, start.answers, { selectedPlan: start.selectedPlan, anonymousId: start.anonymousId, source: "google" }).catch((err) => console.error("[personalization] save failed", err));
    }
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

async function readStartCookie(): Promise<{ answers: ReturnType<typeof parseAnswers>; selectedPlan: "FREE" | "PRO" | "BUSINESS" | null; anonymousId: string | null } | null> {
  try {
    const jar = await cookies();
    const raw = jar.get("dt_start")?.value;
    jar.delete({ name: "dt_start", path: "/api/auth/google" });
    if (!raw) return null;
    const obj = JSON.parse(raw) as { answers?: unknown; selectedPlan?: unknown; anonymousId?: unknown };
    const plan = planSchema.safeParse(obj.selectedPlan);
    const anon = typeof obj.anonymousId === "string" && /^[a-z0-9]{8,40}$/i.test(obj.anonymousId) ? obj.anonymousId : null;
    return { answers: parseAnswers(obj.answers), selectedPlan: plan.success ? plan.data : null, anonymousId: anon };
  } catch {
    return null;
  }
}
