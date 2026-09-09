import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { z } from "zod";
import { changePassword } from "@/app/actions/settings";
const schema = z.object({ current: z.string().min(1), next: z.string().min(8).max(200) });
export async function POST(req: Request) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("The new password needs at least 8 characters.", 400);
  try { const r = await changePassword(parsed.data, session); return r.error ? jsonError(r.error, 400) : NextResponse.json({ ok: true }); } catch { return jsonError("Not allowed", 403); }
}
