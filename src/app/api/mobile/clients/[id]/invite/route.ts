import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { inviteClient } from "@/app/actions/invitations";
import { prisma } from "@/lib/db";
/** Invites this person to the client portal; returns the link to share. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileRole(req, ["OWNER", "ADMIN"]);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;
  const client = await prisma.client.findFirst({ where: { id, businessId: ctx.business.id }, select: { name: true, email: true, phone: true } });
  if (!client) return jsonError("Not found", 404);
  if (!client.email) return jsonError("Add an email address for this person first.", 400);
  const fd = new FormData(); fd.set("name", client.name); fd.set("email", client.email); if (client.phone) fd.set("phone", client.phone);
  const r = await inviteClient(fd, session);
  return r.error ? jsonError(r.error, 400) : NextResponse.json({ ok: true, link: r.link });
}
