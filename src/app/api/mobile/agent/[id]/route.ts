import { NextResponse } from "next/server";
import { requireMobileBusiness, requireMobileRole, isErrorResponse, jsonError } from "@/lib/mobileApi";
import { getSessionFromRequest, STAFF_ROLES } from "@/lib/auth";
import { z } from "zod";
import { prepareAgentProposal, approveAgentProposal, dismissAgentProposal } from "@/app/actions/agent";
/** GET → the proposal with its draft; POST { decision: "approve", body } sends it through the real channel; POST { decision: "dismiss" } sets it aside. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;
  const r = await prepareAgentProposal(decodeURIComponent(id), session);
  if (!r.allowed) return jsonError("The assistant is part of Daythread Pro.", 402);
  if ("error" in r) return jsonError(r.error, 404);
  return NextResponse.json({ proposal: r.proposal, draft: r.draft });
}
const schema = z.discriminatedUnion("decision", [z.object({ decision: z.literal("approve"), body: z.string().trim().min(1).max(4000) }), z.object({ decision: z.literal("dismiss") })]);
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireMobileRole(req, [...STAFF_ROLES]);
  if (isErrorResponse(ctx)) return ctx;
  const session = await getSessionFromRequest(req);
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("decision required", 400);
  const pid = decodeURIComponent(id);
  if (parsed.data.decision === "dismiss") { const r = await dismissAgentProposal(pid, session); return r.allowed ? NextResponse.json({ ok: true }) : jsonError("The assistant is part of Daythread Pro.", 402); }
  const r = await approveAgentProposal({ proposalId: pid, body: parsed.data.body }, session);
  if (!r.allowed) return jsonError("The assistant is part of Daythread Pro.", 402);
  if (!r.ok) return jsonError(r.error, 400);
  return NextResponse.json({ ok: true, status: r.status, note: r.note });
}
