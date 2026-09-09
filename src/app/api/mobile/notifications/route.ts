import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { markNotificationsRead } from "@/app/actions/settings";
export async function GET(req: Request) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const rows = await prisma.notification.findMany({ where: { businessId: ctx.business.id }, orderBy: { createdAt: "desc" }, take: 60 });
  return NextResponse.json({ unread: rows.filter((r) => !r.read).length, notifications: rows.map((n) => ({ id: n.id, title: n.title, body: n.body, read: n.read, createdAt: n.createdAt })) });
}
const schema = z.object({ ids: z.array(z.string()).max(200).optional() });
export async function POST(req: Request) {
  const ctx = await requireMobileBusiness(req);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const parsed = schema.safeParse((await req.json().catch(() => ({}))) ?? {});
  await markNotificationsRead(parsed.success ? parsed.data.ids : undefined, session);
  return NextResponse.json({ ok: true });
}
