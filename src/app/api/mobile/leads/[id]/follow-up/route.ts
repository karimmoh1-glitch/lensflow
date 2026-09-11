import { NextResponse } from "next/server";
import { requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { z } from "zod";
import { setFollowUp } from "@/app/actions/followUp";

const schema = z.object({ at: z.string().datetime().nullable() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileRole(req, STAFF_ROLES);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Pick a date, or clear it.", 400);
  const r = await setFollowUp(id, parsed.data.at, session);
  if (r.error) return jsonError(r.error, 400);
  return NextResponse.json({ ok: true, followUpAt: r.followUpAt ?? null });
}
