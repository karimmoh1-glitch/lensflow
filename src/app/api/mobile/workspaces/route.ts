import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { z } from "zod";
import { getUserMemberships, createSessionToken } from "@/lib/auth";
/** GET → every workspace this person belongs to; POST { businessId } → a token for that workspace (membership re-checked). */
export async function GET(req: Request) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;
  const ms = await getUserMemberships(ctx.user.id);
  return NextResponse.json({ current: ctx.business.id, workspaces: ms.map((m) => ({ id: m.business.id, name: m.business.name, role: m.role })) });
}
const schema = z.object({ businessId: z.string() });
export async function POST(req: Request) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("businessId required", 400);
  const ms = await getUserMemberships(ctx.user.id);
  const m = ms.find((x) => x.business.id === parsed.data.businessId);
  if (!m) return jsonError("You're not a member of that workspace.", 403);
  const token = await createSessionToken({ userId: ctx.user.id, activeBusinessId: m.business.id });
  return NextResponse.json({ token, business: { id: m.business.id, name: m.business.name, onboardingComplete: m.business.onboardingComplete }, role: m.role, user: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email } });
}
