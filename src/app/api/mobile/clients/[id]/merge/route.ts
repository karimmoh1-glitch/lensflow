import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { z } from "zod";
import { mergeClients, dismissMerge } from "@/app/actions/clients";
/** POST { otherId, decision: "merge" | "not_same" } — keeps this person, moves the other's records in, or remembers they're different. */
const schema = z.object({ otherId: z.string(), decision: z.enum(["merge", "not_same"]) });
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileRole(req, ["OWNER", "ADMIN", "PHOTOGRAPHER"]);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("otherId and decision required", 400);
  const r = parsed.data.decision === "merge" ? await mergeClients(id, parsed.data.otherId, session) : await dismissMerge(id, parsed.data.otherId, session);
  return r.ok ? NextResponse.json({ ok: true }) : jsonError(r.error, 400);
}
