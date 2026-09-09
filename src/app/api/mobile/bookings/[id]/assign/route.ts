import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { z } from "zod";
import { assignPartner } from "@/app/actions/bookings";
const schema = z.object({ membershipId: z.string().nullable() });
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileRole(req, ["OWNER", "ADMIN"]);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("membershipId required (or null)", 400);
  try { await assignPartner(id, parsed.data.membershipId, session); return NextResponse.json({ ok: true }); } catch (e) { return jsonError(e instanceof Error ? e.message : "Couldn't assign", 400); }
}
