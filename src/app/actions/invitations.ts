"use server";

import { assertIds } from "@/lib/ids";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRole, hashPassword, verifyPassword, setSessionCookie, homeRouteFor, type SessionPayload } from "@/lib/auth";
import { withLock } from "@/lib/dbLock";
import { generateInvitationToken, invitationExpiry } from "@/lib/invitations";
import { revalidatePath } from "next/cache";
import { sendTransactional, messagingIsLive, type TransactionalDelivery } from "@/lib/messaging";
import { addressProven } from "@/lib/founder";
import { invitationEmail, linkTo } from "@/lib/emails";
import { canAddTeamSeat, planLimits, teamEntitled } from "@/lib/billing";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { sharedRateLimit, accountPasswordBucket } from "@/lib/sharedRateLimit";

/** Invitation emails a workspace may send in a day: well above real use, far below a spam run. */
const inviteQuota = (businessId: string) => sharedRateLimit(`invites:${businessId}`, { limit: 50, windowMs: 24 * 60 * 60 * 1000 });
const QUOTA_ERROR = "That's a lot of invitations today. Try again tomorrow, or write to support@daythread.org.";
/**
 * Invitations go out under Daythread's own sending domain, in the workspace's name. That
 * is only offered to someone who has proven their address: otherwise any signup could put
 * any name on mail from Daythread. The gate applies wherever email is live enough for a
 * verification link to have arrived.
 */
const VERIFY_FIRST = "Confirm your email address first — the link is in your inbox — and invitations will send.";
const mustVerify = (user: { emailVerifiedAt?: Date | null; createdAt?: Date | null }) => messagingIsLive("EMAIL") && !addressProven(user);

const inviteSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  phone: z.string().max(32).optional(),
});

export async function inviteClient(formData: FormData, actingSession?: SessionPayload | null): Promise<{ error?: string; link?: string; delivery?: TransactionalDelivery }> {
  const ctx = await requireRole(["OWNER", "ADMIN", "PHOTOGRAPHER"], actingSession);
  if (!ctx) return { error: "unauthorized" };
  if (mustVerify(ctx.user)) return { error: VERIFY_FIRST };
  const { business, session } = ctx;

  const parsed = inviteSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { name, email, phone } = parsed.data;
  if (!(await inviteQuota(business.id)).ok) return { error: QUOTA_ERROR };

  // Look up the person, retire any outstanding invitation, and issue the new one as one
  // step. Two clicks used to race here: both found no client, both created one, and the
  // business ended up with the same customer twice and two live invitation links. The
  // workspace row is the lock, which is the same way a booking holds its slot.
  const { client, invitation } = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Business" WHERE "id" = ${business.id} FOR UPDATE`;
    const person =
      (await tx.client.findFirst({ where: { businessId: business.id, email } })) ??
      (await tx.client.create({ data: { businessId: business.id, name, email, phone } }));
    await tx.invitation.updateMany({
      where: { businessId: business.id, clientId: person.id, status: "PENDING" },
      data: { status: "REVOKED" },
    });
    const created = await tx.invitation.create({
      data: {
        businessId: business.id,
        email,
        role: "CLIENT",
        token: generateInvitationToken(),
        clientId: person.id,
        invitedByUserId: session.userId,
        expiresAt: invitationExpiry(),
      },
    });
    return { client: person, invitation: created };
  });

  await prisma.auditLog.create({
    data: { businessId: business.id, actorId: session.userId, action: "invitation.created", targetType: "client", targetId: client.id },
  });

  const link = linkTo(`/invite/${invitation.token}`);
  const mail = invitationEmail({ businessName: business.name, recipientName: name, token: invitation.token, role: "client" });
  const delivery = await sendTransactional({ channel: "EMAIL", to: email, fromName: business.name, subject: mail.subject, body: mail.text, html: mail.html });

  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/team");
  return { link, delivery };
}

const partnerInviteSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
});

export async function invitePartner(formData: FormData, actingSession?: SessionPayload | null): Promise<{ error?: string; link?: string; delivery?: TransactionalDelivery }> {
  const ctx = await requireRole(["OWNER", "ADMIN"], actingSession);
  if (!ctx) return { error: "unauthorized" };
  if (mustVerify(ctx.user)) return { error: VERIFY_FIRST };
  const { business, session } = ctx;
  if (!teamEntitled(business)) return { error: "Partners and teammates are part of Daythread Pro. Upgrade under Settings → Subscription." };

  const parsed = partnerInviteSchema.safeParse({ name: formData.get("name"), email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { name, email } = parsed.data;
  if (!(await inviteQuota(business.id)).ok) return { error: QUOTA_ERROR };

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

    const link = linkTo(`/invite/${invitation.token}`);
    const mail = invitationEmail({ businessName: business.name, recipientName: name, token: invitation.token, role: "partner" });
    const delivery = await sendTransactional({ channel: "EMAIL", to: email, fromName: business.name, subject: mail.subject, body: mail.text, html: mail.html });

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
  if (mustVerify(ctx.user)) return { error: VERIFY_FIRST };
  const { business, session } = ctx;
  if (!teamEntitled(business)) return { error: "Teammates are part of Daythread Pro. Upgrade under Settings → Subscription." };

  const parsed = partnerInviteSchema.safeParse({ name: formData.get("name"), email: String(formData.get("email") ?? "").trim().toLowerCase() });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { name, email } = parsed.data;
  if (!(await inviteQuota(business.id)).ok) return { error: QUOTA_ERROR };

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

    const link = linkTo(`/invite/${invitation.token}`);
    const mail = invitationEmail({ businessName: business.name, recipientName: name, token: invitation.token, role: "teammate" });
    const delivery = await sendTransactional({ channel: "EMAIL", to: email, fromName: business.name, subject: mail.subject, body: mail.text, html: mail.html });

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/team");
    return { link, delivery };
  });
}

export async function revokeInvitation(id: string, actingSession?: SessionPayload | null): Promise<{ error?: string }> {
  assertIds(id);
  const ctx = await requireRole(["OWNER", "ADMIN"], actingSession);
  if (!ctx) throw new Error("unauthorized");
  // updateMany is the tenant guard: an id from another workspace simply matches nothing.
  // It also matches nothing when the invitation was already accepted or revoked, and the
  // caller has to be told the difference from a revocation that actually happened.
  const { count } = await prisma.invitation.updateMany({
    where: { id, businessId: ctx.business.id, status: "PENDING" },
    data: { status: "REVOKED" },
  });
  revalidatePath("/dashboard/team");
  if (count === 0) return { error: "That invitation is no longer pending in this workspace." };
  return {};
}

export async function resendInvitation(id: string, actingSession?: SessionPayload | null): Promise<{ link?: string; error?: string; delivery?: TransactionalDelivery }> {
  assertIds(id);
  const ctx = await requireRole(["OWNER", "ADMIN"], actingSession);
  if (!ctx) return { error: "unauthorized" };
  if (mustVerify(ctx.user)) return { error: VERIFY_FIRST };
  // Only an invitation that is still outstanding may be resent. Reviving an ACCEPTED or
  // REVOKED one brought its original token back to life, so any copy of that old link —
  // forwarded, archived, sitting in a support ticket — would grant membership again.
  const invitation = await prisma.invitation.findFirst({ where: { id, businessId: ctx.business.id, status: { in: ["PENDING", "EXPIRED"] } } });
  if (!invitation) return { error: "That invitation can no longer be resent. Send a new one instead." };
  if (!(await inviteQuota(ctx.business.id)).ok) return { error: QUOTA_ERROR };

  // A fresh token as well: resending replaces the old link rather than extending it.
  const updated = await prisma.invitation.update({
    where: { id },
    data: { token: generateInvitationToken(), expiresAt: invitationExpiry(), status: "PENDING" },
  });

  const link = linkTo(`/invite/${updated.token}`);
  const mail = invitationEmail({ businessName: ctx.business.name, recipientName: updated.email.split("@")[0], token: updated.token, role: updated.role === "CLIENT" ? "client" : updated.role === "PARTNER" ? "partner" : "teammate", reminder: true });
  const delivery = await sendTransactional({ channel: "EMAIL", to: updated.email, fromName: ctx.business.name, subject: mail.subject, body: mail.text, html: mail.html });

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

  const existingAccount = Boolean(await prisma.user.findUnique({ where: { email: invitation.email.toLowerCase() }, select: { id: true } }));

  return { businessName: invitation.business.name, role: invitation.role, email: invitation.email, existingAccount, status };
}

const acceptNewSchema = z.object({
  name: z.string().min(1, "Name is required"),
  password: z.string().min(8, "Password must be at least 8 characters").refine((p) => Buffer.byteLength(p, "utf8") <= 72, "Use a password of 72 characters or fewer."),
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

  // Addresses are stored lower-case; an invitation written before that is matched the same way,
  // so accepting it can never mint a second, differently-cased account for one person.
  const inviteEmail = invitation.email.trim().toLowerCase();
  const existingUser = await prisma.user.findUnique({ where: { email: inviteEmail } });

  let userId: string;

  if (existingUser) {
    const parsed = acceptExistingSchema.safeParse({ password: formData.get("password") });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
    // The same per-account guess budget as login, so invitations can't be minted to guess a password.
    if (!(await accountPasswordBucket(inviteEmail)).ok) return { error: "Too many attempts. Wait a few minutes and try again." };
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
    // The link was sent to this address and they hold it: the address is proven.
    const user = await prisma.user.create({ data: { name: parsed.data.name, email: inviteEmail, passwordHash, emailVerifiedAt: new Date() } });
    userId = user.id;
  }

  // The seat is counted and taken under the same lock invitations are sent under, so two
  // invitees accepting at once cannot both pass the check.
  const seated = await withLock(`seats:${invitation.businessId}`, async () => {
    if (invitation.role !== "CLIENT") {
      // The plan may have changed since the invitation was sent: re-check the seat at accept time.
      const business = await prisma.business.findUnique({ where: { id: invitation.businessId } });
      const seats = await prisma.orgMembership.count({ where: { businessId: invitation.businessId, role: { not: "CLIENT" }, status: "ACTIVE" } });
      if (!business || !teamEntitled(business) || !canAddTeamSeat(business, seats)) return false;
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
    return true;
  });
  if (!seated) return { error: "This workspace has no free team seat right now. Ask the owner to upgrade their plan, then try the link again." };

  await setSessionCookie({ userId, activeBusinessId: invitation.businessId });
  const business = await prisma.business.findUniqueOrThrow({ where: { id: invitation.businessId } });
  redirect(homeRouteFor(invitation.role, business));
}
