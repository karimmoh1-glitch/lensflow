import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, createSessionToken, homeRouteFor } from "@/lib/auth";
import { uniqueHandle } from "@/app/actions/auth";
import { jsonError } from "@/lib/mobileApi";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

const signupSchema = z.object({
  name: z.string().min(1, "Full name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  businessName: z.string().min(1, "Business name is required"),
  businessType: z.string().optional(),
  phone: z.string().optional(),
});

const TOO_MANY_ATTEMPTS = "Too many attempts. Please wait a few minutes and try again.";

/** Mobile equivalent of src/app/actions/auth.ts signup() — same validation, same
 * user/business/membership creation, returns a bearer token instead of a cookie+redirect.
 * Same per-IP rate limit as the web signup action, to block mass fake-account creation. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const { name, email, password, businessName, businessType, phone } = parsed.data;

  const ip = await getClientIp();
  if (!rateLimit(`mobile-signup:${ip}`, { limit: 8, windowMs: 60 * 60 * 1000 }).ok) {
    return jsonError(TOO_MANY_ATTEMPTS, 429);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return jsonError("An account already exists with this email.", 409);

  let user, business, role;
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
    role = "OWNER" as const;
  } catch {
    return jsonError("Something went wrong creating your account. Please try again.", 500);
  }

  const token = await createSessionToken({ userId: user.id, activeBusinessId: business.id });

  return NextResponse.json({
    token,
    user: { id: user.id, name: user.name, email: user.email },
    business: { id: business.id, name: business.name, onboardingComplete: business.onboardingComplete },
    role,
    homeRoute: homeRouteFor(role, business),
  });
}
