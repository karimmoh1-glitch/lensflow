import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { z } from "zod";
import { updateProfile } from "@/app/actions/settings";
const schema = z.object({ name: z.string().trim().min(1).max(80), workspaceName: z.string().trim().min(1).max(80), timezone: z.string().min(1).max(64) });
export async function PUT(req: Request) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Check the fields.", 400);
  try { const r = await updateProfile(parsed.data, session); return r.error ? jsonError(r.error, 400) : NextResponse.json({ ok: true }); } catch { return jsonError("Not allowed", 403); }
}
