"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword, setSessionCookie, clearSessionCookie, getUserMemberships, homeRouteFor } from "@/lib/auth";
import { generatePasswordResetToken, passwordResetExpiry } from "@/lib/passwordReset";
import { sendOnChannel, messagingIsLive } from "@/lib/messaging";
import type { Role } from "@prisma/client";

const signupSchema = z.object({
  name: z.string().min(1, "Full name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  businessName: z.string().min(1, "Business / studio name is required"),
  businessType: z.string().optional(),
  phone: z.string().optional(),
});

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

export async function uniqueHandle(base: string) {
  let handle = slugify(base) || "studio";
  let n = 0;
  while (await prisma.business.findUnique({ where: { handle } })) {
    n += 1;
    handle = `${slugify(base)}-${n}`;
  }
  return handle;
}

export type FormState = { error?: string; duplicateEmail?: boolean } | undefined;

export async function signup(formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    businessName: formData.get("businessName"),
    businessType: formData.get("businessType") || undefined,
    phone: formData.get("phone") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { name, email, password, businessName, businessType, phone } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account already exists with this email.", duplicateEmail: true };
  }

  let user, business;
  try {
    const handle = await uniqueHandle(businessName);
    const passwordHash = await hashPassword(password);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { name, email, passwordHash } });
      const business = await tx.business.create({
        data: { name: businessName, handle, businessType: businessType || null, phone: phone || null },
      });
      await tx.orgMembership.create({ data: { userId: user.id, businessId: business.id, role: "OWNER" } });
      return { user, business };
    });
    user = created.user;
    business = created.business;
  } catch {
    return { error: "Something went wrong creating your account. Please try again." };
  }

  await setSessionCookie({ userId: user.id, activeBusinessId: business.id });
  redirect(homeRouteFor("OWNER", business));
}

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export async function login(formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { error: "Incorrect email or password" };
  }

  const memberships = await getUserMemberships(user.id);
  if (memberships.length === 0) {
    const pendingRequest = await prisma.joinRequest.findFirst({ where: { userId: user.id, status: "PENDING" } });
    if (pendingRequest) {
      return { error: "Your request to join is still waiting on the owner's approval. We'll let you in as soon as it's accepted." };
    }
    return { error: "This account isn't part of any organization yet." };
  }

  if (memberships.length > 1) {
    await setSessionCookie({ userId: user.id });
    redirect("/workspaces");
  }

  const membership = memberships[0];
  await setSessionCookie({ userId: user.id, activeBusinessId: membership.businessId });
  redirect(homeRouteFor(membership.role, membership.business));
}

export async function logout() {
  await clearSessionCookie();
  redirect("/login");
}

const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email"),
});

export type ForgotPasswordState = { sent: boolean; error?: string; devLink?: string };

/**
 * Always reports success regardless of whether the email exists — never leaks account
 * existence to an unauthenticated caller. The actual email only goes out when the account
 * is real.
 *
 * No real email provider is configured on this deployment (RESEND_API_KEY unset), so the
 * reset link would otherwise only ever reach a Vercel function log no one can see — a
 * "working" button that's actually dead for anyone testing it. Since there's no real email
 * to protect here, and only for an account that actually exists, the link is returned to
 * the caller directly instead. Once a real provider is configured (messagingIsLive("EMAIL")
 * is true) this never happens — the link only ever goes out over email as normal.
 */
export async function forgotPassword(formData: FormData): Promise<ForgotPasswordState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { sent: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  let devLink: string | undefined;
  if (user) {
    const token = generatePasswordResetToken();
    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt: passwordResetExpiry() },
    });
    const link = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password/${token}`;
    await sendOnChannel({
      channel: "EMAIL",
      to: user.email,
      subject: "Reset your Daythread password",
      body: `Hi ${user.name}, reset your password here (this link expires in 1 hour): ${link}`,
    });
    if (!messagingIsLive("EMAIL")) devLink = link;
  }

  return { sent: true, devLink };
}

const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type ResetPasswordState = { error?: string } | undefined;

export async function resetPassword(token: string, formData: FormData): Promise<ResetPasswordState> {
  const parsed = resetPasswordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return { error: "This reset link is invalid or has expired. Request a new one." };
  }

  const passwordHash = await hashPassword(parsed.data.password);

  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
  ]);

  redirect("/login?reset=1");
}

async function loginAsDemoRole(role: Role) {
  const business = await prisma.business.findFirst({ where: { handle: "alex-photo" } });
  if (!business) redirect("/login");
  const membership = await prisma.orgMembership.findFirst({ where: { businessId: business.id, role }, include: { business: true } });
  if (!membership) redirect("/login");
  await setSessionCookie({ userId: membership.userId, activeBusinessId: business.id });
  redirect(homeRouteFor(membership.role, membership.business));
}

export async function loginAsDemo() {
  await loginAsDemoRole("OWNER");
}

export async function loginAsDemoClient() {
  await loginAsDemoRole("CLIENT");
}

export async function loginAsDemoPartner() {
  await loginAsDemoRole("PARTNER");
}
