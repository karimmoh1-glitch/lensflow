import { NextResponse } from "next/server";
import { requireMobileBusiness, isErrorResponse } from "@/lib/mobileApi";

/** Session-restore check for the mobile app: given a stored bearer token, confirms it's
 * still valid and returns who the app is talking to. Also proves organization isolation —
 * the businessId returned here is re-derived from the DB, never trusted from the token alone. */
export async function GET(req: Request) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;

  return NextResponse.json({
    user: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email },
    business: { id: ctx.business.id, name: ctx.business.name, onboardingComplete: ctx.business.onboardingComplete },
    role: ctx.role,
  });
}
