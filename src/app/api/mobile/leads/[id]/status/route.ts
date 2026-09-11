import { NextResponse } from "next/server";
import { requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { z } from "zod";
import { setLeadStatus } from "@/app/actions/leads";

const schema = z.object({ status: z.enum(["QUALIFIED", "COLD", "LOST", "CONTACTED"]) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileRole(req, STAFF_ROLES);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("That isn't a stage you can set by hand.", 400);
  const r = await setLeadStatus(id, parsed.data.status, session);
  if (r.error) return jsonError(r.error, 400);
  return NextResponse.json({ ok: true });
}
