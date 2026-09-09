import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { z } from "zod";
import { setClientRelationship } from "@/app/actions/conversations";
const schema = z.object({ relationship: z.enum(["LEAD", "CUSTOMER", "CONTACT"]) });
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("relationship must be LEAD, CUSTOMER or CONTACT", 400);
  const r = await setClientRelationship(id, parsed.data.relationship, session);
  return r.error ? jsonError(r.error, 400) : NextResponse.json({ ok: true });
}
