import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { z } from "zod";
import { inviteTeammate, invitePartner } from "@/app/actions/invitations";
const schema = z.object({ name: z.string().trim().min(1).max(80), email: z.string().trim().email(), role: z.enum(["teammate", "partner"]).default("teammate") });
export async function POST(req: Request) {
  const ctx = await requireMobileRole(req, ["OWNER", "ADMIN"]);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("A name and a valid email are required.", 400);
  const fd = new FormData(); fd.set("name", parsed.data.name); fd.set("email", parsed.data.email);
  const r = parsed.data.role === "partner" ? await invitePartner(fd, session) : await inviteTeammate(fd, session);
  return r.error ? jsonError(r.error, 400) : NextResponse.json({ ok: true, link: r.link });
}
