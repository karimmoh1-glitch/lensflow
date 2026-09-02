import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, createSessionToken, getUserMemberships, homeRouteFor } from "@/lib/auth";
import { jsonError } from "@/lib/mobileApi";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Mobile equivalent of src/app/actions/login — same password check, same membership
 * resolution, but returns a bearer token as JSON instead of setting an httpOnly cookie
 * and redirecting (neither of which make sense for a native client).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return jsonError("Enter a valid email and password", 400);

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return jsonError("Incorrect email or password", 401);
  }

  const memberships = await getUserMemberships(user.id);
  if (memberships.length === 0) {
    return jsonError("This account isn't part of any organization yet.", 403);
  }

  // Mobile v1 doesn't have a workspace switcher yet — resolves to the first (oldest)
  // active membership, same tie-break the web app uses when only one membership exists.
  const membership = memberships[0];
  const token = await createSessionToken({ userId: user.id, activeBusinessId: membership.businessId });

  return NextResponse.json({
    token,
    user: { id: user.id, name: user.name, email: user.email },
    business: { id: membership.business.id, name: membership.business.name, onboardingComplete: membership.business.onboardingComplete },
    role: membership.role,
    homeRoute: homeRouteFor(membership.role, membership.business),
  });
}
