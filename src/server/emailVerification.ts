import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { generatePasswordResetToken } from "@/lib/passwordReset";
import { messagingIsLive, sendOnChannel } from "@/lib/messaging";
import { verifyEmailTemplate, linkTo } from "@/lib/emails";
import { sharedRateLimit } from "@/lib/sharedRateLimit";
import { track } from "@/lib/analytics";

/**
 * Proving an address is theirs. The same one-time-link machinery as a password reset —
 * 192 random bits, only the hash at rest, one use, an expiry, every sibling burned on
 * success — kept apart from resets by a purpose column and a purpose prefix in the hash,
 * so a reset link can never verify an address and a verification link can never reset a
 * password. Nothing here is logged beyond a count.
 *
 * What a proven address unlocks is decided elsewhere (`addressProven` in lib/founder.ts):
 * sending Daythread's own email to third parties, founder and complimentary access.
 * Signing in, reading your own inbox and connecting your own accounts never wait on it.
 */
export const EMAIL_VERIFICATION_PURPOSE = "EMAIL_VERIFICATION";
export const EMAIL_VERIFICATION_TTL_HOURS = 24;

export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(`verify:${token}`).digest("base64url");
}

export type IssueResult = { status: "sent" | "not_live" | "throttled" | "already_verified"; devLink?: string };

/**
 * Mints a fresh link for this address and sends it when email is live. Throttled per
 * address across every instance; earlier unused links stop working the moment a new one
 * is issued. Never throws: a signup must not fail because a verification email could not.
 */
export async function issueEmailVerification(user: { id: string; email: string; name: string; emailVerifiedAt?: Date | null }): Promise<IssueResult> {
  if (user.emailVerifiedAt) return { status: "already_verified" };
  if (!(await sharedRateLimit(`verify-email:${user.email.trim().toLowerCase()}`, { limit: 5, windowMs: 60 * 60 * 1000 })).ok) return { status: "throttled" };
  const token = generatePasswordResetToken();
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, purpose: EMAIL_VERIFICATION_PURPOSE, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.create({ data: { userId: user.id, purpose: EMAIL_VERIFICATION_PURPOSE, token: hashVerificationToken(token), expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000) } }),
  ]);
  const link = linkTo(`/verify-email/${token}`);
  if (!messagingIsLive("EMAIL")) {
    // Nowhere to send it. In development the link is handed back so the flow can be walked;
    // in production the address simply stays unproven until email is configured.
    return { status: "not_live", devLink: process.env.NODE_ENV === "production" ? undefined : link };
  }
  const mail = verifyEmailTemplate({ name: user.name, token });
  await sendOnChannel({ channel: "EMAIL", to: user.email, subject: mail.subject, body: mail.text, html: mail.html }).catch(() => null);
  return { status: "sent" };
}

/**
 * Redeems a link. One outcome for every failure — unknown, used, expired, wrong purpose —
 * so the page can only ever say "this link no longer works". The session is not touched:
 * the person following the link is already the right one.
 */
export async function consumeEmailVerification(token: unknown): Promise<{ ok: true; userId: string } | { ok: false }> {
  if (typeof token !== "string" || token.length < 16 || token.length > 200) return { ok: false };
  const row = await prisma.passwordResetToken.findUnique({ where: { token: hashVerificationToken(token) } });
  if (!row || row.purpose !== EMAIL_VERIFICATION_PURPOSE || row.usedAt || row.expiresAt < new Date()) return { ok: false };
  const now = new Date();
  await prisma.$transaction([
    // The first proof stands; a later link never moves the date.
    prisma.user.updateMany({ where: { id: row.userId, emailVerifiedAt: null }, data: { emailVerifiedAt: now } }),
    prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: now } }),
    prisma.passwordResetToken.updateMany({ where: { userId: row.userId, purpose: EMAIL_VERIFICATION_PURPOSE, usedAt: null, id: { not: row.id } }, data: { usedAt: now } }),
  ]);
  const membership = await prisma.orgMembership.findFirst({ where: { userId: row.userId }, select: { businessId: true }, orderBy: { createdAt: "asc" } });
  await track("email_verified", { businessId: membership?.businessId });
  return { ok: true, userId: row.userId };
}
