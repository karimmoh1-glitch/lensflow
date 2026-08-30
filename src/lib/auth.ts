import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import type { Business, Role } from "@prisma/client";

const SESSION_COOKIE = "lf_session";
const secret = () => new TextEncoder().encode(process.env.JWT_SECRET || "dev-only-insecure-secret");

export type SessionPayload = {
  userId: string;
  /** Which organization this session is currently "in." Always re-verified server-side
   * against real OrgMembership rows — never trusted on its own. */
  activeBusinessId?: string;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = await createSessionToken(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.userId !== "string") return null;
    return {
      userId: payload.userId,
      activeBusinessId: typeof payload.activeBusinessId === "string" ? payload.activeBusinessId : undefined,
    };
  } catch {
    return null;
  }
}

/** Switches the session's active organization — only after verifying the user actually
 * belongs to it. Used by login and the workspace switcher. */
export async function setActiveBusiness(businessId: string) {
  const session = await getSession();
  if (!session) throw new Error("unauthorized");
  const membership = await prisma.orgMembership.findUnique({
    where: { userId_businessId: { userId: session.userId, businessId } },
  });
  if (!membership) throw new Error("not a member of this organization");
  await setSessionCookie({ userId: session.userId, activeBusinessId: businessId });
}

export async function getUserMemberships(userId: string) {
  return prisma.orgMembership.findMany({
    where: { userId, status: "ACTIVE" },
    include: { business: true, user: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Resolves the current request's authenticated user + active organization + role.
 * Returns null if: not logged in, has no memberships, or belongs to multiple
 * organizations with none currently active (caller should send them to /workspaces).
 * Every server action / route handler that touches tenant data must go through this —
 * never trust a businessId or role passed from the client.
 */
export async function requireBusiness() {
  const session = await getSession();
  if (!session) return null;

  const memberships = await getUserMemberships(session.userId);
  if (memberships.length === 0) return null;

  let active = session.activeBusinessId ? memberships.find((m) => m.businessId === session.activeBusinessId) : undefined;

  if (!active) {
    if (memberships.length === 1) {
      active = memberships[0];
      await setSessionCookie({ userId: session.userId, activeBusinessId: active.businessId });
    } else {
      return null;
    }
  }

  return {
    session: { userId: session.userId, businessId: active.businessId },
    business: active.business,
    membership: active,
    role: active.role,
    user: active.user,
  };
}

export type BusinessContext = NonNullable<Awaited<ReturnType<typeof requireBusiness>>>;

/** Where a role lands after auth — the single source of truth for role-based routing. */
export function homeRouteFor(role: Role, business: Pick<Business, "onboardingComplete">): string {
  if (role === "CLIENT") return "/portal";
  if (role === "PARTNER") return "/partner";
  return business.onboardingComplete ? "/dashboard" : "/onboarding";
}

/** Like requireBusiness(), but additionally enforces the caller's role is in the allowed
 * set. Use for anything an OWNER/ADMIN can do but a PHOTOGRAPHER/PARTNER/CLIENT cannot
 * (team management, invitations, org settings, danger-zone actions). */
export async function requireRole(allowedRoles: Role[]): Promise<BusinessContext | null> {
  const ctx = await requireBusiness();
  if (!ctx) return null;
  if (!allowedRoles.includes(ctx.role)) return null;
  return ctx;
}
