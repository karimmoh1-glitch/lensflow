import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest } from "@/lib/auth";
import { z } from "zod";
import { registerPushToken, unregisterPushToken } from "@/server/push";
import { STAFF_ROLES } from "@/lib/auth";

const schema = z.object({ token: z.string().min(10).max(200) });

export async function POST(req: Request) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("token required", 400);
  const ok = await registerPushToken(ctx.membership.id, parsed.data.token);
  if (!ok) return jsonError("That doesn't look like an Expo push token.", 400);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("token required", 400);
  await unregisterPushToken(ctx.membership.id, parsed.data.token);
  return NextResponse.json({ ok: true });
}
