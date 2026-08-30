"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRole, hashPassword, verifyPassword, setSessionCookie, homeRouteFor } from "@/lib/auth";
import { generateInvitationToken, invitationExpiry } from "@/lib/invitations";
import { revalidatePath } from "next/cache";
import { sendOnChannel } from "@/lib/messaging";

const inviteSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().optional(),
});

export async function inviteClient(formData: FormData): Promise<{ error?: string; link?: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (!ctx) return { error: "unauthorized" };
  const { business, session } = ctx;

  const parsed = inviteSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { name, email, phone } = parsed.data;

  const client =
    (await prisma.client.findFirst({ where: { businessId: business.id, email } })) ??
    (await prisma.client.create({ data: { businessId: business.id, name, email, phone } }));

  await prisma.invitation.updateMany({
    where: { businessId: business.id, clientId: client.id, status: "PENDING" },
    data: { status: "REVOKED" },
  });

  const invitation = await prisma.invitation.create({
    data: {
      businessId: business.id,
      email,
      role: "CLIENT",
      token: generateInvitationToken(),
      clientId: client.id,
      invitedByUserId: session.userId,
      expiresAt: invitationExpiry(),
    },
  });

  await prisma.auditLog.create({
    data: { businessId: business.id, actorId: session.userId, action: "invitation.created", targetType: "client", targetId: client.id },
  });

  const link = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invitation.token}`;
  await sendOnChannel({
    channel: "EMAIL",
    to: email,
    subject: `You're invited to ${business.name}`,
    body: `Hi ${name}, you've been invited to join ${business.name}. Accept your invitation: ${link}`,
  });

  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/team");
  return { link };
}

const partnerInviteSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
});

export async function invitePartner(formData: FormData): Promise<{ error?: string; link?: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) return { error: "unauthorized" };
  const { business, session } = ctx;

  const parsed = partnerInviteSchema.safeParse({ name: formData.get("name"), email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { name, email } = parsed.data;

  await prisma.invitation.updateMany({
    where: { businessId: business.id, email, role: "PARTNER", status: "PENDING" },
    data: { status: "REVOKED" },
  });

  const invitation = await prisma.invitation.create({
    data: {
      businessId: business.id,
      email,
      role: "PARTNER",
      token: generateInvitationToken(),
      invitedByUserId: session.userId,
      expiresAt: invitationExpiry(),
    },
  });

  await prisma.auditLog.create({
    data: { businessId: business.id, actorId: session.userId, action: "invitation.created", targetType: "partner", targetId: invitation.id },
  });

  const link = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invitation.token}`;
  await sendOnChannel({
    channel: "EMAIL",
    to: email,
    subject: `${business.name} invited you to join their team`,
    body: `Hi ${name}, ${business.name} invited you to join their team as a partner. Accept your invitation: ${link}`,
  });

  revalidatePath("/dashboard/team");
  return { link };
}

export async function revokeInvitation(id: string) {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) throw new Error("unauthorized");
  await prisma.invitation.updateMany({
    where: { id, businessId: ctx.business.id, status: "PENDING" },
    data: { status: "REVOKED" },
  });
  revalidatePath("/dashboard/team");
}

export async function resendInvitation(id: string): Promise<{ link?: string; error?: string }> {
  const ctx = await requireRole(["OWNER", "ADMIN"]);
  if (!ctx) return { error: "unauthorized" };
  const invitation = await prisma.invitation.findFirst({ where: { id, businessId: ctx.business.id } });
  if (!invitation) return { error: "not found" };

  const updated = await prisma.invitation.update({
    where: { id },
    data: { expiresAt: invitationExpiry(), status: "PENDING" },
  });

  const link = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${updated.token}`;
  await sendOnChannel({ channel: "EMAIL", to: updated.email, subject: `Reminder: join ${ctx.business.name}`, body: `Accept your invitation: ${link}` });

  revalidatePath("/dashboard/team");
  return { link };
}

// ── Public acceptance flow ──────────────────────────────────────────────────

export type InvitationPreview = {
  businessName: string;
  role: string;
  email: string;
  existingAccount: boolean;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED" | "INVALID";
};

export async function previewInvitation(token: string): Promise<InvitationPreview | null> {
  const invitation = await prisma.invitation.findUnique({ where: { token }, include: { business: true } });
  if (!invitation) return null;

  let status = invitation.status;
  if (status === "PENDING" && invitation.expiresAt < new Date()) {
    await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
    status = "EXPIRED";
  }

  const existingAccount = Boolean(await prisma.user.findUnique({ where: { email: invitation.email }, select: { id: true } }));

  return { businessName: invitation.business.name, role: invitation.role, email: invitation.email, existingAccount, status };
}

const acceptNewSchema = z.object({
  name: z.string().min(1, "Name is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
const acceptExistingSchema = z.object({ password: z.string().min(1, "Password is required") });

export async function acceptInvitation(token: string, formData: FormData): Promise<{ error?: string } | undefined> {
  const invitation = await prisma.invitation.findUnique({ where: { token } });
  if (!invitation) return { error: "This invitation link is invalid." };
  if (invitation.status === "REVOKED") return { error: "This invitation has been revoked." };
  if (invitation.status === "ACCEPTED") return { error: "This invitation has already been used." };
  if (invitation.status === "EXPIRED" || invitation.expiresAt < new Date()) return { error: "This invitation has expired." };

  const existingUser = await prisma.user.findUnique({ where: { email: invitation.email } });

  let userId: string;

  if (existingUser) {
    const parsed = acceptExistingSchema.safeParse({ password: formData.get("password") });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    if (!(await verifyPassword(parsed.data.password, existingUser.passwordHash))) {
      return { error: "Incorrect password." };
    }
    userId = existingUser.id;

    const existingMembership = await prisma.orgMembership.findUnique({
      where: { userId_businessId: { userId, businessId: invitation.businessId } },
    });
    if (existingMembership) return { error: "You're already a member of this organization." };
  } else {
    const parsed = acceptNewSchema.safeParse({ name: formData.get("name"), password: formData.get("password") });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const passwordHash = await hashPassword(parsed.data.password);
    const user = await prisma.user.create({ data: { name: parsed.data.name, email: invitation.email, passwordHash } });
    userId = user.id;
  }

  await prisma.$transaction(async (tx) => {
    await tx.orgMembership.create({ data: { userId, businessId: invitation.businessId, role: invitation.role } });
    await tx.invitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
    if (invitation.role === "CLIENT" && invitation.clientId) {
      await tx.client.update({ where: { id: invitation.clientId }, data: { userId } });
    }
    await tx.auditLog.create({
      data: { businessId: invitation.businessId, actorId: userId, action: "invitation.accepted", targetType: "invitation", targetId: invitation.id },
    });
  });

  await setSessionCookie({ userId, activeBusinessId: invitation.businessId });
  const business = await prisma.business.findUniqueOrThrow({ where: { id: invitation.businessId } });
  redirect(homeRouteFor(invitation.role, business));
}
