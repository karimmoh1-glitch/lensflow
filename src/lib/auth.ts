import { SignJWT, jwtVerify } from "jose";
import { requiredSecret } from "@/lib/env";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import type { Business, Role } from "@prisma/client";

const SESSION_COOKIE = "lf_session";
const secret = () => new TextEncoder().encode(requiredSecret("JWT_SECRET"));

/** Roles that belong on the general staff dashboard (/dashboard/**). PARTNER and CLIENT
 * have their own dedicated, narrowly-scoped experiences (/partner, /portal) and must
 * never reach the staff views — even by navigating there directly. */
export const STAFF_ROLES: Role[] = ["OWNER", "ADMIN", "PHOTOGRAPHER"];

export type SessionPayload = {
  userId: string;
  /** Which organization this session is currently "in." Always re-verified server-side
   * against real OrgMembership rows — never trusted on its own. */
  activeBusinessId?: string;
  /** The user's session version when this token was issued; see User.sessionVersion. */
  sv?: number;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

/**
 * A valid bcrypt hash of a random string. Every password check that might be for an
 * account that doesn't exist compares against this instead of skipping the compare, so
 * the response time never says whether the address is registered.
 */
export const DUMMY_HASH = "$2a$10$BaCUUcjgNeUlpal/7DIz..VKv4XaiGJTWtiDla40HVzXvfm.tU0Cm";

export async function createSessionToken(payload: SessionPayload) {
  // Stamp the token with the user's current session version so a later password change
  // or account deletion invalidates it — without keeping a server-side session table.
  const sv = payload.sv ?? (await prisma.user.findUnique({ where: { id: payload.userId }, select: { sessionVersion: true } }))?.sessionVersion ?? 0;
  return new SignJWT({ userId: payload.userId, ...(payload.activeBusinessId ? { activeBusinessId: payload.activeBusinessId } : {}), sv, typ: "session" })
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

/** Verifies a raw session token (cookie or bearer) and extracts the payload. Shared by
 * both the web cookie session and the mobile bearer-token session — one auth system,
 * two transports. */
/**
 * Sessions this process produced by verifying a signed token. Server actions are public
 * POST endpoints whose arguments an attacker can shape freely, so an action that takes an
 * optional `session` would otherwise run as whatever plain object was posted to it. Only an
 * object in this set — one `verifySessionToken` returned in this process — is honoured; a
 * posted object can never be a member, whatever fields it has.
 */
const VERIFIED_SESSIONS = new WeakSet<object>();

/**
 * Whether an explicitly passed session may be used. In the test runner, suites construct
 * sessions directly to exercise actions; nowhere else is an unverified object accepted.
 */
export function isTrustedSession(session: SessionPayload): boolean {
  if (VERIFIED_SESSIONS.has(session)) return true;
  return process.env.NODE_ENV === "test" && process.env.DAYTHREAD_STRICT_SESSIONS !== "1";
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] }));
  } catch {
    return null;
  }
  if (!isSessionClaims(payload)) return null;
  const sv = typeof payload.sv === "number" ? payload.sv : 0;
  // Revocation is checked on every read, not only in requireBusiness: a token issued before
  // a password change, reset or sign-out is dead everywhere, including paths that re-issue
  // a cookie (switching workspace) or read the session directly.
  const user = await prisma.user.findUnique({ where: { id: payload.userId as string }, select: { sessionVersion: true } }).catch(() => null);
  if (!user || (user.sessionVersion ?? 0) !== sv) return null;
  const verified: SessionPayload = {
    userId: payload.userId as string,
    activeBusinessId: typeof payload.activeBusinessId === "string" ? payload.activeBusinessId : undefined,
    sv,
  };
  VERIFIED_SESSIONS.add(verified);
  return verified;
}

/**
 * A session token and nothing else. Tokens issued now carry `typ: "session"`; older ones
 * have no `typ` and are accepted only if they carry none of the claims other signed tokens
 * use (an OAuth state's nonce, provider or purpose).
 */
export function isSessionClaims(payload: Record<string, unknown>): boolean {
  if (typeof payload.userId !== "string") return false;
  if (payload.typ !== undefined) return payload.typ === "session";
  return payload.nonce === undefined && payload.provider === undefined && payload.purpose === undefined && payload.businessId === undefined;
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Mobile equivalent of getSession() — reads `Authorization: Bearer <token>` instead of
 * the httpOnly cookie, since a React Native client can't rely on cookie jars the way a
 * browser does. Same token format, same secret, same verification — just a different
 * transport for the same session. */
export async function getSessionFromRequest(req: Request): Promise<SessionPayload | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return verifySessionToken(header.slice("Bearer ".length));
}

/** Switches the session's active organization — only after verifying the user actually
 * belongs to it. Used by login and the workspace switcher. */
export async function setActiveBusiness(businessId: string) {
  const session = await getSession();
  if (!session) throw new Error("unauthorized");
  // Active membership, not merely membership: somebody the owner has suspended still has a
  // row, and without this they could point their session at a workspace they were removed
  // from. Every read behind that cookie refuses them anyway, so the only thing it bought was
  // a confusing dead end — but the cookie should not have been set in the first place.
  const membership = await prisma.orgMembership.findUnique({
    where: { userId_businessId: { userId: session.userId, businessId } },
  });
  if (!membership || membership.status !== "ACTIVE") throw new Error("not a member of this organization");
  await setSessionCookie({ userId: session.userId, activeBusinessId: businessId, sv: session.sv });
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
export async function requireBusiness(session?: SessionPayload | null) {
  session = session === undefined ? await getSession() : session;
  if (!session) return null;
  // A session handed in as an argument must be one this server verified (see VERIFIED_SESSIONS).
  if (typeof session !== "object" || !isTrustedSession(session)) return null;

  const memberships = await getUserMemberships(session.userId);
  if (memberships.length === 0) return null;
  // A token issued before the last password change / deletion is dead, whatever it says.
  if ((memberships[0].user.sessionVersion ?? 0) !== (session.sv ?? 0)) return null;

  let active = session.activeBusinessId ? memberships.find((m) => m.businessId === session.activeBusinessId) : undefined;

  if (!active) {
    if (memberships.length === 1) {
      active = memberships[0];
      await setSessionCookie({ userId: session.userId, activeBusinessId: active.businessId, sv: session.sv });
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
export async function requireRole(allowedRoles: Role[], session?: SessionPayload | null): Promise<BusinessContext | null> {
  const ctx = await requireBusiness(session);
  if (!ctx) return null;
  if (!allowedRoles.includes(ctx.role)) return null;
  return ctx;
}
