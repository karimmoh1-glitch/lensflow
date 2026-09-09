import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { z } from "zod";
import { respondToJoinRequest } from "@/app/actions/joinRequests";
const schema = z.object({ id: z.string(), accept: z.boolean() });
export async function POST(req: Request) {
  const ctx = await requireMobileRole(req, ["OWNER", "ADMIN"]);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("id and accept required", 400);
  try { await respondToJoinRequest(parsed.data.id, parsed.data.accept, session); return NextResponse.json({ ok: true }); } catch (e) { return jsonError(e instanceof Error && e.message !== "unauthorized" ? e.message : "Not allowed", 403); }
}
