import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { ensureReferralCode } from "@/server/referral";
export async function GET(req: Request) {
  const ctx = await requireMobileRole(req, ["OWNER"]);
  if (isErrorResponse(ctx)) return ctx;
  const code = await ensureReferralCode(ctx.business.id);
  return NextResponse.json({ code, url: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://daythread.org"}/?ref=${code}` });
}
