import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { z } from "zod";
import { setMembershipStatus, setPartnerConversationAccess } from "@/app/actions/team";
const schema = z.discriminatedUnion("action", [z.object({ action: z.literal("status"), active: z.boolean() }), z.object({ action: z.literal("partnerAccess"), canViewAll: z.boolean() })]);
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileRole(req, ["OWNER", "ADMIN"]);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Unknown action", 400);
  try {
    if (parsed.data.action === "status") await setMembershipStatus(id, parsed.data.active, session);
    else await setPartnerConversationAccess(id, parsed.data.canViewAll, session);
    return NextResponse.json({ ok: true });
  } catch (e) { return jsonError(e instanceof Error && e.message !== "unauthorized" ? e.message : "Not allowed", 403); }
}
