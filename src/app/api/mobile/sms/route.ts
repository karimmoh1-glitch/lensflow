import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { z } from "zod";
import { searchSmsNumbers, claimSmsNumber, releaseSmsNumber } from "@/app/actions/connect";
/** GET ?areaCode= → numbers to choose from; POST { phoneNumber } claims one; DELETE releases the business's number. */
export async function GET(req: Request) {
  const ctx = await requireMobileRole(req, ["OWNER", "ADMIN"]);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const areaCode = new URL(req.url).searchParams.get("areaCode") ?? undefined;
  const r = await searchSmsNumbers(areaCode && /^\d{3}$/.test(areaCode) ? areaCode : undefined, session);
  return r.error ? jsonError(r.error, 400) : NextResponse.json({ numbers: r.numbers });
}
const schema = z.object({ phoneNumber: z.string().min(8).max(20) });
export async function POST(req: Request) {
  const ctx = await requireMobileRole(req, ["OWNER", "ADMIN"]);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("phoneNumber required", 400);
  const r = await claimSmsNumber(parsed.data.phoneNumber, session);
  return r.error ? jsonError(r.error, 400) : NextResponse.json({ ok: true, phoneNumber: r.phoneNumber });
}
export async function DELETE(req: Request) {
  const ctx = await requireMobileRole(req, ["OWNER", "ADMIN"]);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const r = await releaseSmsNumber(session);
  return r.error ? jsonError(r.error, 400) : NextResponse.json({ ok: true });
}
