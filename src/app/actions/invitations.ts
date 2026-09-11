"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRole, hashPassword, verifyPassword, setSessionCookie, homeRouteFor, type SessionPayload } from "@/lib/auth";
import { withLock } from "@/lib/dbLock";
import { generateInvitationToken, invitationExpiry } from "@/lib/invitations";
import { revalidatePath } from "next/cache";
import { sendTransactional, type TransactionalDelivery } from "@/lib/messaging";
import { canAddTeamSeat, planLimits, teamEntitled } from "@/lib/billing";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

const inviteSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().optional(),
});

export async function inviteClient(formData: FormData, actingSession?: SessionPayload | null): Promise<{ error?: string; link?: string; delivery?: TransactionalDelivery }> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], actingSession);
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
  const delivery = await sendTransactional({
    channel: "EMAIL",
    to: email,
    subject: `You're invited to ${business.name}`,
    body: `Hi ${name}, you've been invited to join ${business.name}. Accept your invitation: ${link}`,
  });

  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/team");
  return { link, delivery };
}

const partnerInviteSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
});

export async function invitePartner(formData: FormData, actingSession?: SessionPayload | null): Promise<{ error?: string; link?: string; delivery?: TransactionalDelivery }> {
  const ctx = await requireRole(["OWNER", "ADMIN"], actingSession);
  if (!ctx) return { error: "unauthorized" };
  const { business, session } = ctx;
  if (!teamEntitled(business)) return { error: "Partners and teammates are part of Daythread Pro. Upgrade under Settings → Subscription." };

  const parsed = partnerInviteSchema.safeParse({ name: formData.get("name"), email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { name, email } = parsed.data;

// Seats are counted and taken under one lock per workspace, so a burst of invitations
  // can't all pass the check before any of them is recorded.
  return withLock(`seats:${business.id}`, async () => {
    // A seat is anyone on the team side of the org (staff + partners) — clients don't count.
    // Pending invitations count too, so a burst of invites can't be accepted past the cap.
    const [activeSeats, pendingPartnerInvites] = await Promise.all([
      prisma.orgMembership.count({ where: { businessId: business.id, role: { not: "CLIENT" }, status: "ACTIVE" } }),
      prisma.invitation.count({ where: { businessId: business.id, role: "PARTNER", status: "PENDING" } }),
    ]);
    if (!canAddTeamSeat(business, activeSeats + pendingPartnerInvites)) {
      const limit = planLimits(business).maxTeamSeats;
      return { error: `Your plan includes ${limit} team member${limit === 1 ? "" : "s"}. Upgrade in Billing to invite more people.` };
    }

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
    const delivery = await sendTransactional({
      channel: "EMAIL",
      to: email,
      subject: `${business.name} invited you to join their team`,
      body: `Hi ${name}, ${business.name} invited you to join their team as a partner. Accept your invitation: ${link}`,
    });

    revalidatePath("/dashboard/team");
    return { link, delivery };
  });
}

/**
 * Invite someone to share this inbox as a teammate. Pro and Business, and the seat allowance
 * is enforced here and again at accept time: pending invitations count, so a burst of
 * invites can't be accepted past the plan's limit.
 */
export async function inviteTeammate(formData: FormData, actingSession?: SessionPayload | null): Promise<{ error?: string; link?: string; delivery?: TransactionalDelivery }> {
  const ctx = await requireRole(["OWNER", "ADMIN"], actingSession);
  if (!ctx) return { error: "unauthorized" };
  const { business, session } = ctx;
  if (!teamEntitled(business)) return { error: "Teammates are part of Daythread Pro. Upgrade under Settings → Subscription." };

  const parsed = partnerInviteSchema.safeParse({ name: formData.get("name"), email: String(formData.get("email") ?? "").trim().toLowerCase() });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { name, email } = parsed.data;

// Seats are counted and taken under one lock per workspace, so a burst of invitations
  // can't all pass the check before any of them is recorded.
  return withLock(`seats:${business.id}`, async () => {
    const already = await prisma.orgMembership.findFirst({ where: { businessId: business.id, user: { email }, status: "ACTIVE" }, select: { id: true } });
    if (already) return { error: "They're already on this workspace." };

    const [activeSeats, pendingInvites] = await Promise.all([
      prisma.orgMembership.count({ where: { businessId: business.id, role: { not: "CLIENT" }, status: "ACTIVE" } }),
      prisma.invitation.count({ where: { businessId: business.id, role: { not: "CLIENT" }, status: "PENDING", email: { not: email } } }),
    ]);
    if (!canAddTeamSeat(business, activeSeats + pendingInvites)) {
      const limit = planLimits(business).maxTeamSeats;
      return { error: `Your plan includes ${limit} team member${limit === 1 ? "" : "s"}. Deactivate someone or revoke an invitation to free a seat.` };
    }

    await prisma.invitation.updateMany({ where: { businessId: business.id, email, status: "PENDING" }, data: { status: "REVOKED" } });
    const invitation = await prisma.invitation.create({
      data: { businessId: business.id, email, role: "PHOTOGRAPHER", token: generateInvitationToken(), invitedByUserId: session.userId, expiresAt: invitationExpiry() },
    });
    await prisma.auditLog.create({ data: { businessId: business.id, actorId: session.userId, action: "invitation.created", targetType: "teammate", targetId: invitation.id } });

    const link = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invitation.token}`;
    const delivery = await sendTransactional({ channel: "EMAIL", to: email, subject: `${business.name} invited you to their Daythread inbox`, body: `Hi ${name}, ${business.name} invited you to share their inbox on Daythread. Accept your invitation: ${link}` });

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/team");
    return { link, delivery };
  });
}

export async function revokeInvitation(id: string, actingSession?: SessionPayload | null) {
  const ctx = await requireRole(["OWNER", "ADMIN"], actingSession);
  if (!ctx) throw new Error("unauthorized");
  await prisma.invitation.updateMany({
    where: { id, businessId: ctx.business.id, status: "PENDING" },
    data: { status: "REVOKED" },
  });
  revalidatePath("/dashboard/team");
}

export async function resendInvitation(id: string, actingSession?: SessionPayload | null): Promise<{ link?: string; error?: string; delivery?: TransactionalDelivery }> {
  const ctx = await requireRole(["OWNER", "ADMIN"], actingSession);
  if (!ctx) return { error: "unauthorized" };
  // Only an invitation that is still outstanding may be resent. Reviving an ACCEPTED or
  // REVOKED one brought its original token back to life, so any copy of that old link —
  // forwarded, archived, sitting in a support ticket — would grant membership again.
  const invitation = await prisma.invitation.findFirst({ where: { id, businessId: ctx.business.id, status: { in: ["PENDING", "EXPIRED"] } } });
  if (!invitation) return { error: "That invitation can no longer be resent. Send a new one instead." };

  // A fresh token as well: resending replaces the old link rather than extending it.
  const updated = await prisma.invitation.update({
    where: { id },
    data: { token: generateInvitationToken(), expiresAt: invitationExpiry(), status: "PENDING" },
  });

  const link = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${updated.token}`;
  const delivery = await sendTransactional({ channel: "EMAIL", to: updated.email, subject: `Reminder: join ${ctx.business.name}`, body: `Accept your invitation: ${link}` });

  revalidatePath("/dashboard/team");
  return { link, delivery };
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
  // Whether an account already exists is the one fact this returns that is worth harvesting,
  // so it is throttled the way every other unauthenticated lookup is.
  if (!rateLimit(`invite-preview:${await getClientIp()}`, { limit: 30, windowMs: 10 * 60 * 1000 }).ok) return null;
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
  // This path verifies a password, so it is a login and has to be rate limited like one.
  // Without it, anyone who can mint an invitation — and any signed-up owner can mint one for
  // any address — could guess that person's password without limit and take a session as
  // them. Two buckets, matching login: per-IP against one attacker trying many accounts,
  // per-token against one account attacked from rotating addresses.
  const ip = await getClientIp();
  const ipOk = rateLimit(`invite-accept:ip:${ip}`, { limit: 20, windowMs: 10 * 60 * 1000 }).ok;
  const tokenOk = rateLimit(`invite-accept:token:${token}`, { limit: 8, windowMs: 10 * 60 * 1000 }).ok;
  if (!ipOk || !tokenOk) return { error: "Too many attempts. Wait a few minutes and try again." };

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

  if (invitation.role !== "CLIENT") {
    // The plan may have changed since the invitation was sent: re-check the seat at accept time.
    const business = await prisma.business.findUnique({ where: { id: invitation.businessId } });
    const seats = await prisma.orgMembership.count({ where: { businessId: invitation.businessId, role: { not: "CLIENT" }, status: "ACTIVE" } });
    if (!business || !teamEntitled(business) || !canAddTeamSeat(business, seats)) {
      return { error: "This workspace has no free team seat right now. Ask the owner to upgrade their plan, then try the link again." };
    }
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
