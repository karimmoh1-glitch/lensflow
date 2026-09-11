import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { z } from "zod";
import { revokeInvitation, resendInvitation } from "@/app/actions/invitations";
const schema = z.object({ action: z.enum(["revoke", "resend"]) });
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileRole(req, ["OWNER", "ADMIN"]);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("action must be revoke or resend", 400);
  try {
    if (parsed.data.action === "revoke") { await revokeInvitation(id, session); return NextResponse.json({ ok: true }); }
    const r = await resendInvitation(id, session); return r.error ? jsonError(r.error, 400) : NextResponse.json({ ok: true, link: r.link, emailed: r.delivery?.emailed ?? false, deliveryNote: r.delivery?.note ?? "" });
  } catch (e) { return jsonError(e instanceof Error && e.message !== "unauthorized" ? e.message : "Not allowed", 403); }
}
