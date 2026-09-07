"use server";

import { prisma } from "@/lib/db";
import { requireRole, verifyPassword, hashPassword, setSessionCookie, getSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const ADMIN_ROLES = ["OWNER", "ADMIN"] as const;

const ProfileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80),
  workspaceName: z.string().trim().min(1, "Give the workspace a name.").max(80),
  timezone: z.string().trim().min(1).max(64),
});

/** Your name, the workspace's name, and the timezone message times are shown in. */
export async function updateProfile(input: { name: string; workspaceName: string; timezone: string }): Promise<{ error?: string; ok?: true }> {
  const ctx = await requireRole([...ADMIN_ROLES]);
  if (!ctx) throw new Error("unauthorized");
  const parsed = ProfileSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  try {
    Intl.DateTimeFormat(undefined, { timeZone: parsed.data.timezone });
  } catch {
    return { error: "That timezone isn't recognised." };
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: ctx.session.userId }, data: { name: parsed.data.name } }),
    prisma.business.update({ where: { id: ctx.business.id }, data: { name: parsed.data.workspaceName, timezone: parsed.data.timezone } }),
  ]);
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function deleteWorkspace(confirmName: string): Promise<{ error?: string } | never> {
  const ctx = await requireRole(["OWNER"]);
  if (!ctx) throw new Error("unauthorized");
  const { business } = ctx;
  if (confirmName.trim() !== business.name) return { error: "The name doesn't match." };
  const { revokeGoogleToken } = await import("@/lib/google");
  const { releaseNumber, twilioConfigured } = await import("@/lib/twilio");
  const integrations = await prisma.integration.findMany({ where: { businessId: business.id } });
  for (const i of integrations) {
    if (i.provider === "EMAIL" && i.refreshToken) await revokeGoogleToken(i.refreshToken);
    if (i.provider === "SMS" && i.externalId && twilioConfigured()) await releaseNumber(i.externalId);
  }
  await prisma.business.delete({ where: { id: business.id } });
  const { logout } = await import("@/app/actions/auth");
  await logout();
  return {};
}

// ── Password ────────────────────────────────────────────────────────────────

const PasswordChangeSchema = z.object({
  current: z.string().min(1, "Enter your current password."),
  next: z.string().min(8, "Use at least 8 characters.").max(200),
});

/**
 * Changes the signed-in user's password. Requires the current password (a stolen session
 * alone cannot lock the owner out), invalidates every other session by bumping the session
 * version, and re-issues this one so the person stays signed in.
 */
export async function changePassword(input: { current: string; next: string }): Promise<{ error?: string; ok?: true }> {
  const session = await getSession();
  if (!session) throw new Error("unauthorized");
  const parsed = PasswordChangeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  if (parsed.data.current === parsed.data.next) return { error: "Choose a password you haven't used here." };
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !(await verifyPassword(parsed.data.current, user.passwordHash))) return { error: "That current password isn't right." };
  const updated = await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.next), sessionVersion: { increment: 1 } }, select: { sessionVersion: true } });
  await prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
  await setSessionCookie({ userId: user.id, activeBusinessId: session.activeBusinessId, sv: updated.sessionVersion });
  return { ok: true };
}
